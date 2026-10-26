'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@mossetech/db/client';
import { customers, products, quotationItems, quotations } from '@mossetech/db/schema';
import { requirePermission } from '@/lib/auth/require-permission';
import { validateMinimumSellingPrices } from '@mossetech/validators/minimum-selling-price';
import { minimumPriceEnforcementEnabled } from '@/lib/sales/minimum-price-rollout';

type State = { error?: string };
type Entry = { productId: string; quantity: number; unitPrice: string };
const moneyPattern = /^\d+(?:\.\d{1,2})?$/;
function cents(raw: string): number | null {
  if (!moneyPattern.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
function amount(value: number) { return (value / 100).toFixed(2); }

export async function createQuotationAction(_state: State, form: FormData): Promise<State> {
  await requirePermission('sales.create');
  const customerId = String(form.get('customerId') || '').trim();
  let customerName = String(form.get('customerName') || '').trim();
  let customerPhone = String(form.get('customerPhone') || '').trim();
  const validUntil = String(form.get('validUntil') || '').trim();
  const notes = String(form.get('notes') || '').trim();
  const discountRaw = String(form.get('discount') || '0').trim();
  const discountCents = cents(discountRaw);
  if (!customerName || customerName.length > 160 || customerPhone.length > 40 || notes.length > 1000) return { error: 'Check the customer details and notes.' };
  if (validUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(`${validUntil}T00:00:00Z`)))) return { error: 'Choose a valid expiry date.' };
  if (discountCents === null) return { error: 'Enter a valid discount.' };
  let entries: Entry[];
  try { entries = JSON.parse(String(form.get('itemsJson') || '[]')); } catch { return { error: 'Check the quotation items.' }; }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 50) return { error: 'Add between 1 and 50 products.' };
  if (entries.some(e => !e || typeof e.productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(e.productId) || !Number.isSafeInteger(e.quantity) || e.quantity < 1 || typeof e.unitPrice !== 'string')) return { error: 'Check item quantities and prices.' };
  const ids = entries.map(e => e.productId);
  if (new Set(ids).size !== ids.length) return { error: 'Each product may appear only once.' };
  const productRows = await db.select().from(products).where(inArray(products.id, ids));
  const lookup = new Map(productRows.map(p => [p.id, p]));
  if (productRows.length !== ids.length || productRows.some(p => p.status !== 'ACTIVE' || p.itemType !== 'PRODUCT')) return { error: 'One or more products are unavailable.' };
  let linkedCustomerId: string | null = null;
  if (customerId) {
    if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { error: 'Invalid customer.' };
    const [found] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.status, 'ACTIVE'))).limit(1);
    if (!found) return { error: 'Selected customer is unavailable.' };
    linkedCustomerId = found.id;
    customerName = found.name;
    customerPhone = found.phone ?? '';
  }
  const lines: Array<{ productId: string; itemName: string; quantity: number; unitPrice: string; lineTotal: string }> = [];
  const checks: Array<{ name: string; quantity: number; agreedUnitPrice: number; minimumUnitPrice: string | null }> = [];
  let subtotalCents = 0;
  for (const entry of entries) {
    const p = lookup.get(entry.productId)!;
    const unitCents = cents(entry.unitPrice.trim());
    if (unitCents === null || unitCents <= 0) return { error: `Invalid price for ${p.name}.` };
    const lineCents = unitCents * entry.quantity;
    subtotalCents += lineCents;
    if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(subtotalCents) || subtotalCents > 99999999999999) return { error: 'Quotation amount is too large.' };
    lines.push({ productId: p.id, itemName: p.name, quantity: entry.quantity, unitPrice: amount(unitCents), lineTotal: amount(lineCents) });
    checks.push({ name: p.name, quantity: entry.quantity, agreedUnitPrice: unitCents / 100, minimumUnitPrice: p.minimumSellingPrice });
  }
  if (discountCents >= subtotalCents) return { error: 'Discount must be less than the subtotal.' };
  if (minimumPriceEnforcementEnabled) {
    const result = validateMinimumSellingPrices(checks, discountCents / 100);
    if (!result.valid) return { error: result.error };
  }
  const id = randomUUID();
  const reference = id.replaceAll('-', '').toUpperCase(); // 32 chars; unique DB constraint
  try {
    await db.transaction(async tx => {
      await tx.insert(quotations).values({ id, reference, customerId: linkedCustomerId, customerName, customerPhone: customerPhone || null, status: 'DRAFT', validUntil: validUntil || null, subtotalAmount: amount(subtotalCents), discountAmount: amount(discountCents), totalAmount: amount(subtotalCents - discountCents), notes: notes || null });
      await tx.insert(quotationItems).values(lines.map(line => ({ quotationId: id, ...line })));
    });
  } catch (error) {
    console.error('Quotation creation failed:', error);
    return { error: 'Could not save the proforma. Please try again.' };
  }
  revalidatePath('/quotations');
  redirect(`/quotations/${id}`);
}
