'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@mossetech/db/client';
import { stockArrivals } from '@mossetech/db/schema';

import { requireOwner } from '@/lib/auth/session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveStockReceiptCostAction(
  formData: FormData,
) {
  // Authorization must happen on the server.
  await requireOwner();

  const receiptId = String(
    formData.get('receiptId') ?? '',
  ).trim();

  const rawCost = String(
    formData.get('buyingPrice') ?? '',
  ).trim();

  if (!UUID_PATTERN.test(receiptId)) {
    throw new Error('Invalid stock receipt.');
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(rawCost) ||
    !Number.isFinite(Number(rawCost)) ||
    Number(rawCost) <= 0 ||
    Number(rawCost) > 9999999999.99
  ) {
    throw new Error(
      'Enter a valid unit acquisition cost greater than zero.',
    );
  }

  const unitCost = Number(rawCost).toFixed(2);

  const productId = await db.transaction(async (tx) => {
    // Lock the receipt for concurrent cost updates.
    await tx.execute(sql`
      SELECT id
      FROM stock_arrivals
      WHERE id = ${receiptId}
      FOR UPDATE
    `);

    const [receipt] = await tx
      .select({
        id: stockArrivals.id,
        productId: stockArrivals.productId,
        buyingPrice: stockArrivals.buyingPrice,
      })
      .from(stockArrivals)
      .where(eq(stockArrivals.id, receiptId))
      .limit(1);

    if (!receipt) {
      throw new Error('Stock receipt not found.');
    }

    if (Number(receipt.buyingPrice) > 0) {
      throw new Error(
        'This receipt already has a confirmed acquisition cost. Use an audited correction workflow.',
      );
    }

    // Financial metadata only.
    // Never update products.quantity or receipt quantities.
    const updated = await tx
      .update(stockArrivals)
      .set({
        buyingPrice: unitCost,
      })
      .where(
        and(
          eq(stockArrivals.id, receiptId),
          eq(stockArrivals.buyingPrice, '0'),
        ),
      )
      .returning({ id: stockArrivals.id });

    if (updated.length !== 1) {
      throw new Error(
        'This receipt cost has already been confirmed.',
      );
    }

    return receipt.productId;
  });

  revalidatePath('/stock');
  revalidatePath(`/stock/history/${productId}`);
  revalidatePath('/reports');
}
