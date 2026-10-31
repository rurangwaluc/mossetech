'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  corrections,
  externalCustomerPayments,
  externalSales,
  externalSupplierSettlements,
} from '@mossetech/db/schema';

import { requireOwner } from '@/lib/auth/session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CancellationResult = {
  success: boolean;
  error?: string;
};

export async function cancelUnpaidExternalSaleAction(
  externalSaleId: string,
  reason: string,
): Promise<CancellationResult> {
  const owner = await requireOwner();

  if (!UUID_PATTERN.test(externalSaleId)) {
    return {
      success: false,
      error: 'Invalid external sale.',
    };
  }

  const explanation = reason.trim();

  if (explanation.length < 10 || explanation.length > 2000) {
    return {
      success: false,
      error: 'Provide a cancellation reason of 10–2000 characters.',
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(externalSales)
        .where(eq(externalSales.id, externalSaleId))
        .limit(1)
        .for('update');

      if (!sale) {
        return {
          success: false,
          error: 'External sale not found.',
        };
      }

      if (sale.status === 'CANCELLED') {
        return {
          success: false,
          error: 'This sale is already cancelled.',
        };
      }

      const [payments, settlements] = await Promise.all([
        tx
          .select({ id: externalCustomerPayments.id })
          .from(externalCustomerPayments)
          .where(eq(
            externalCustomerPayments.externalSaleId,
            externalSaleId,
          ))
          .limit(1),

        tx
          .select({ id: externalSupplierSettlements.id })
          .from(externalSupplierSettlements)
          .where(eq(
            externalSupplierSettlements.externalSaleId,
            externalSaleId,
          ))
          .limit(1),
      ]);

      if (payments.length > 0 || settlements.length > 0) {
        return {
          success: false,
          error:
            'This sale has financial transactions. Reconcile them before cancellation.',
        };
      }

      const now = new Date();

      const beforeValues = {
        kind: 'EXTERNAL_SALE_CANCELLATION_V1',
        saleId: sale.id,
        status: sale.status,
        customerName: sale.customerName,
        productName: sale.productName,
        customerTotal: sale.customerTotal,
        agreedSupplierTotal: sale.agreedSupplierTotal,
      };

      const [updated] = await tx
        .update(externalSales)
        .set({
          status: 'CANCELLED',
          updatedAt: now,
        })
        .where(and(
          eq(externalSales.id, externalSaleId),
          eq(externalSales.status, sale.status),
        ))
        .returning({ id: externalSales.id });

      if (!updated) {
        throw new Error('Concurrent sale modification.');
      }

      await tx.insert(corrections).values({
        targetType: 'EXTERNAL_SALE',
        targetId: sale.id,
        targetLabel: `External sale / ${sale.customerName || 'Walk-in'}`,
        requestedByUserId: owner.id,
        reviewedByUserId: owner.id,
        status: 'APPLIED',
        beforeValues,
        afterValues: {
          ...beforeValues,
          status: 'CANCELLED',
          cancelledAt: now.toISOString(),
          cancelledByUserId: owner.id,
        },
        reason: explanation,
        reviewNote: 'Owner-approved cancellation without financial transactions.',
        reviewedAt: now,
        appliedAt: now,
        updatedAt: now,
      });

      return { success: true };
    });

    if (result.success) {
      revalidatePath('/sales/external');
      revalidatePath(`/sales/external/${externalSaleId}`);
      revalidatePath('/reports');
    }

    return result;
  } catch {
    return {
      success: false,
      error: 'Could not cancel the sale. No changes were applied.',
    };
  }
}
