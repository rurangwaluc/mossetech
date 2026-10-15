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

type StockDamageFixValues = {
  quantityDamaged: number;
  damageReason: string;
  notes: string | null;
};

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

class StockDamageFixError
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

function damageFixHref(
  damageId: string,
  message: string,
) {
  return `/stock/damaged/${damageId}/fix?error=${encodeURIComponent(
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

function parseDamageFixForm(
  formData: FormData,
):
  | {
      values:
        StockDamageFixValues;
      correctionReason:
        string;
    }
  | {
      error: string;
    } {
  const quantityDamaged =
    Number(
      String(
        formData.get(
          'quantityDamaged',
        ) || '',
      ).trim(),
    );

  if (
    !Number.isInteger(
      quantityDamaged,
    ) ||
    quantityDamaged < 0
  ) {
    return {
      error:
        'Enter a valid damaged quantity.',
    };
  }

  const damageReason =
    String(
      formData.get(
        'damageReason',
      ) || '',
    ).trim();

  if (
    damageReason.length < 2
  ) {
    return {
      error:
        'Choose why the stock was damaged.',
    };
  }

  if (
    damageReason.length > 120
  ) {
    return {
      error:
        'Damage reason is too long.',
    };
  }

  const notes =
    cleanOptional(
      formData.get(
        'notes',
      ),
      1000,
    );

  const correctionReason =
    String(
      formData.get(
        'correctionReason',
      ) || '',
    ).trim();

  if (
    correctionReason.length < 3
  ) {
    return {
      error:
        'Explain what was entered incorrectly.',
    };
  }

  if (
    correctionReason.length >
    1000
  ) {
    return {
      error:
        'Correction reason is too long.',
    };
  }

  return {
    values: {
      quantityDamaged,
      damageReason,
      notes,
    },

    correctionReason,
  };
}

function snapshotToDamageValues(
  snapshot: unknown,
):
  StockDamageFixValues {
  if (
    !snapshot ||
    typeof snapshot !==
      'object' ||
    Array.isArray(snapshot)
  ) {
    throw new StockDamageFixError(
      'This correction request contains invalid damaged-stock information.',
    );
  }

  const record =
    snapshot as Record<
      string,
      unknown
    >;

  const quantityDamaged =
    Number(
      record.quantityDamaged,
    );

  if (
    !Number.isInteger(
      quantityDamaged,
    ) ||
    quantityDamaged < 0
  ) {
    throw new StockDamageFixError(
      'This correction request contains an invalid damaged quantity.',
    );
  }

  const damageReason =
    typeof record.damageReason ===
      'string'
      ? record.damageReason.trim()
      : '';

  if (
    damageReason.length < 2 ||
    damageReason.length > 120
  ) {
    throw new StockDamageFixError(
      'This correction request contains an invalid damage reason.',
    );
  }

  let notes:
    string | null = null;

  if (
    record.notes !== null &&
    record.notes !== undefined
  ) {
    if (
      typeof record.notes !==
      'string'
    ) {
      throw new StockDamageFixError(
        'This correction request contains invalid notes.',
      );
    }

    const cleaned =
      record.notes.trim();

    if (
      cleaned.length > 1000
    ) {
      throw new StockDamageFixError(
        'This correction request contains invalid notes.',
      );
    }

    notes =
      cleaned || null;
  }

  return {
    quantityDamaged,
    damageReason,
    notes,
  };
}

function sameDamageValues(
  first: StockDamageFixValues,
  second: StockDamageFixValues,
) {
  return (
    first.quantityDamaged ===
      second.quantityDamaged &&
    first.damageReason ===
      second.damageReason &&
    first.notes ===
      second.notes
  );
}

function valuesFromDamage(
  damage: {
    quantityDamaged: number;
    reason: string;
    notes: string | null;
  },
): StockDamageFixValues {
  return {
    quantityDamaged:
      damage.quantityDamaged,

    damageReason:
      damage.reason.trim(),

    notes:
      damage.notes?.trim() ||
      null,
  };
}

async function getDamage(
  damageId: string,
) {
  const [damage] =
    await db
      .select({
        id:
          stockDamages.id,

        productId:
          stockDamages.productId,

        productName:
          stockDamages.productName,

        quantityDamaged:
          stockDamages.quantityDamaged,

        reason:
          stockDamages.reason,

        notes:
          stockDamages.notes,

        damagedAt:
          stockDamages.damagedAt,
      })
      .from(stockDamages)
      .where(
        eq(
          stockDamages.id,
          damageId,
        ),
      )
      .limit(1);

  return damage || null;
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
    throw new StockDamageFixError(
      'This correction would make remaining stock negative.',
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

async function applyDamageFix(
  tx: DbTransaction,
  damageId: string,
  expectedBefore:
    StockDamageFixValues,
  after:
    StockDamageFixValues,
) {
  const [initial] =
    await tx
      .select({
        productId:
          stockDamages.productId,
      })
      .from(stockDamages)
      .where(
        eq(
          stockDamages.id,
          damageId,
        ),
      )
      .limit(1);

  if (!initial) {
    throw new StockDamageFixError(
      'This damage record was not found.',
    );
  }

  await tx.execute(sql`
    SELECT id
    FROM products
    WHERE id =
      ${initial.productId}
    FOR UPDATE
  `);

  await tx.execute(sql`
    SELECT id
    FROM stock_damages
    WHERE id =
      ${damageId}
    FOR UPDATE
  `);

  const [damage] =
    await tx
      .select({
        id:
          stockDamages.id,

        productId:
          stockDamages.productId,

        productName:
          stockDamages.productName,

        quantityDamaged:
          stockDamages.quantityDamaged,

        reason:
          stockDamages.reason,

        notes:
          stockDamages.notes,
      })
      .from(stockDamages)
      .where(
        eq(
          stockDamages.id,
          damageId,
        ),
      )
      .limit(1);

  if (!damage) {
    throw new StockDamageFixError(
      'This damage record was not found.',
    );
  }

  const before =
    valuesFromDamage(
      damage,
    );

  if (
    !sameDamageValues(
      before,
      expectedBefore,
    )
  ) {
    throw new StockDamageFixError(
      'This damage record has already changed. Open it again before making another correction.',
    );
  }

  if (
    sameDamageValues(
      before,
      after,
    )
  ) {
    throw new StockDamageFixError(
      'Nothing was changed.',
    );
  }

  await tx
    .update(stockDamages)
    .set({
      quantityDamaged:
        after.quantityDamaged,

      reason:
        after.damageReason,

      notes:
        after.notes,
    })
    .where(
      eq(
        stockDamages.id,
        damage.id,
      ),
    );

  await reconcileProductStock(
    tx,
    damage.productId,
  );

  return {
    productId:
      damage.productId,

    targetLabel:
      damage.productName,

    before,
  };
}

function revalidateDamagePaths(
  damageId?: string,
  productId?: string,
) {
  revalidatePath('/stock');
  revalidatePath('/products');
  revalidatePath('/sales/new');
  revalidatePath('/dashboard');
  revalidatePath('/requests');

  if (damageId) {
    revalidatePath(
      `/stock/damaged/${damageId}/fix`,
    );
  }

  if (productId) {
    revalidatePath(
      `/stock/history/${productId}`,
    );

    revalidatePath(
      `/products/${productId}`,
    );
  }
}

export async function submitStockDamageFixAction(
  formData: FormData,
) {
  const user =
    await requirePermission('stock.correct');

  const damageId =
    String(
      formData.get(
        'damageId',
      ) || '',
    ).trim();

  if (!damageId) {
    redirect('/stock');
  }

  const parsed =
    parseDamageFixForm(
      formData,
    );

  if (
    'error' in parsed
  ) {
    redirect(
      damageFixHref(
        damageId,
        parsed.error,
      ),
    );
  }

  const damage =
    await getDamage(
      damageId,
    );

  if (!damage) {
    redirect(
      damageFixHref(
        damageId,
        'This damage record was not found.',
      ),
    );
  }

  const before =
    valuesFromDamage(
      damage,
    );

  if (
    sameDamageValues(
      before,
      parsed.values,
    )
  ) {
    redirect(
      damageFixHref(
        damageId,
        'Nothing was changed.',
      ),
    );
  }

  if (
    user.role ===
    'EMPLOYEE'
  ) {
    const [
      pending,
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
              'STOCK_DAMAGE',
            ),

            eq(
              corrections.targetId,
              damage.id,
            ),

            eq(
              corrections.status,
              'PENDING',
            ),
          ),
        )
        .limit(1);

    if (pending) {
      redirect(
        damageFixHref(
          damage.id,
          'A correction request for this damage record is already waiting for the owner.',
        ),
      );
    }

    await db
      .insert(corrections)
      .values({
        targetType:
          'STOCK_DAMAGE',

        targetId:
          damage.id,

        targetLabel:
          damage.productName,

        requestedByUserId:
          user.id,

        status:
          'PENDING',

        beforeValues:
          before,

        afterValues:
          parsed.values,

        reason:
          parsed.correctionReason,
      });

    revalidateDamagePaths(
      damage.id,
      damage.productId,
    );

    redirect(
      '/stock?request=1',
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const applied =
          await applyDamageFix(
            tx,
            damage.id,
            before,
            parsed.values,
          );

        const now =
          new Date();

        await tx
          .insert(corrections)
          .values({
            targetType:
              'STOCK_DAMAGE',

            targetId:
              damage.id,

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
              parsed.values,

            reason:
              parsed.correctionReason,

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
      StockDamageFixError
    ) {
      redirect(
        damageFixHref(
          damage.id,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateDamagePaths(
    damage.id,
    damage.productId,
  );

  redirect(
    `/stock/history/${damage.productId}?fixed=1`,
  );
}

export async function approveStockDamageFixRequestAction(
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
      'STOCK_DAMAGE'
  ) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  let before:
    StockDamageFixValues;

  let after:
    StockDamageFixValues;

  try {
    before =
      snapshotToDamageValues(
        request.beforeValues,
      );

    after =
      snapshotToDamageValues(
        request.afterValues,
      );
  } catch (error) {
    if (
      error instanceof
      StockDamageFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  let productId:
    string | null = null;

  try {
    await db.transaction(
      async (tx) => {
        const applied =
          await applyDamageFix(
            tx,
            request.targetId,
            before,
            after,
          );

        productId =
          applied.productId;

        const now =
          new Date();

        const updated =
          await tx
            .update(corrections)
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
          throw new StockDamageFixError(
            'This request has already been reviewed.',
          );
        }
      },
    );
  } catch (error) {
    if (
      error instanceof
      StockDamageFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateDamagePaths(
    request.targetId,
    productId || undefined,
  );

  redirect(
    '/requests?approved=1',
  );
}
