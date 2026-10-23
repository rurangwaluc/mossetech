'use server';

import { requirePermission } from '@/lib/auth/require-permission';
import { resolveSupplierId } from '@/lib/suppliers/resolve-supplier';

import {
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
  products,
  stockArrivals,
} from '@mossetech/db/schema';

import {
  stockArrivalSchema,
} from '@mossetech/validators/stock';

import {
} from '@/lib/auth/session';

function cleanOptional(
  value:
    | string
    | undefined,
) {
  const cleaned =
    value?.trim();

  return cleaned
    ? cleaned
    : null;
}

function optionalFormValue(
  formData: FormData,
  key: string,
) {
  const value =
    String(
      formData.get(key) || '',
    ).trim();

  return value || undefined;
}

function receiveErrorHref(
  productId: string,
  message: string,
) {
  const params =
    new URLSearchParams();

  if (productId) {
    params.set(
      'product',
      productId,
    );
  }

  params.set(
    'error',
    message,
  );

  return `/stock/receive?${params.toString()}`;
}

export async function receiveStockAction(
  formData: FormData,
) {
  const user =
    await requirePermission('stock.receive');

  const rawBuyingPrice =
    String(formData.get('buyingPrice') ?? '').trim();

  if (rawBuyingPrice && user.role !== 'OWNER') {
    throw new Error(
      'Only the owner can record purchase costs.',
    );
  }

  if (
    rawBuyingPrice &&
    (
      !/^\d+(?:\.\d{1,2})?$/.test(rawBuyingPrice) ||
      !Number.isFinite(Number(rawBuyingPrice)) ||
      Number(rawBuyingPrice) <= 0 ||
      Number(rawBuyingPrice) > 9999999999.99
    )
  ) {
    throw new Error('Enter a valid Cost Price (RWF).');
  }

  const rawSupplierDebt =
    String(formData.get('supplierAmountOwed') ?? '').trim();

  if (rawSupplierDebt && user.role !== 'OWNER') {
    throw new Error('Only the owner can record supplier credit.');
  }

  if (rawSupplierDebt && (
    !/^\d+(?:\.\d{1,2})?$/.test(rawSupplierDebt) ||
    !Number.isFinite(Number(rawSupplierDebt)) ||
    Number(rawSupplierDebt) <= 0
  )) {
    throw new Error('Enter a valid amount owed.');
  }

  const rawProductId =
    String(
      formData.get('productId') ||
        '',
    ).trim();

  const parsed =
    stockArrivalSchema.safeParse({
      productId:
        rawProductId,

      quantityReceived:
        formData.get(
          'quantityReceived',
        ),

      supplierName:
        optionalFormValue(
          formData,
          'supplierName',
        ),

      reference:
        optionalFormValue(
          formData,
          'reference',
        ),

      notes:
        optionalFormValue(
          formData,
          'notes',
        ),
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the stock form.';

    redirect(
      receiveErrorHref(
        rawProductId,
        message,
      ),
    );
  }

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
    redirect(
      receiveErrorHref(
        rawProductId,
        'Product was not found.',
      ),
    );
  }

  const supplierName =
    cleanOptional(
      parsed.data.supplierName,
    );

  const reference =
    cleanOptional(
      parsed.data.reference,
    );

  const notes =
    cleanOptional(
      parsed.data.notes,
    );

  await db.transaction(
    async (tx) => {
      const selectedSupplierId =
        String(formData.get('supplierId') ?? '').trim();

      const supplierId = await resolveSupplierId(
        tx,
        supplierName,
        selectedSupplierId || null,
      );

      const debtCents =
        Math.round(Number(rawSupplierDebt || '0') * 100);

      const purchaseCents =
        Math.round(Number(rawBuyingPrice || '0') * 100) *
        parsed.data.quantityReceived;

      if (
        debtCents > 0 &&
        (!supplierId || debtCents > purchaseCents)
      ) {
        throw new Error(
          'Select an existing supplier and enter an amount owed no higher than the purchase cost.',
        );
      }

      if (supplierId) {
        await tx.execute(sql`
          SELECT id FROM suppliers
          WHERE id = ${supplierId}
          FOR UPDATE
        `);
      }

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
            product.sellingPrice,

          buyingPrice:
            rawBuyingPrice || '0',

          supplierName,
          supplierId,
          supplierAmountOwed:
            Number(rawSupplierDebt || '0').toFixed(2),
          reference,
          notes,
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
    },
  );

  revalidatePath(
    '/stock',
  );

  revalidatePath(
    '/stock/receive',
  );

  revalidatePath(
    '/products',
  );

  revalidatePath(
    `/products/${product.id}`,
  );

  revalidatePath(
    `/products/${product.id}/edit`,
  );

  revalidatePath(
    '/sales/new',
  );

  revalidatePath(
    '/dashboard',
  );

  redirect(
    '/stock?received=1',
  );
}


export async function recordStockDamageAction(
  formData: FormData,
) {
  const user =
    await requirePermission('stock.damage');

  const productId =
    String(
      formData.get(
        'productId',
      ) || '',
    ).trim();

  const payload = {
    productId,

    quantityDamaged:
      formData.get(
        'quantityDamaged',
      ),

    reason:
      String(
        formData.get(
          'reason',
        ) || '',
      ).trim(),

    notes:
      String(
        formData.get(
          'notes',
        ) || '',
      ).trim(),
  };

  try {
    const {
      executeStockDamageSync,
    } = await import(
      '@/lib/stock/sync-server'
    );

    await db.transaction(
      async (tx) => {
        await executeStockDamageSync(
          tx,
          user,
          payload,
          new Date(),
        );
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Damaged stock could not be recorded.';

    const params =
      new URLSearchParams({
        product:
          productId,

        error:
          message,
      });

    redirect(
      `/stock/damage?${params.toString()}`,
    );
  }

  revalidatePath(
    '/stock',
  );

  revalidatePath(
    '/products',
  );

  revalidatePath(
    `/products/${productId}`,
  );

  revalidatePath(
    '/sales/new',
  );

  revalidatePath(
    '/dashboard',
  );

  redirect(
    '/stock?damaged=1',
  );
}
