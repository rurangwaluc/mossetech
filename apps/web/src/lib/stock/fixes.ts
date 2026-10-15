'use server';

import { requirePermission } from '@/lib/auth/require-permission';

import {
  and,
  eq,
  sql,
} from 'drizzle-orm';

import {
  revalidatePath,
} from 'next/cache';

import {
  redirect,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  products,
  saleItems,
  stockArrivals,
  stockDamages,
} from '@mossetech/db/schema';

import {
  requireOwner,
} from '@/lib/auth/session';

type StockFixValues = {
  productId: string;
  productName: string;
  quantityReceived: number;
  supplierName: string | null;
  reference: string | null;
  notes: string | null;
};

type StockFixFormValues = {
  productId: string;
  quantityReceived: number;
  supplierName: string | null;
  reference: string | null;
  notes: string | null;
};

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

class StockFixError
  extends Error {}

function cleanOptional(
  value:
    | FormDataEntryValue
    | null,
  maxLength: number,
) {
  const cleaned =
    String(
      value || '',
    ).trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(
    0,
    maxLength,
  );
}

function fixErrorHref(
  receiptId: string,
  message: string,
) {
  return `/stock/received/${receiptId}/fix?error=${encodeURIComponent(
    message,
  )}`;
}

function requestsErrorHref(
  message: string,
) {
  return `/requests?error=${encodeURIComponent(
    message,
  )}`;
}

function parseFormValues(
  formData: FormData,
):
  | {
      values:
        StockFixFormValues;
      reason: string;
    }
  | {
      error: string;
    } {
  const productId =
    String(
      formData.get(
        'productId',
      ) || '',
    ).trim();

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    !uuidPattern.test(
      productId,
    )
  ) {
    return {
      error:
        'Choose a valid product.',
    };
  }

  const quantityReceived =
    Number(
      String(
        formData.get(
          'quantityReceived',
        ) || '',
      ).trim(),
    );

  if (
    !Number.isInteger(
      quantityReceived,
    ) ||
    quantityReceived < 0
  ) {
    return {
      error:
        'Enter a valid quantity received.',
    };
  }

  const supplierName =
    cleanOptional(
      formData.get(
        'supplierName',
      ),
      160,
    );

  const reference =
    cleanOptional(
      formData.get(
        'reference',
      ),
      120,
    );

  const notes =
    cleanOptional(
      formData.get(
        'notes',
      ),
      1000,
    );

  const reason =
    String(
      formData.get(
        'reason',
      ) || '',
    ).trim();

  if (
    reason.length < 3
  ) {
    return {
      error:
        'Explain why this receipt needs to be corrected.',
    };
  }

  if (
    reason.length > 1000
  ) {
    return {
      error:
        'Correction reason is too long.',
    };
  }

  return {
    values: {
      productId,
      quantityReceived,
      supplierName,
      reference,
      notes,
    },

    reason,
  };
}

function snapshotToValues(
  snapshot: unknown,
  fallbackProduct?: {
    id: string;
    name: string;
  },
): StockFixValues {
  if (
    !snapshot ||
    typeof snapshot !==
      'object' ||
    Array.isArray(snapshot)
  ) {
    throw new StockFixError(
      'This correction request contains invalid stock information.',
    );
  }

  const record =
    snapshot as Record<
      string,
      unknown
    >;

  const productId =
    typeof record.productId ===
      'string' &&
    record.productId.trim()
      ? record.productId.trim()
      : fallbackProduct?.id ||
        '';

  const productName =
    typeof record.productName ===
      'string' &&
    record.productName.trim()
      ? record.productName.trim()
      : fallbackProduct?.name ||
        '';

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    !uuidPattern.test(
      productId,
    ) ||
    !productName ||
    productName.length > 180
  ) {
    throw new StockFixError(
      'This correction request contains invalid product information.',
    );
  }

  const quantityReceived =
    Number(
      record.quantityReceived,
    );

  if (
    !Number.isInteger(
      quantityReceived,
    ) ||
    quantityReceived < 0
  ) {
    throw new StockFixError(
      'This correction request contains an invalid quantity.',
    );
  }

  function nullableText(
    value: unknown,
    maxLength: number,
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    if (
      typeof value !==
      'string'
    ) {
      throw new StockFixError(
        'This correction request contains invalid stock information.',
      );
    }

    const cleaned =
      value.trim();

    if (!cleaned) {
      return null;
    }

    if (
      cleaned.length >
      maxLength
    ) {
      throw new StockFixError(
        'This correction request contains invalid stock information.',
      );
    }

    return cleaned;
  }

  return {
    productId,
    productName,
    quantityReceived,

    supplierName:
      nullableText(
        record.supplierName,
        160,
      ),

    reference:
      nullableText(
        record.reference,
        120,
      ),

    notes:
      nullableText(
        record.notes,
        1000,
      ),
  };
}

function sameValues(
  first: StockFixValues,
  second: StockFixValues,
) {
  return (
    first.productId ===
      second.productId &&
    first.productName ===
      second.productName &&
    first.quantityReceived ===
      second.quantityReceived &&
    first.supplierName ===
      second.supplierName &&
    first.reference ===
      second.reference &&
    first.notes ===
      second.notes
  );
}

async function getCurrentReceipt(
  receiptId: string,
) {
  const [receipt] =
    await db
      .select({
        id:
          stockArrivals.id,

        productId:
          stockArrivals.productId,

        productName:
          stockArrivals.productName,

        quantityReceived:
          stockArrivals.quantityReceived,

        supplierName:
          stockArrivals.supplierName,

        reference:
          stockArrivals.reference,

        notes:
          stockArrivals.notes,
      })
      .from(stockArrivals)
      .where(
        eq(
          stockArrivals.id,
          receiptId,
        ),
      )
      .limit(1);

  return receipt || null;
}

function receiptValues(
  receipt: {
    productId: string;
    productName: string;
    quantityReceived: number;
    supplierName:
      | string
      | null;
    reference:
      | string
      | null;
    notes:
      | string
      | null;
  },
): StockFixValues {
  return {
    productId:
      receipt.productId,

    productName:
      receipt.productName,

    quantityReceived:
      receipt.quantityReceived,

    supplierName:
      receipt.supplierName
        ?.trim() || null,

    reference:
      receipt.reference
        ?.trim() || null,

    notes:
      receipt.notes
        ?.trim() || null,
  };
}

async function getCorrectionProduct(
  productId: string,
  currentProductId: string,
) {
  const [product] =
    await db
      .select({
        id:
          products.id,

        name:
          products.name,

        sellingPrice:
          products.sellingPrice,

        status:
          products.status,

        itemType:
          products.itemType,
      })
      .from(products)
      .where(
        eq(
          products.id,
          productId,
        ),
      )
      .limit(1);

  if (
    !product ||
    product.itemType !==
      'PRODUCT' ||
    (
      product.status !==
        'ACTIVE' &&
      product.id !==
        currentProductId
    )
  ) {
    return null;
  }

  return product;
}

async function reconcileProductStock(
  tx: DbTransaction,
  productId: string,
) {
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
          productId,
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
          productId,
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
          productId,
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

  if (remaining < 0) {
    throw new StockFixError(
      'This correction would reduce imported stock below quantities already sold or damaged.',
    );
  }

  await tx
    .update(products)
    .set({
      quantity:
        remaining,

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        products.id,
        productId,
      ),
    );

  return remaining;
}

async function applyStockReceiptFix(
  tx: DbTransaction,
  receiptId: string,
  expectedBefore:
    StockFixValues,
  after: StockFixValues,
) {
  const [initialReceipt] =
    await tx
      .select({
        productId:
          stockArrivals.productId,
      })
      .from(stockArrivals)
      .where(
        eq(
          stockArrivals.id,
          receiptId,
        ),
      )
      .limit(1);

  if (!initialReceipt) {
    throw new StockFixError(
      'This stock receipt was not found.',
    );
  }

  /*
   * Lock every product ledger involved in a deterministic
   * order so moving a receipt is atomic and safe.
   */
  const lockedProductIds = [
    ...new Set([
      initialReceipt.productId,
      after.productId,
    ]),
  ].sort();

  for (
    const productId
    of lockedProductIds
  ) {
    await tx.execute(sql`
      SELECT id
      FROM products
      WHERE id =
        ${productId}
      FOR UPDATE
    `);
  }

  await tx.execute(sql`
    SELECT id
    FROM stock_arrivals
    WHERE id =
      ${receiptId}
    FOR UPDATE
  `);

  const [receipt] =
    await tx
      .select({
        id:
          stockArrivals.id,

        productId:
          stockArrivals.productId,

        productName:
          stockArrivals.productName,

        quantityReceived:
          stockArrivals.quantityReceived,

        supplierName:
          stockArrivals.supplierName,

        reference:
          stockArrivals.reference,

        notes:
          stockArrivals.notes,
      })
      .from(stockArrivals)
      .where(
        eq(
          stockArrivals.id,
          receiptId,
        ),
      )
      .limit(1);

  if (!receipt) {
    throw new StockFixError(
      'This stock receipt was not found.',
    );
  }

  const before =
    receiptValues(
      receipt,
    );

  if (
    !sameValues(
      before,
      expectedBefore,
    )
  ) {
    throw new StockFixError(
      'This stock receipt has already changed. Open it again before making another correction.',
    );
  }

  if (
    sameValues(
      before,
      after,
    )
  ) {
    throw new StockFixError(
      'Nothing was changed.',
    );
  }

  const [targetProduct] =
    await tx
      .select({
        id:
          products.id,

        name:
          products.name,

        sellingPrice:
          products.sellingPrice,

        status:
          products.status,

        itemType:
          products.itemType,
      })
      .from(products)
      .where(
        eq(
          products.id,
          after.productId,
        ),
      )
      .limit(1);

  if (
    !targetProduct ||
    targetProduct.itemType !==
      'PRODUCT' ||
    (
      targetProduct.status !==
        'ACTIVE' &&
      targetProduct.id !==
        receipt.productId
    )
  ) {
    throw new StockFixError(
      'The selected product is no longer available.',
    );
  }

  const productChanged =
    receipt.productId !==
    targetProduct.id;

  if (
    productChanged &&
    targetProduct.name !==
      after.productName
  ) {
    throw new StockFixError(
      'The selected product has changed since this request was sent. Review the request again.',
    );
  }

  const commonUpdate = {
    productId:
      targetProduct.id,

    productName:
      productChanged
        ? targetProduct.name
        : receipt.productName,

    quantityReceived:
      after.quantityReceived,

    supplierName:
      after.supplierName,

    reference:
      after.reference,

    notes:
      after.notes,
  };

  if (productChanged) {
    /*
     * A receipt moved to another product must carry the
     * corrected product snapshot too. We only have the
     * current selling price for that product, so that becomes
     * the corrected receipt snapshot.
     */
    await tx
      .update(stockArrivals)
      .set({
        ...commonUpdate,

        sellingPriceSnapshot:
          targetProduct.sellingPrice,
      })
      .where(
        eq(
          stockArrivals.id,
          receipt.id,
        ),
      );
  } else {
    /*
     * If the product did not change, preserve the original
     * historical selling-price snapshot.
     */
    await tx
      .update(stockArrivals)
      .set(
        commonUpdate,
      )
      .where(
        eq(
          stockArrivals.id,
          receipt.id,
        ),
      );
  }

  /*
   * Reconcile the original ledger after the receipt has moved.
   * If previously sold/damaged quantities would make it
   * negative, this throws and the whole transaction rolls back.
   */
  await reconcileProductStock(
    tx,
    receipt.productId,
  );

  if (productChanged) {
    await reconcileProductStock(
      tx,
      targetProduct.id,
    );
  }

  return {
    targetLabel:
      productChanged
        ? `${receipt.productName} → ${targetProduct.name}`
        : receipt.productName,

    before,

    affectedProductIds:
      productChanged
        ? [
            receipt.productId,
            targetProduct.id,
          ]
        : [
            receipt.productId,
          ],
  };
}

function revalidateStockFixPaths(
  receiptId?: string,
  productIds:
    string[] = [],
) {
  revalidatePath('/stock');
  revalidatePath('/products');
  revalidatePath('/sales/new');
  revalidatePath('/dashboard');
  revalidatePath('/requests');

  if (receiptId) {
    revalidatePath(
      `/stock/received/${receiptId}/fix`,
    );
  }

  for (
    const productId
    of new Set(
      productIds,
    )
  ) {
    revalidatePath(
      `/stock/history/${productId}`,
    );

    revalidatePath(
      `/products/${productId}`,
    );
  }
}

export async function submitStockFixAction(
  formData: FormData,
) {
  const user =
    await requirePermission('stock.correct');

  const receiptId =
    String(
      formData.get(
        'receiptId',
      ) || '',
    ).trim();

  if (!receiptId) {
    redirect('/stock');
  }

  const parsed =
    parseFormValues(
      formData,
    );

  if (
    'error' in parsed
  ) {
    redirect(
      fixErrorHref(
        receiptId,
        parsed.error,
      ),
    );
  }

  const receipt =
    await getCurrentReceipt(
      receiptId,
    );

  if (!receipt) {
    redirect(
      fixErrorHref(
        receiptId,
        'This stock receipt was not found.',
      ),
    );
  }

  const selectedProduct =
    await getCorrectionProduct(
      parsed.values.productId,
      receipt.productId,
    );

  if (!selectedProduct) {
    redirect(
      fixErrorHref(
        receiptId,
        'Choose an available product.',
      ),
    );
  }

  const before =
    receiptValues(
      receipt,
    );

  const after:
    StockFixValues = {
      productId:
        selectedProduct.id,

      /*
       * Keep the existing receipt snapshot when correcting
       * another field on the same product. Only a product move
       * receives the selected product's current name.
       */
      productName:
        selectedProduct.id ===
        receipt.productId
          ? receipt.productName
          : selectedProduct.name,

      quantityReceived:
        parsed.values
          .quantityReceived,

      supplierName:
        parsed.values
          .supplierName,

      reference:
        parsed.values
          .reference,

      notes:
        parsed.values
          .notes,
    };

  if (
    sameValues(
      before,
      after,
    )
  ) {
    redirect(
      fixErrorHref(
        receiptId,
        'Nothing was changed.',
      ),
    );
  }

  if (
    user.role ===
    'EMPLOYEE'
  ) {
    const [
      existingRequest,
    ] =
      await db
        .select({
          id:
            corrections.id,
        })
        .from(corrections)
        .where(
          and(
            eq(
              corrections.targetType,
              'STOCK_RECEIPT',
            ),

            eq(
              corrections.targetId,
              receiptId,
            ),

            eq(
              corrections.status,
              'PENDING',
            ),
          ),
        )
        .limit(1);

    if (
      existingRequest
    ) {
      redirect(
        fixErrorHref(
          receiptId,
          'A correction request for this receipt is already waiting for the owner.',
        ),
      );
    }

    await db
      .insert(corrections)
      .values({
        targetType:
          'STOCK_RECEIPT',

        targetId:
          receiptId,

        targetLabel:
          receipt.productName,

        requestedByUserId:
          user.id,

        status:
          'PENDING',

        beforeValues:
          before,

        afterValues:
          after,

        reason:
          parsed.reason,
      });

    revalidateStockFixPaths(
      receiptId,
      [
        receipt.productId,
        after.productId,
      ],
    );

    redirect(
      '/stock?request=1',
    );
  }

  let affectedProductIds =
    [
      receipt.productId,
    ];

  try {
    await db.transaction(
      async (tx) => {
        const applied =
          await applyStockReceiptFix(
            tx,
            receiptId,
            before,
            after,
          );

        affectedProductIds =
          applied
            .affectedProductIds;

        const now =
          new Date();

        await tx
          .insert(corrections)
          .values({
            targetType:
              'STOCK_RECEIPT',

            targetId:
              receiptId,

            targetLabel:
              applied.targetLabel,

            requestedByUserId:
              user.id,

            reviewedByUserId:
              user.id,

            status:
              'APPLIED',

            beforeValues:
              applied.before,

            afterValues:
              after,

            reason:
              parsed.reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      StockFixError
    ) {
      redirect(
        fixErrorHref(
          receiptId,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateStockFixPaths(
    receiptId,
    affectedProductIds,
  );

  redirect(
    '/stock?fixed=1',
  );
}

export async function approveStockFixRequestAction(
  formData: FormData,
) {
  const owner =
    await requireOwner();

  const correctionId =
    String(
      formData.get(
        'correctionId',
      ) || '',
    ).trim();

  if (!correctionId) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  const [request] =
    await db
      .select()
      .from(corrections)
      .where(
        and(
          eq(
            corrections.id,
            correctionId,
          ),

          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  if (
    !request ||
    request.targetType !==
      'STOCK_RECEIPT'
  ) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  /*
   * Used only as a fallback for an older pending request
   * created before receipt-product correction existed.
   */
  const currentReceipt =
    await getCurrentReceipt(
      request.targetId,
    );

  if (!currentReceipt) {
    redirect(
      requestsErrorHref(
        'This stock receipt was not found.',
      ),
    );
  }

  let before:
    StockFixValues;

  let after:
    StockFixValues;

  try {
    const fallbackProduct = {
      id:
        currentReceipt.productId,

      name:
        currentReceipt.productName,
    };

    before =
      snapshotToValues(
        request.beforeValues,
        fallbackProduct,
      );

    after =
      snapshotToValues(
        request.afterValues,
        fallbackProduct,
      );
  } catch (error) {
    if (
      error instanceof
      StockFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  let affectedProductIds =
    [
      currentReceipt.productId,
    ];

  try {
    await db.transaction(
      async (tx) => {
        const applied =
          await applyStockReceiptFix(
            tx,
            request.targetId,
            before,
            after,
          );

        affectedProductIds =
          applied
            .affectedProductIds;

        const now =
          new Date();

        const updated =
          await tx
            .update(
              corrections,
            )
            .set({
              status:
                'APPLIED',

              reviewedByUserId:
                owner.id,

              reviewedAt:
                now,

              appliedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  corrections.id,
                  request.id,
                ),

                eq(
                  corrections.status,
                  'PENDING',
                ),
              ),
            )
            .returning({
              id:
                corrections.id,
            });

        if (
          updated.length ===
          0
        ) {
          throw new StockFixError(
            'This request has already been reviewed.',
          );
        }
      },
    );
  } catch (error) {
    if (
      error instanceof
      StockFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateStockFixPaths(
    request.targetId,
    affectedProductIds,
  );

  redirect(
    '/requests?approved=1',
  );
}

export async function rejectStockFixRequestAction(
  formData: FormData,
) {
  const owner =
    await requireOwner();

  const correctionId =
    String(
      formData.get(
        'correctionId',
      ) || '',
    ).trim();

  if (!correctionId) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  const now =
    new Date();

  const rejected =
    await db
      .update(corrections)
      .set({
        status:
          'REJECTED',

        reviewedByUserId:
          owner.id,

        reviewedAt:
          now,

        updatedAt:
          now,
      })
      .where(
        and(
          eq(
            corrections.id,
            correctionId,
          ),

          eq(
            corrections.status,
            'PENDING',
          ),

          eq(
            corrections.targetType,
            'STOCK_RECEIPT',
          ),
        ),
      )
      .returning({
        id:
          corrections.id,
      });

  if (
    rejected.length ===
    0
  ) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  revalidateStockFixPaths();

  redirect(
    '/requests?rejected=1',
  );
}
