'use server';

import { db } from '@mossetech/db/client';
import { saleItems, sales, warranties } from '@mossetech/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireOwner } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function kigaliDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function issueWarrantyAction(formData: FormData) {
  const user = await requireOwner();

  const saleId = String(formData.get('saleId') ?? '');
  const saleItemId = String(formData.get('saleItemId') ?? '');
  const serialNumber = String(formData.get('serialNumber') ?? '').trim();
  const coverage = String(formData.get('coverage') ?? '').trim();
  const terms = String(formData.get('terms') ?? '').trim();
  const startDate = String(formData.get('startDate') ?? '');
  const expiryDate = String(formData.get('expiryDate') ?? '');
  const quantityText = String(formData.get('coveredQuantity') ?? '');

  if (!UUID.test(saleId) || !UUID.test(saleItemId)) {
    throw new Error('Invalid sale or product.');
  }

  const coveredQuantity = Number(quantityText);

  if (
    !Number.isSafeInteger(coveredQuantity) ||
    coveredQuantity < 1 ||
    serialNumber.length > 160 ||
    coverage.length < 5 ||
    coverage.length > 3000 ||
    terms.length < 5 ||
    terms.length > 5000 ||
    !DATE.test(startDate) ||
    !DATE.test(expiryDate) ||
    !Number.isFinite(Date.parse(startDate)) ||
    !Number.isFinite(Date.parse(expiryDate)) ||
    new Date(startDate).toISOString().slice(0, 10) !== startDate ||
    new Date(expiryDate).toISOString().slice(0, 10) !== expiryDate ||
    expiryDate <= startDate
  ) {
    throw new Error('Check the warranty details and dates.');
  }

  const [sale] = await db.select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);

  const [item] = await db.select()
    .from(saleItems)
    .where(and(
      eq(saleItems.id, saleItemId),
      eq(saleItems.saleId, saleId),
    ))
    .limit(1);

  if (!sale || !item || item.itemType !== 'PRODUCT') {
    throw new Error('Select a product from an existing sale.');
  }

  if (coveredQuantity > item.quantity) {
    throw new Error('Warranty quantity exceeds the quantity sold.');
  }

  const saleDate = kigaliDate(sale.saleDate)

  if (startDate < saleDate) {
    throw new Error('Warranty cannot start before the sale date.');
  }

  const [issued] = await db.insert(warranties).values({
    saleId: sale.id,
    saleItemId: item.id,
    issuedByUserId: user.id,
    customerName: sale.customerName || 'Walk-in customer',
    customerPhone: sale.customerPhone || null,
    productName: item.itemName,
    serialNumber: serialNumber || null,
    coveredQuantity,
    coverage,
    terms,
    startDate,
    expiryDate,
  }).returning({ id: warranties.id });

  redirect(`/sales/${sale.id}?warrantyIssued=1`);
}
