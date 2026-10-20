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

import {
  stockArrivalSchema,
  stockDamageSchema,
} from '@mossetech/validators/stock';

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

type SyncUser = {
  id: string;
};

export class StockSyncError
  extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);

    this.name =
      'StockSyncError';
  }
}

function recordFrom(
  value: unknown,
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    throw new StockSyncError(
      'Invalid stock receipt data.',
      400,
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function optionalString(
  value: unknown,
) {
  return typeof value ===
    'string'
    ? value
    : undefined;
}

function cleanOptional(
  value:
    | string
    | undefined,
) {
  const cleaned =
    value?.trim();

  return cleaned ||
    null;
}

export async function executeStockReceiveSync(
  tx: DbTransaction,
  user: SyncUser,
  payload: unknown,
  clientCreatedAt: Date,
) {
  const input =
    recordFrom(payload);

  const parsed =
    stockArrivalSchema.safeParse({
      productId:
        input.productId,

      quantityReceived:
        input.quantityReceived,

      supplierName:
        optionalString(
          input.supplierName,
        ),

      reference:
        optionalString(
          input.reference,
        ),

      notes:
        optionalString(
          input.notes,
        ),
    });

  if (!parsed.success) {
    throw new StockSyncError(
      parsed.error.issues[0]
        ?.message ||
        'Check the stock receipt.',
    );
  }

  const rawSellingPriceSnapshot =
    input.sellingPriceSnapshot;

  const sellingPriceSnapshot =
    Number(rawSellingPriceSnapshot);

  if (
    rawSellingPriceSnapshot === null ||
    rawSellingPriceSnapshot === undefined ||
    String(rawSellingPriceSnapshot).trim() === '' ||
    !Number.isFinite(sellingPriceSnapshot) ||
    sellingPriceSnapshot < 0
  ) {
    throw new StockSyncError(
      'The product selling price is invalid.',
    );
  }

  /*
   * Serialize stock receiving with sales, damage
   * recording, and stock corrections for this product.
   * Acquire the lock before adding the receipt.
   */
  await tx.execute(sql`
    SELECT id
    FROM products
    WHERE id = ${parsed.data.productId}
    FOR UPDATE
  `);

  const [product] =
    await tx
      .select({
        id:
          products.id,

        name:
          products.name,

        status:
          products.status,

        itemType:
          products.itemType,
      })
      .from(products)
      .where(
        eq(
          products.id,
          parsed.data.productId,
        ),
      )
      .limit(1);

  if (
    !product ||
    product.status !==
      'ACTIVE' ||
    product.itemType !==
      'PRODUCT'
  ) {
    throw new StockSyncError(
      'Product was not found.',
      404,
    );
  }

  const [receipt] =
    await tx
      .insert(
        stockArrivals,
      )
      .values({
        productId:
          product.id,

        receivedByUserId:
          user.id,

        productName:
          product.name,

        quantityReceived:
          parsed.data
            .quantityReceived,

        sellingPriceSnapshot:
          sellingPriceSnapshot.toFixed(
            2,
          ),

        supplierName:
          cleanOptional(
            parsed.data.supplierName,
          ),

        reference:
          cleanOptional(
            parsed.data.reference,
          ),

        notes:
          cleanOptional(
            parsed.data.notes,
          ),

        /*
         * Preserve when the stock was actually
         * recorded on the device, not merely
         * when an offline receipt later synced.
         */
        arrivedAt:
          clientCreatedAt,
      })
      .returning({
        receiptId:
          stockArrivals.id,
      });

  await tx
    .update(products)
    .set({
      quantity: sql`
        ${products.quantity}
        +
        ${parsed.data.quantityReceived}
      `,

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        products.id,
        product.id,
      ),
    );

  return {
    receiptId:
      receipt?.receiptId,

    productId:
      product.id,

    quantityReceived:
      parsed.data
        .quantityReceived,
  };
}


export async function executeStockDamageSync(
  tx: DbTransaction,
  user: SyncUser,
  payload: unknown,
  clientCreatedAt: Date,
) {
  const input =
    recordFrom(payload);

  const parsed =
    stockDamageSchema.safeParse({
      productId:
        input.productId,

      quantityDamaged:
        input.quantityDamaged,

      reason:
        input.reason,

      notes:
        optionalString(
          input.notes,
        ),
    });

  if (!parsed.success) {
    throw new StockSyncError(
      parsed.error.issues[0]
        ?.message ||
        'Check the damaged stock details.',
    );
  }

  /*
   * Serialize stock-changing operations for
   * this product before calculating remaining.
   */
  await tx.execute(sql`
    SELECT id
    FROM products
    WHERE id = ${parsed.data.productId}
    FOR UPDATE
  `);

  const [product] =
    await tx
      .select({
        id:
          products.id,

        name:
          products.name,

        status:
          products.status,

        itemType:
          products.itemType,
      })
      .from(products)
      .where(
        eq(
          products.id,
          parsed.data.productId,
        ),
      )
      .limit(1);

  if (
    !product ||
    product.status !==
      'ACTIVE' ||
    product.itemType !==
      'PRODUCT'
  ) {
    throw new StockSyncError(
      'Product was not found.',
      404,
    );
  }

  const [
    importedResult,
    soldResult,
    damagedResult,
  ] = await Promise.all([
    tx
      .select({
        value:
          sql<string>`
            COALESCE(
              SUM(
                ${stockArrivals.quantityReceived}
              ),
              0
            )
          `,
      })
      .from(stockArrivals)
      .where(
        eq(
          stockArrivals.productId,
          product.id,
        ),
      ),

    tx
      .select({
        value:
          sql<string>`
            COALESCE(
              SUM(
                ${saleItems.quantity}
              ),
              0
            )
          `,
      })
      .from(saleItems)
      .where(
        eq(
          saleItems.productId,
          product.id,
        ),
      ),

    tx
      .select({
        value:
          sql<string>`
            COALESCE(
              SUM(
                ${stockDamages.quantityDamaged}
              ),
              0
            )
          `,
      })
      .from(stockDamages)
      .where(
        eq(
          stockDamages.productId,
          product.id,
        ),
      ),
  ]);

  const imported =
    Number(
      importedResult[0]
        ?.value || 0,
    );

  const sold =
    Number(
      soldResult[0]
        ?.value || 0,
    );

  const damaged =
    Number(
      damagedResult[0]
        ?.value || 0,
    );

  const remaining =
    imported -
    sold -
    damaged;

  if (remaining <= 0) {
    throw new StockSyncError(
      'There is no remaining stock to record as damaged.',
      409,
    );
  }

  if (
    parsed.data.quantityDamaged >
    remaining
  ) {
    throw new StockSyncError(
      `Only ${remaining} ${remaining === 1 ? 'unit is' : 'units are'} currently available.`,
      409,
    );
  }

  const nextRemaining =
    remaining -
    parsed.data.quantityDamaged;

  const [damage] =
    await tx
      .insert(stockDamages)
      .values({
        productId:
          product.id,

        recordedByUserId:
          user.id,

        productName:
          product.name,

        quantityDamaged:
          parsed.data
            .quantityDamaged,

        reason:
          parsed.data.reason,

        notes:
          cleanOptional(
            parsed.data.notes,
          ),

        damagedAt:
          clientCreatedAt,
      })
      .returning({
        damageId:
          stockDamages.id,
      });

  /*
   * Sales still uses products.quantity for
   * availability, so keep it reconciled with
   * the Stock ledgers.
   */
  await tx
    .update(products)
    .set({
      quantity:
        nextRemaining,

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        products.id,
        product.id,
      ),
    );

  return {
    damageId:
      damage?.damageId,

    productId:
      product.id,

    quantityDamaged:
      parsed.data
        .quantityDamaged,

    remaining:
      nextRemaining,
  };
}
