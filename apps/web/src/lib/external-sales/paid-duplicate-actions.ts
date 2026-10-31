'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  corrections,
  externalCustomerPayments,
  externalSales,
  externalSupplierSettlements,
} from '@mossetech/db/schema';

import { requireOwner } from '@/lib/auth/session';

const GENUINE_SALE =
  '09dd0b0a-d68d-4671-afd7-6ac7025a0974';

const DUPLICATE_SALE =
  '80a08afd-14d9-416d-9f52-3b2318e23d15';

const EXPECTED_PAYMENT =
  'a094d55a-593f-446c-b348-3d4b8a34599d';

export async function cancelZechariahDuplicateAction(
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const owner = await requireOwner();

  const explanation = reason.trim();

  if (explanation.length < 20 || explanation.length > 2000) {
    return {
      success: false,
      error: 'Provide a detailed cancellation reason.',
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const sales = await tx
        .select()
        .from(externalSales)
        .where(inArray(externalSales.id, [
          GENUINE_SALE,
          DUPLICATE_SALE,
        ]))
        .orderBy(externalSales.id)
        .for('update');

      if (sales.length !== 2) {
        return {
          success: false,
          error: 'Expected sale records were not found.',
        };
      }

      const genuine = sales.find(
        (sale) => sale.id === GENUINE_SALE,
      );

      const duplicate = sales.find(
        (sale) => sale.id === DUPLICATE_SALE,
      );

      if (!genuine || !duplicate ||
          genuine.status !== 'POSTED' ||
          duplicate.status !== 'POSTED') {
        return {
          success: false,
          error: 'Sale status changed. Correction stopped.',
        };
      }

      const sameTransaction =
        genuine.customerName === duplicate.customerName &&
        genuine.productName === duplicate.productName &&
        genuine.quantity === duplicate.quantity &&
        genuine.supplierId === duplicate.supplierId &&
        genuine.customerTotal === duplicate.customerTotal &&
        genuine.agreedSupplierTotal ===
          duplicate.agreedSupplierTotal;

      if (!sameTransaction ||
          duplicate.customerName !== 'Zechariah' ||
          duplicate.productName !== 'Lenovo Thinkbook' ||
          duplicate.customerTotal !== '735000.00' ||
          duplicate.agreedSupplierTotal !== '680000.00') {
        return {
          success: false,
          error: 'Financial details do not match the verified duplicate.',
        };
      }

      const payments = await tx
        .select()
        .from(externalCustomerPayments)
        .where(eq(
          externalCustomerPayments.externalSaleId,
          DUPLICATE_SALE,
        ));

      const settlements = await tx
        .select({ id: externalSupplierSettlements.id })
        .from(externalSupplierSettlements)
        .where(eq(
          externalSupplierSettlements.externalSaleId,
          DUPLICATE_SALE,
        ));

      if (settlements.length !== 0 ||
          payments.length !== 1 ||
          payments[0].id !== EXPECTED_PAYMENT ||
          payments[0].paymentMethod !== 'MOBILE_MONEY' ||
          payments[0].amount !== '735000.00') {
        return {
          success: false,
          error: 'Unexpected financial records. Correction stopped.',
        };
      }

      const movements = await tx
        .select({ id: cashDrawerMovements.id })
        .from(cashDrawerMovements)
        .where(eq(
          cashDrawerMovements.externalCustomerPaymentId,
          EXPECTED_PAYMENT,
        ));

      if (movements.length !== 0) {
        return {
          success: false,
          error: 'Unexpected cash drawer activity. Correction stopped.',
        };
      }

      const now = new Date();

      const [updated] = await tx
        .update(externalSales)
        .set({
          status: 'CANCELLED',
          updatedAt: now,
        })
        .where(and(
          eq(externalSales.id, DUPLICATE_SALE),
          eq(externalSales.status, 'POSTED'),
        ))
        .returning({ id: externalSales.id });

      if (!updated) {
        throw new Error('Concurrent modification detected.');
      }

      await tx.insert(corrections).values({
        targetType: 'EXTERNAL_SALE',
        targetId: DUPLICATE_SALE,
        targetLabel: 'Zechariah / mistaken duplicate sale',
        requestedByUserId: owner.id,
        reviewedByUserId: owner.id,
        status: 'APPLIED',
        beforeValues: {
          kind: 'EXTERNAL_PAID_DUPLICATE_V1',
          saleId: DUPLICATE_SALE,
          genuineSaleId: GENUINE_SALE,
          status: 'POSTED',
          customerTotal: duplicate.customerTotal,
          supplierTotal: duplicate.agreedSupplierTotal,
          paymentId: EXPECTED_PAYMENT,
          paymentMethod: 'MOBILE_MONEY',
          paymentAmount: payments[0].amount,
        },
        afterValues: {
          kind: 'EXTERNAL_PAID_DUPLICATE_V1',
          saleId: DUPLICATE_SALE,
          genuineSaleId: GENUINE_SALE,
          status: 'CANCELLED',
          paymentId: EXPECTED_PAYMENT,
          paymentPreserved: true,
          paymentReconciliation: 'PENDING',
          cancelledAt: now.toISOString(),
          cancelledByUserId: owner.id,
        },
        reason: explanation,
        reviewNote:
          'Mistaken sale cancelled. Mobile Money receipt preserved; ' +
          'actual receipt and any refund require separate reconciliation.',
        reviewedAt: now,
        appliedAt: now,
        updatedAt: now,
      });

      return { success: true };
    });

    if (result.success) {
      revalidatePath('/sales/external');
      revalidatePath(`/sales/external/${DUPLICATE_SALE}`);
      revalidatePath('/reports');
    }

    return result;
  } catch {
    return {
      success: false,
      error: 'Correction failed. No changes were applied.',
    };
  }
}
