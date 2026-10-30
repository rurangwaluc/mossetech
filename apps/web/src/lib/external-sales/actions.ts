'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  externalCustomerPayments,
  externalSales,
  suppliers,
} from '@mossetech/db/schema';
import { and, eq, sql } from 'drizzle-orm';

import { requirePermission } from '@/lib/auth/require-permission';
import { lockCurrentOpenDrawer } from '@/lib/cash-drawer/locking';
import { formatMoney, parseMoney } from './money';

export type ExternalSaleDraftState = {
  error?: string;
  externalSaleId?: string;
};

function textValue(
  formData: FormData,
  name: string,
): string {
  const value = formData.get(name);
  return typeof value === 'string'
    ? value.trim()
    : '';
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createExternalSaleDraftAction(
  _previousState: ExternalSaleDraftState,
  formData: FormData,
): Promise<ExternalSaleDraftState> {
  const user = await requirePermission('sales.create');

  const idempotencyKey = textValue(
    formData,
    'idempotencyKey',
  );
  const supplierId = textValue(formData, 'supplierId');
  const productName = textValue(formData, 'productName');
  const customerName = textValue(formData, 'customerName');
  const quantityText = textValue(formData, 'quantity');
  const supplierAmount = textValue(
    formData,
    'agreedSupplierTotal',
  );
  const customerAmount = textValue(
    formData,
    'customerTotal',
  );
  const notes = textValue(formData, 'notes');

  if (
    !UUID_PATTERN.test(idempotencyKey) ||
    !UUID_PATTERN.test(supplierId)
  ) {
    return { error: 'Choose a valid supplier and try again.' };
  }

  if (!productName || productName.length > 180) {
    return { error: 'Enter a valid product name.' };
  }

  if (customerName.length > 160 || notes.length > 2000) {
    return { error: 'Check the customer name or notes.' };
  }

  if (!/^[1-9]\d*$/.test(quantityText)) {
    return { error: 'Enter a valid quantity.' };
  }

  const quantity = Number(quantityText);

  if (!Number.isSafeInteger(quantity) || quantity > 100000) {
    return { error: 'Enter a valid quantity.' };
  }

  let supplierCents: number;
  let customerCents: number;

  try {
    supplierCents = parseMoney(supplierAmount);
    customerCents = parseMoney(customerAmount);
  } catch {
    return { error: 'Enter valid agreed and selling prices.' };
  }

  if (supplierCents <= 0 || customerCents <= 0) {
    return { error: 'Both prices must be above zero.' };
  }

  try {
    return await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({
          id: suppliers.id,
          status: suppliers.status,
        })
        .from(suppliers)
        .where(eq(suppliers.id, supplierId))
        .limit(1);

      if (!supplier || supplier.status !== 'ACTIVE') {
        return { error: 'Choose an active source shop.' };
      }

      const [created] = await tx
        .insert(externalSales)
        .values({
          idempotencyKey,
          supplierId,
          createdByUserId: user.id,
          productName,
          customerName: customerName || null,
          quantity,
          agreedSupplierTotal: formatMoney(supplierCents),
          customerTotal: formatMoney(customerCents),
          status: 'DRAFT',
          notes: notes || null,
        })
        .onConflictDoNothing({
          target: externalSales.idempotencyKey,
        })
        .returning({ id: externalSales.id });

      if (!created) {
        return {
          error: 'This sale was already submitted. Refresh the list before trying again.',
        };
      }

      return { externalSaleId: created.id };
    });
  } catch {
    return {
      error: 'Could not save this sale. Please try again.',
    };
  }
}


/**
 * Complete an existing external-sale draft.
 *
 * This establishes the agreed supplier obligation.
 * Customer receipts and supplier settlements are
 * separate financial operations.
 */
export async function completeExternalSaleAction(
  externalSaleId: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  await requirePermission('sales.create');

  if (!UUID_PATTERN.test(externalSaleId)) {
    return {
      success: false,
      error: 'Invalid external sale.',
    };
  }

  try {
    const completed = await db.transaction(async (tx) => {
      const rows = await tx
        .update(externalSales)
        .set({
          status: 'POSTED',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(externalSales.id, externalSaleId),
            eq(externalSales.status, 'DRAFT'),
          ),
        )
        .returning({
          id: externalSales.id,
        });

      return rows.length === 1;
    });

    if (!completed) {
      return {
        success: false,
        error:
          'This sale is already completed or is no longer available as a draft.',
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Could not complete this sale.',
    };
  }
}


/**
 * Record an actual customer payment for a posted external sale.
 *
 * The external sale row serializes concurrent payment requests.
 * Cash receipts and drawer movements commit together.
 *
 * Do not expose this action until Money and reporting
 * calculations also include external customer payments.
 */
export async function receiveExternalCustomerPaymentAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const user = await requirePermission('sales.create');

  const externalSaleId = textValue(formData, 'externalSaleId');
  const idempotencyKey = textValue(formData, 'idempotencyKey');
  const amountText = textValue(formData, 'amount');
  const paymentMethod = textValue(formData, 'paymentMethod');
  const notes = textValue(formData, 'notes');

  if (
    !UUID_PATTERN.test(externalSaleId) ||
    !UUID_PATTERN.test(idempotencyKey)
  ) {
    return { success: false, error: 'Invalid payment request.' };
  }

  const allowedMethods = [
    'CASH',
    'MOBILE_MONEY',
    'BANK',
    'CARD',
  ] as const;

  if (!allowedMethods.includes(
    paymentMethod as (typeof allowedMethods)[number],
  )) {
    return { success: false, error: 'Choose a payment method.' };
  }

  if (notes.length > 2000) {
    return { success: false, error: 'Payment notes are too long.' };
  }

  let paymentCents: number;

  try {
    paymentCents = parseMoney(amountText);
    if (paymentCents <= 0) {
      throw new Error('Invalid amount.');
    }
  } catch {
    return { success: false, error: 'Enter a valid payment amount.' };
  }

  try {
    return await db.transaction(async (tx) => {
      const [sale] = await tx
        .select({
          id: externalSales.id,
          status: externalSales.status,
          total: externalSales.customerTotal,
        })
        .from(externalSales)
        .where(eq(externalSales.id, externalSaleId))
        .limit(1)
        .for('update');

      if (!sale || sale.status !== 'POSTED') {
        return {
          success: false,
          error: 'Complete the sale before receiving payment.',
        };
      }

      const [existing] = await tx
        .select({ id: externalCustomerPayments.id })
        .from(externalCustomerPayments)
        .where(eq(
          externalCustomerPayments.idempotencyKey,
          idempotencyKey,
        ))
        .limit(1);

      if (existing) {
        return {
          success: false,
          error: 'This payment has already been recorded.',
        };
      }

      const [totals] = await tx
        .select({
          paid: sql<string>`COALESCE(SUM(${externalCustomerPayments.amount}), 0)`,
        })
        .from(externalCustomerPayments)
        .where(eq(
          externalCustomerPayments.externalSaleId,
          externalSaleId,
        ));

      const saleTotalCents = parseMoney(sale.total);
      const paidCents = parseMoney(totals.paid);

      if (paymentCents > saleTotalCents - paidCents) {
        return {
          success: false,
          error: 'Payment exceeds the remaining customer balance.',
        };
      }

      let drawerId: string | null = null;

      if (paymentMethod === 'CASH') {
        const drawer = await lockCurrentOpenDrawer(tx);

        if (!drawer) {
          return {
            success: false,
            error: 'Open the cash drawer before receiving cash.',
          };
        }

        drawerId = drawer.id;
      }

      const [payment] = await tx
        .insert(externalCustomerPayments)
        .values({
          externalSaleId,
          idempotencyKey,
          receivedByUserId: user.id,
          amount: formatMoney(paymentCents),
          paymentMethod: paymentMethod as
            (typeof allowedMethods)[number],
          notes: notes || null,
        })
        .onConflictDoNothing({
          target: externalCustomerPayments.idempotencyKey,
        })
        .returning({ id: externalCustomerPayments.id });

      if (!payment) {
        return {
          success: false,
          error: 'This payment has already been recorded.',
        };
      }

      if (drawerId) {
        await tx.insert(cashDrawerMovements).values({
          drawerId,
          createdByUserId: user.id,
          movementType: 'EXTERNAL_CUSTOMER_PAYMENT',
          direction: 'IN',
          amount: formatMoney(paymentCents),
          externalCustomerPaymentId: payment.id,
          reason: `External sale ${externalSaleId}; payment ${payment.id}`,
        });
      }

      return { success: true };
    });
  } catch {
    return {
      success: false,
      error: 'Could not record payment. Please try again.',
    };
  }
}


/**
 * Update only an unposted external-sale draft.
 * No stock, payment, drawer or supplier-settlement writes.
 */
export async function updateExternalSaleDraftAction(
  _previousState: ExternalSaleDraftState,
  formData: FormData,
): Promise<ExternalSaleDraftState> {
  await requirePermission('sales.create');

  const id = textValue(formData, 'externalSaleId');
  const supplierId = textValue(formData, 'supplierId');
  const productName = textValue(formData, 'productName');
  const customerName = textValue(formData, 'customerName');
  const quantityText = textValue(formData, 'quantity');
  const notes = textValue(formData, 'notes');

  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(supplierId)) {
    return { error: 'Invalid draft or source shop.' };
  }
  if (!productName || productName.length > 180 ||
      customerName.length > 160 || notes.length > 2000) {
    return { error: 'Check the product, customer and notes.' };
  }
  if (!/^[1-9]\d*$/.test(quantityText)) {
    return { error: 'Enter a valid quantity.' };
  }

  const quantity = Number(quantityText);
  if (!Number.isSafeInteger(quantity) || quantity > 100000) {
    return { error: 'Enter a valid quantity.' };
  }

  let sourceCents: number;
  let sellingCents: number;

  try {
    sourceCents = parseMoney(
      textValue(formData, 'agreedSupplierTotal'),
    );
    sellingCents = parseMoney(
      textValue(formData, 'customerTotal'),
    );
    if (sourceCents <= 0 || sellingCents <= 0) {
      return { error: 'Both prices must be above zero.' };
    }
  } catch {
    return { error: 'Enter valid source and selling prices.' };
  }

  try {
    const saved = await db.transaction(async (tx) => {
      const [shop] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(
          eq(suppliers.id, supplierId),
          eq(suppliers.status, 'ACTIVE'),
        ))
        .limit(1);

      if (!shop) return false;

      const updated = await tx
        .update(externalSales)
        .set({
          supplierId,
          productName,
          customerName: customerName || null,
          quantity,
          agreedSupplierTotal: formatMoney(sourceCents),
          customerTotal: formatMoney(sellingCents),
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(externalSales.id, id),
          eq(externalSales.status, 'DRAFT'),
        ))
        .returning({ id: externalSales.id });

      return updated.length === 1;
    });

    if (!saved) {
      return {
        error: 'Draft not updated. Check that the source shop is active and the sale is still a draft.',
      };
    }

    revalidatePath('/sales/external');
    revalidatePath(`/sales/external/${id}`);
    revalidatePath(`/sales/external/${id}/edit`);

    return { externalSaleId: id };
  } catch {
    return { error: 'Could not save the draft. Please try again.' };
  }
}
