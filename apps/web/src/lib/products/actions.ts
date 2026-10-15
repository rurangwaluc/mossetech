'use server';

import { requirePermission } from '@/lib/auth/require-permission';

import {
  randomUUID,
} from 'node:crypto';

import {
  and,
  eq,
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
  type Product,
} from '@mossetech/db/schema';

import {
  productFormSchema,
  type ProductFormInput,
} from '@mossetech/validators/product';

import {
  requireOwner,
} from '@/lib/auth/session';

export type ProductState = {
  error?: string;
  success?: boolean;
  productId?: string;
  requestSent?: boolean;
  completionId?: string;
};

type ProductChangeValues = {
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  minQuantity: number;
  notes: string | null;
};

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ProductChangeError
  extends Error {}

function cleanOptional(
  value: string | undefined,
) {
  const cleaned =
    value?.trim();

  return cleaned
    ? cleaned
    : null;
}

function getFormValues(
  formData: FormData,
) {
  return {
    itemType: 'PRODUCT',
    name:
      formData.get('name'),
    category:
      formData.get('category'),
    unit:
      formData.get('unit'),
    sellingPrice:
      formData.get(
        'sellingPrice',
      ) || '',
    minQuantity:
      formData.get(
        'minQuantity',
      ),
    notes:
      formData.get('notes') ||
      undefined,
  };
}

function valuesFromParsed(
  value: ProductFormInput,
): ProductChangeValues {
  return {
    name: value.name,
    category: value.category,
    unit: value.unit,
    sellingPrice:
      Number(
        value.sellingPrice,
      ),
    minQuantity:
      Number(
        value.minQuantity,
      ),
    notes:
      cleanOptional(
        value.notes,
      ),
  };
}

function valuesFromProduct(
  product: Product,
): ProductChangeValues {
  return {
    name: product.name,
    category:
      product.category,
    unit: product.unit,
    sellingPrice:
      Number(
        product.sellingPrice,
      ),
    minQuantity:
      product.minQuantity,
    notes:
      product.notes?.trim() ||
      null,
  };
}

function valuesFromSnapshot(
  value: unknown,
): ProductChangeValues {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new ProductChangeError(
      'This request has invalid product details.',
    );
  }

  const snapshot =
    value as Record<
      string,
      unknown
    >;

  const parsed =
    productFormSchema.safeParse({
      itemType: 'PRODUCT',
      name: snapshot.name,
      category:
        snapshot.category,
      unit: snapshot.unit,
      sellingPrice:
        String(
          snapshot.sellingPrice ??
            '',
        ),
      minQuantity:
        String(
          snapshot.minQuantity ??
            '',
        ),
      notes:
        snapshot.notes ??
        undefined,
    });

  if (!parsed.success) {
    throw new ProductChangeError(
      'This request has invalid product details.',
    );
  }

  return valuesFromParsed(
    parsed.data,
  );
}

function sameProductValues(
  first: ProductChangeValues,
  second: ProductChangeValues,
) {
  return (
    JSON.stringify(first) ===
    JSON.stringify(second)
  );
}

async function applyProductValues(
  tx: DbTransaction,
  productId: string,
  values: ProductChangeValues,
) {
  await tx
    .update(products)
    .set({
      name: values.name,
      category:
        values.category,
      unit: values.unit,
      sellingPrice:
        values.sellingPrice.toFixed(
          2,
        ),
      minQuantity:
        values.minQuantity,
      notes: values.notes,
      updatedAt:
        new Date(),
    })
    .where(
      eq(
        products.id,
        productId,
      ),
    );
}

function revalidateProductPaths() {
  revalidatePath(
    '/products',
  );

  revalidatePath(
    '/stock',
  );

  revalidatePath(
    '/stock/receive',
  );

  revalidatePath(
    '/sales/new',
  );

  revalidatePath(
    '/dashboard',
  );

  revalidatePath(
    '/requests',
  );
}

function requestErrorHref(
  message: string,
) {
  return `/requests?error=${encodeURIComponent(
    message,
  )}`;
}

export async function createProductAction(
  _previousState: ProductState,
  formData: FormData,
): Promise<ProductState> {
  await requirePermission('products.create');

  const parsed =
    productFormSchema.safeParse(
      getFormValues(
        formData,
      ),
    );

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]
          ?.message ||
        'Check the product details.',
    };
  }

  const suppliedProductId =
    String(
      formData.get(
        'productId',
      ) || '',
    ).trim();

  if (
    suppliedProductId &&
    !PRODUCT_ID_PATTERN.test(
      suppliedProductId,
    )
  ) {
    return {
      error:
        'Invalid product ID.',
    };
  }

  const productId =
    suppliedProductId ||
    randomUUID();

  const values =
    valuesFromParsed(
      parsed.data,
    );

  try {
    await db.transaction(
      async (tx) => {
        const inserted =
          await tx
            .insert(products)
            .values({
              id: productId,

              itemType:
                'PRODUCT',

              name:
                values.name,

              category:
                values.category,

              unit:
                values.unit,

              sellingPrice:
                values.sellingPrice.toFixed(
                  2,
                ),

              minQuantity:
                values.minQuantity,

              notes:
                values.notes,

              status:
                'ACTIVE',
            })
            .onConflictDoNothing({
              target:
                products.id,
            })
            .returning({
              id: products.id,
            });

        if (
          inserted.length > 0
        ) {
          return;
        }

        const [existing] =
          await tx
            .select()
            .from(products)
            .where(
              eq(
                products.id,
                productId,
              ),
            )
            .limit(1);

        if (
          !existing ||
          existing.status !==
            'ACTIVE' ||
          existing.itemType !==
            'PRODUCT' ||
          !sameProductValues(
            valuesFromProduct(
              existing,
            ),
            values,
          )
        ) {
          throw new ProductChangeError(
            'This product could not be saved. Refresh and try again.',
          );
        }
      },
    );
  } catch (error) {
    if (
      error instanceof
      ProductChangeError
    ) {
      return {
        error:
          error.message,
      };
    }

    throw error;
  }

  revalidateProductPaths();

  return {
    success: true,
    productId,
    completionId:
      randomUUID(),
  };
}

export async function updateProductAction(
  productId: string,
  _previousState: ProductState,
  formData: FormData,
): Promise<ProductState> {
  const user =
    await requirePermission('products.edit');

  const parsed =
    productFormSchema.safeParse(
      getFormValues(
        formData,
      ),
    );

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]
          ?.message ||
        'Check the product details.',
    };
  }

  const reason =
    String(
      formData.get(
        'reason',
      ) || '',
    ).trim();

  const hasImageChange =
    formData.get(
      'hasImageChange',
    ) === '1';

  if (
    reason.length < 3
  ) {
    return {
      error:
        user.role === 'OWNER'
          ? 'Tell us why you are changing this.'
          : 'Tell the owner what needs changing.',
    };
  }

  const [product] =
    await db
      .select()
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
    product.status !==
      'ACTIVE' ||
    product.itemType !==
      'PRODUCT'
  ) {
    return {
      error:
        'Product was not found.',
    };
  }

  const before =
    valuesFromProduct(
      product,
    );

  const after =
    valuesFromParsed(
      parsed.data,
    );

  const productDetailsChanged =
    !sameProductValues(
      before,
      after,
    );

  if (
    !productDetailsChanged &&
    !hasImageChange
  ) {
    return {
      error:
        'Nothing was changed.',
    };
  }

  if (
    user.role === 'EMPLOYEE' &&
    hasImageChange
  ) {
    return {
      error:
        'Ask the owner to change the product photo.',
    };
  }

  const [
    stockUse,
    saleUse,
    pendingRequest,
  ] = await Promise.all([
    db
      .select({
        id:
          stockArrivals.id,
      })
      .from(
        stockArrivals,
      )
      .where(
        eq(
          stockArrivals.productId,
          productId,
        ),
      )
      .limit(1),

    db
      .select({
        id:
          saleItems.id,
      })
      .from(saleItems)
      .where(
        eq(
          saleItems.productId,
          productId,
        ),
      )
      .limit(1),

    db
      .select({
        id:
          corrections.id,
      })
      .from(corrections)
      .where(
        and(
          eq(
            corrections.targetType,
            'PRODUCT',
          ),
          eq(
            corrections.targetId,
            productId,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1),
  ]);

  const unitLocked =
    stockUse.length > 0 ||
    saleUse.length > 0;

  if (
    unitLocked &&
    before.unit !==
      after.unit
  ) {
    return {
      error:
        'Unit cannot be changed after stock or sales have been recorded.',
    };
  }

  if (
    pendingRequest.length >
    0
  ) {
    return {
      error:
        user.role === 'OWNER'
          ? 'A request is already waiting for this product. Review it first.'
          : 'A request for this product is already waiting for the owner.',
    };
  }

  if (
    user.role ===
    'EMPLOYEE'
  ) {
    await db
      .insert(corrections)
      .values({
        targetType:
          'PRODUCT',

        targetId:
          product.id,

        targetLabel:
          product.name,

        requestedByUserId:
          user.id,

        status:
          'PENDING',

        beforeValues:
          before,

        afterValues:
          after,

        reason,
      });

    revalidateProductPaths();

    return {
      success: true,
      productId:
        product.id,
      requestSent: true,
      completionId:
        randomUUID(),
    };
  }

  try {
    await db.transaction(
      async (tx) => {
        const [current] =
          await tx
            .select()
            .from(products)
            .where(
              eq(
                products.id,
                product.id,
              ),
            )
            .limit(1);

        if (
          !current ||
          current.status !==
            'ACTIVE' ||
          current.itemType !==
            'PRODUCT'
        ) {
          throw new ProductChangeError(
            'Product was not found.',
          );
        }

        const currentValues =
          valuesFromProduct(
            current,
          );

        if (
          !sameProductValues(
            currentValues,
            before,
          )
        ) {
          throw new ProductChangeError(
            'This product has already changed. Open it again before saving.',
          );
        }

        const [
          currentStockUse,
          currentSaleUse,
        ] = await Promise.all([
          tx
            .select({
              id:
                stockArrivals.id,
            })
            .from(
              stockArrivals,
            )
            .where(
              eq(
                stockArrivals.productId,
                product.id,
              ),
            )
            .limit(1),

          tx
            .select({
              id:
                saleItems.id,
            })
            .from(
              saleItems,
            )
            .where(
              eq(
                saleItems.productId,
                product.id,
              ),
            )
            .limit(1),
        ]);

        if (
          (
            currentStockUse.length >
              0 ||
            currentSaleUse.length >
              0
          ) &&
          before.unit !==
            after.unit
        ) {
          throw new ProductChangeError(
            'Unit cannot be changed after stock or sales have been recorded.',
          );
        }

        if (
          productDetailsChanged
        ) {
          await applyProductValues(
            tx,
            product.id,
            after,
          );

          const now =
            new Date();

          await tx
            .insert(corrections)
            .values({
              targetType:
                'PRODUCT',

              targetId:
                product.id,

              targetLabel:
                product.name,

              requestedByUserId:
                user.id,

              reviewedByUserId:
                user.id,

              status:
                'APPLIED',

              beforeValues:
                before,

              afterValues:
                after,

              reason,

              reviewedAt:
                now,

              appliedAt:
                now,
            });
        }
      },
    );
  } catch (error) {
    if (
      error instanceof
      ProductChangeError
    ) {
      return {
        error:
          error.message,
      };
    }

    throw error;
  }

  revalidateProductPaths();

  return {
    success: true,
    productId:
      product.id,
    completionId:
      randomUUID(),
  };
}

export async function approveProductChangeRequestAction(
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
      requestErrorHref(
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
            corrections.targetType,
            'PRODUCT',
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  if (!request) {
    redirect(
      requestErrorHref(
        'Request was not found.',
      ),
    );
  }

  let before:
    ProductChangeValues;

  let after:
    ProductChangeValues;

  try {
    before =
      valuesFromSnapshot(
        request.beforeValues,
      );

    after =
      valuesFromSnapshot(
        request.afterValues,
      );
  } catch (error) {
    if (
      error instanceof
      ProductChangeError
    ) {
      redirect(
        requestErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  try {
    await db.transaction(
      async (tx) => {
        const [product] =
          await tx
            .select()
            .from(products)
            .where(
              eq(
                products.id,
                request.targetId,
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
          throw new ProductChangeError(
            'Product was not found.',
          );
        }

        const currentValues =
          valuesFromProduct(
            product,
          );

        if (
          !sameProductValues(
            currentValues,
            before,
          )
        ) {
          throw new ProductChangeError(
            'This product has changed since the request was sent. Review it before applying this request.',
          );
        }

        const [
          stockUse,
          saleUse,
        ] = await Promise.all([
          tx
            .select({
              id:
                stockArrivals.id,
            })
            .from(
              stockArrivals,
            )
            .where(
              eq(
                stockArrivals.productId,
                product.id,
              ),
            )
            .limit(1),

          tx
            .select({
              id:
                saleItems.id,
            })
            .from(
              saleItems,
            )
            .where(
              eq(
                saleItems.productId,
                product.id,
              ),
            )
            .limit(1),
        ]);

        if (
          (
            stockUse.length > 0 ||
            saleUse.length > 0
          ) &&
          before.unit !==
            after.unit
        ) {
          throw new ProductChangeError(
            'Unit cannot be changed after stock or sales have been recorded.',
          );
        }

        await applyProductValues(
          tx,
          product.id,
          after,
        );

        const now =
          new Date();

        const applied =
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
          applied.length === 0
        ) {
          throw new ProductChangeError(
            'This request has already been handled.',
          );
        }
      },
    );
  } catch (error) {
    if (
      error instanceof
      ProductChangeError
    ) {
      redirect(
        requestErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateProductPaths();

  redirect(
    '/requests?approved=1',
  );
}

export async function archiveProductAction(
  formData: FormData,
) {
  await requireOwner();

  const productId =
    String(
      formData.get(
        'productId',
      ) || '',
    );

  if (!productId) {
    return;
  }

  await db
    .update(products)
    .set({
      status:
        'ARCHIVED',

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        products.id,
        productId,
      ),
    );

  revalidateProductPaths();

  redirect('/products');
}
