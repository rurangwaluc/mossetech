import {
  eq,
  sql,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
  saleItems,
  stockArrivals,
  stockDamages,
} from '@mossetech/db/schema';

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

export type ProductLedgerTotals = {
  imported: number;
  sold: number;
  damaged: number;
  remaining: number;
};

/*
 * Every Stock mutation already serializes through
 * the product row. Sales must use the same lock so
 * concurrent sales/receipts/damage corrections
 * cannot race each other.
 */
export async function lockProductLedgers(
  tx: DbTransaction,
  productIds: string[],
) {
  const ids = [
    ...new Set(
      productIds,
    ),
  ].sort();

  for (const productId of ids) {
    await tx.execute(sql`
      SELECT id
      FROM products
      WHERE id = ${productId}
      FOR UPDATE
    `);
  }
}

export async function getProductLedgerTotals(
  tx: DbTransaction,
  productId: string,
): Promise<ProductLedgerTotals> {
  const [received] =
    await tx
      .select({
        quantity:
          sql<number>`
            coalesce(
              sum(
                ${stockArrivals.quantityReceived}
              ),
              0
            )::int
          `,
      })
      .from(stockArrivals)
      .where(
        eq(
          stockArrivals.productId,
          productId,
        ),
      );

  const [sold] =
    await tx
      .select({
        quantity:
          sql<number>`
            coalesce(
              sum(
                ${saleItems.quantity}
              ),
              0
            )::int
          `,
      })
      .from(saleItems)
      .where(
        eq(
          saleItems.productId,
          productId,
        ),
      );

  const [damaged] =
    await tx
      .select({
        quantity:
          sql<number>`
            coalesce(
              sum(
                ${stockDamages.quantityDamaged}
              ),
              0
            )::int
          `,
      })
      .from(stockDamages)
      .where(
        eq(
          stockDamages.productId,
          productId,
        ),
      );

  const imported =
    Number(
      received?.quantity || 0,
    );

  const soldQuantity =
    Number(
      sold?.quantity || 0,
    );

  const damagedQuantity =
    Number(
      damaged?.quantity || 0,
    );

  return {
    imported,

    sold:
      soldQuantity,

    damaged:
      damagedQuantity,

    remaining:
      imported -
      soldQuantity -
      damagedQuantity,
  };
}

export async function reconcileProductLedgerQuantity(
  tx: DbTransaction,
  productId: string,
) {
  const totals =
    await getProductLedgerTotals(
      tx,
      productId,
    );

  if (
    totals.remaining < 0
  ) {
    throw new Error(
      'This stock change would make the product balance negative.',
    );
  }

  const updated =
    await tx
      .update(products)
      .set({
        quantity:
          totals.remaining,

        updatedAt:
          new Date(),
      })
      .where(
        eq(
          products.id,
          productId,
        ),
      )
      .returning({
        id:
          products.id,
      });

  if (
    updated.length === 0
  ) {
    throw new Error(
      'One product was not found.',
    );
  }

  return totals;
}
