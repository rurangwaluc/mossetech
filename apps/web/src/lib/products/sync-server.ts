import {
  and,
  eq,
} from 'drizzle-orm';

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
} from '@mossetech/validators/product';

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

type SyncUser = {
  id: string;
  role:
    | 'OWNER'
    | 'EMPLOYEE';
};

type ProductValues = {
  brand: string | null;
  model: string | null;
  condition: 'NEW' | 'USED' | 'REFURBISHED' | null;
  specifications: Record<string, string>;
  compatibility: string | null;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  minQuantity: number;
  notes: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProductSyncError
  extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);

    this.name =
      'ProductSyncError';
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
    throw new ProductSyncError(
      'Invalid product data.',
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function parseProductId(
  value: unknown,
) {
  if (
    typeof value !==
      'string' ||
    !UUID_PATTERN.test(value)
  ) {
    throw new ProductSyncError(
      'Invalid product.',
      400,
    );
  }

  return value;
}

function parseValues(
  value: unknown,
): ProductValues {
  const input =
    recordFrom(value);

  const parsed =
    productFormSchema.safeParse({
      itemType: 'PRODUCT',
      brand: input.brand ?? '',
      model: input.model ?? '',
      condition: input.condition ?? undefined,
      compatibility: input.compatibility ?? '',
      specifications: input.specifications ?? {},

      name: input.name,
      category:
        input.category,
      unit:
        input.unit,
      sellingPrice:
        String(
          input.sellingPrice ??
            '',
        ),
      minQuantity:
        String(
          input.minQuantity ??
            '',
        ),
      notes:
        typeof input.notes ===
          'string'
          ? input.notes
          : undefined,
    });

  if (!parsed.success) {
    throw new ProductSyncError(
      parsed.error.issues[0]
        ?.message ||
        'Check the product details.',
    );
  }

  return {
    brand: parsed.data.brand || null,
    model: parsed.data.model || null,
    condition: parsed.data.condition || null,
    specifications: parsed.data.specifications,
    compatibility: parsed.data.compatibility || null,

    name:
      parsed.data.name,

    category:
      parsed.data.category,

    unit:
      parsed.data.unit,

    sellingPrice:
      Number(
        parsed.data.sellingPrice,
      ),

    minQuantity:
      Number(
        parsed.data.minQuantity,
      ),

    notes:
      parsed.data.notes
        ?.trim() ||
      null,
  };
}

function valuesFromProduct(
  product: Product,
): ProductValues {
  return {
    name:
      product.name,

    category:
      product.category,

    brand: product.brand,
    model: product.model,
    condition: product.condition as
      'NEW' | 'USED' | 'REFURBISHED' | null,
    specifications: (
      product.specifications &&
      typeof product.specifications === 'object' &&
      !Array.isArray(product.specifications)
        ? product.specifications
        : {}
    ) as Record<string, string>,
    compatibility: product.compatibility,

    unit:
      product.unit,

    sellingPrice:
      Number(
        product.sellingPrice,
      ),

    minQuantity:
      product.minQuantity,

    notes:
      product.notes
        ?.trim() ||
      null,
  };
}

function canonicalProductValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalProductValue);
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [
          key,
          canonicalProductValue(record[key]),
        ]),
    );
  }

  return value;
}

function productValuesEqual(
  first: unknown,
  second: unknown,
): boolean {
  return JSON.stringify(canonicalProductValue(first)) ===
    JSON.stringify(canonicalProductValue(second));
}

function sameValues(
  first: ProductValues,
  second: ProductValues,
) {
  return (
    productValuesEqual(first, second)
  );
}

async function applyValues(
  tx: DbTransaction,
  productId: string,
  values: ProductValues,
) {
  await tx
    .update(products)
    .set({
      name:
        values.name,

      category:
        values.category,

      brand: values.brand,
      model: values.model,
      condition: values.condition,
      specifications: values.specifications,
      compatibility: values.compatibility,

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

export async function executeProductCreateSync(
  tx: DbTransaction,
  payload: unknown,
) {
  const input =
    recordFrom(payload);

  const productId =
    parseProductId(
      input.productId,
    );

  const values =
    parseValues(
      input.values,
    );

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

  if (existing) {
    if (
      existing.status ===
        'ACTIVE' &&
      existing.itemType ===
        'PRODUCT' &&
      sameValues(
        valuesFromProduct(
          existing,
        ),
        values,
      )
    ) {
      return {
        productId,
        requestSent:
          false,
      };
    }

    throw new ProductSyncError(
      'This product already exists with different details.',
      409,
    );
  }

  await tx
    .insert(products)
    .values({
      id:
        productId,

      itemType:
        'PRODUCT',

      name:
        values.name,

      category:
        values.category,

      brand: values.brand,
      model: values.model,
      condition: values.condition,
      specifications: values.specifications,
      compatibility: values.compatibility,

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
    });

  return {
    productId,
    requestSent:
      false,
  };
}

export async function executeProductUpdateSync(
  tx: DbTransaction,
  user: SyncUser,
  payload: unknown,
) {
  const input =
    recordFrom(payload);

  const productId =
    parseProductId(
      input.productId,
    );

  const before =
    parseValues(
      input.before,
    );

  const after =
    parseValues(
      input.after,
    );

  const reason =
    typeof input.reason ===
      'string'
      ? input.reason.trim()
      : '';

  const hasImageChange =
    input.hasImageChange ===
      true;

  if (
    reason.length < 3
  ) {
    throw new ProductSyncError(
      user.role ===
        'OWNER'
        ? 'Tell us why you are changing this.'
        : 'Tell the owner what needs changing.',
    );
  }

  if (
    user.role ===
      'EMPLOYEE' &&
    hasImageChange
  ) {
    throw new ProductSyncError(
      'Only the owner can replace an existing product photo.',
      403,
    );
  }

  const [product] =
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
    !product ||
    product.status !==
      'ACTIVE' ||
    product.itemType !==
      'PRODUCT'
  ) {
    throw new ProductSyncError(
      'Product was not found.',
      404,
    );
  }

  const current =
    valuesFromProduct(
      product,
    );

  if (
    !sameValues(
      current,
      before,
    )
  ) {
    throw new ProductSyncError(
      'This product has already changed. Open it again before saving.',
      409,
    );
  }

  const detailsChanged =
    !sameValues(
      before,
      after,
    );

  if (
    !detailsChanged &&
    !hasImageChange
  ) {
    throw new ProductSyncError(
      'Nothing was changed.',
    );
  }

  const [
    stockUse,
    saleUse,
    pendingRequest,
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
          productId,
        ),
      )
      .limit(1),

    tx
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

    tx
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

  if (
    (
      stockUse.length > 0 ||
      saleUse.length > 0
    ) &&
    before.unit !==
      after.unit
  ) {
    throw new ProductSyncError(
      'Unit cannot be changed after stock or sales have been recorded.',
    );
  }

  if (
    pendingRequest.length >
    0
  ) {
    throw new ProductSyncError(
      user.role ===
        'OWNER'
        ? 'A request is already waiting for this product. Review it first.'
        : 'A request for this product is already waiting for the owner.',
      409,
    );
  }

  if (
    user.role ===
    'EMPLOYEE'
  ) {
    if (
      !detailsChanged
    ) {
      throw new ProductSyncError(
        'Nothing was changed.',
      );
    }

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

        status:
          'PENDING',

        beforeValues:
          before,

        afterValues:
          after,

        reason,
      });

    return {
      productId:
        product.id,

      requestSent:
        true,
    };
  }

  if (
    detailsChanged
  ) {
    await applyValues(
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

  return {
    productId:
      product.id,

    requestSent:
      false,
  };
}
