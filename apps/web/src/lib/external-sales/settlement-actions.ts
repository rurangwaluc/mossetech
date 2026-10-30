'use server';

import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  externalSales,
  externalSupplierSettlements,
} from '@mossetech/db/schema';
import { eq, sql } from 'drizzle-orm';

import { requireOwner } from '@/lib/auth/session';
import {
  getLockedCurrentDrawerState,
} from '@/lib/cash-drawer/locking';

import { formatMoney, parseMoney } from './money';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SettlementResult = {
  success: boolean;
  error?: string;
};

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Record one cash payment to an external supplier.
 *
 * Not connected to the UI until financial integration
 * and concurrent transaction tests are complete.
 */
export async function payExternalSupplierAction(
  formData: FormData,
): Promise<SettlementResult> {
  const user = await requireOwner();

  const externalSaleId = field(formData, 'externalSaleId');
  const supplierId = field(formData, 'supplierId');
  const idempotencyKey = field(formData, 'idempotencyKey');
  const amountText = field(formData, 'amount');
  const paymentMethod = field(formData, 'paymentMethod');
  const notes = field(formData, 'notes');

  if (
    !UUID_PATTERN.test(externalSaleId) ||
    !UUID_PATTERN.test(supplierId) ||
    !UUID_PATTERN.test(idempotencyKey)
  ) {
    return { success: false, error: 'Invalid supplier payment.' };
  }

  if (paymentMethod !== 'CASH') {
    return {
      success: false,
      error: 'This payment method is not yet available.',
    };
  }

  if (notes.length > 2000) {
    return { success: false, error: 'Notes are too long.' };
  }

  let paymentCents: number;

  try {
    paymentCents = parseMoney(amountText);

    if (paymentCents <= 0) {
      throw new Error('Invalid payment amount.');
    }
  } catch {
    return { success: false, error: 'Enter a valid amount.' };
  }

  try {
    return await db.transaction(async (tx) => {
      // Serialize all settlements against the sale row.
      const [sale] = await tx
        .select({
          id: externalSales.id,
          supplierId: externalSales.supplierId,
          status: externalSales.status,
          supplierTotal: externalSales.agreedSupplierTotal,
        })
        .from(externalSales)
        .where(eq(externalSales.id, externalSaleId))
        .limit(1)
        .for('update');

      if (!sale || sale.status !== 'POSTED') {
        return {
          success: false,
          error: 'Complete the external sale first.',
        };
      }

      if (sale.supplierId !== supplierId) {
        return {
          success: false,
          error: 'The source shop does not match this sale.',
        };
      }

      const [existing] = await tx
        .select({ id: externalSupplierSettlements.id })
        .from(externalSupplierSettlements)
        .where(
          eq(
            externalSupplierSettlements.idempotencyKey,
            idempotencyKey,
          ),
        )
        .limit(1);

      if (existing) {
        return {
          success: false,
          error: 'This supplier payment is already recorded.',
        };
      }

      const [totals] = await tx
        .select({
          paid: sql<string>`COALESCE(SUM(${externalSupplierSettlements.amount}), 0)`,
        })
        .from(externalSupplierSettlements)
        .where(
          eq(
            externalSupplierSettlements.externalSaleId,
            externalSaleId,
          ),
        );

      const supplierTotalCents = parseMoney(sale.supplierTotal);
      const alreadyPaidCents = parseMoney(totals.paid);

      if (
        paymentCents >
        supplierTotalCents - alreadyPaidCents
      ) {
        return {
          success: false,
          error: 'Payment exceeds the amount owed to this shop.',
        };
      }

      // Lock the active drawer and verify physical cash.
      const drawerState = await getLockedCurrentDrawerState(tx);

      if (!drawerState) {
        return {
          success: false,
          error: 'Open the cash drawer before paying cash.',
        };
      }

      const availableCashCents = Math.round(
        drawerState.expectedCash * 100,
      );

      if (
        !Number.isSafeInteger(availableCashCents) ||
        paymentCents > availableCashCents
      ) {
        return {
          success: false,
          error: 'Not enough cash in the drawer.',
        };
      }

      const [settlement] = await tx
        .insert(externalSupplierSettlements)
        .values({
          idempotencyKey,
          externalSaleId,
          supplierId,
          paidByUserId: user.id,
          amount: formatMoney(paymentCents),
          paymentMethod: 'CASH',
          notes: notes || null,
        })
        .onConflictDoNothing({
          target: externalSupplierSettlements.idempotencyKey,
        })
        .returning({ id: externalSupplierSettlements.id });

      if (!settlement) {
        return {
          success: false,
          error: 'This supplier payment is already recorded.',
        };
      }

      await tx.insert(cashDrawerMovements).values({
        drawerId: drawerState.drawer.id,
        createdByUserId: user.id,
        movementType: 'EXTERNAL_SUPPLIER_PAYMENT',
        direction: 'OUT',
        amount: formatMoney(paymentCents),
        externalSupplierSettlementId: settlement.id,
        reason: `External sale ${externalSaleId}; settlement ${settlement.id}`,
      });

      return { success: true };
    });
  } catch {
    return {
      success: false,
      error: 'Could not record supplier payment.',
    };
  }
}
