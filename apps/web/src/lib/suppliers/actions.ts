'use server';

import { db } from '@mossetech/db/client';
import { eq, sql } from 'drizzle-orm';
import {
  suppliers,
  supplierPayments,
  stockArrivals,
} from '@mossetech/db/schema';
import { requireOwner } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().max(160),
  phone: z.string().trim().max(40),
  email: z.union([
    z.literal(''),
    z.email().max(180),
  ]),
  address: z.string().trim().max(1000),
  notes: z.string().trim().max(2000),
});

export async function createSupplierAction(formData: FormData) {
  await requireOwner();

  const parsed = supplierSchema.safeParse(
    Object.fromEntries(
      ['name', 'contactPerson', 'phone', 'email', 'address', 'notes']
        .map((key) => [key, String(formData.get(key) ?? '')]),
    ),
  );

  if (!parsed.success) {
    throw new Error('Check the supplier information.');
  }

  const value = parsed.data;

  const [supplier] = await db.insert(suppliers).values({
    name: value.name,
    contactPerson: value.contactPerson || null,
    phone: value.phone || null,
    email: value.email || null,
    address: value.address || null,
    notes: value.notes || null,
  }).returning({ id: suppliers.id });

  redirect(`/suppliers/${supplier.id}`);
}


export async function updateSupplierAction(formData: FormData) {
  await requireOwner();

  const supplierId = String(formData.get('supplierId') ?? '');

  if (!z.uuid().safeParse(supplierId).success) {
    throw new Error('Invalid supplier.');
  }

  const parsed = supplierSchema.safeParse(
    Object.fromEntries(
      ['name', 'contactPerson', 'phone', 'email', 'address', 'notes']
        .map((key) => [key, String(formData.get(key) ?? '')]),
    ),
  );

  if (!parsed.success) {
    throw new Error('Check the supplier information.');
  }

  const value = parsed.data;

  const updated = await db
    .update(suppliers)
    .set({
      name: value.name,
      contactPerson: value.contactPerson || null,
      phone: value.phone || null,
      email: value.email || null,
      address: value.address || null,
      notes: value.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, supplierId))
    .returning({ id: suppliers.id });

  if (updated.length !== 1) {
    throw new Error('Supplier not found.');
  }

  redirect(`/suppliers/${supplierId}`);
}


export async function recordSupplierPaymentAction(formData: FormData) {
  await requireOwner();

  const supplierId = String(formData.get('supplierId') ?? '');
  const amountText = String(formData.get('amount') ?? '').trim();
  const paymentMethod = String(formData.get('paymentMethod') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();

  if (!z.uuid().safeParse(supplierId).success) {
    throw new Error('Invalid supplier.');
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(amountText) ||
    Number(amountText) <= 0 ||
    Number(amountText) > 9999999999.99
  ) {
    throw new Error('Enter a valid payment amount.');
  }

  const validMethods = [
    'CASH',
    'MOBILE_MONEY',
    'BANK',
    'CARD',
  ] as const;

  if (!validMethods.includes(paymentMethod as typeof validMethods[number])) {
    throw new Error('Choose a valid payment method.');
  }

  if (notes.length > 2000) {
    throw new Error('Payment notes are too long.');
  }

  await db.transaction(async (tx) => {
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1)
      .for('update');

    if (!supplier) {
      throw new Error('Supplier not found.');
    }

    const [purchases] = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${stockArrivals.supplierAmountOwed}), 0)`,
      })
      .from(stockArrivals)
      .where(eq(stockArrivals.supplierId, supplierId));

    const [payments] = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${supplierPayments.amount}), 0)`,
      })
      .from(supplierPayments)
      .where(eq(supplierPayments.supplierId, supplierId));

    const remaining =
      Math.round(
        (Number(purchases.total) - Number(payments.total)) * 100,
      );

    const paymentCents = Math.round(Number(amountText) * 100);

    if (paymentCents > remaining) {
      throw new Error('Payment exceeds the outstanding balance.');
    }

    await tx.insert(supplierPayments).values({
      supplierId,
      amount: Number(amountText).toFixed(2),
      paymentMethod: paymentMethod as typeof validMethods[number],
      notes: notes || null,
    });
  });

  redirect(`/suppliers/${supplierId}`);
}
