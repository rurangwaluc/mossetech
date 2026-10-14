'use server';

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
  requireUser,
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
    await requireUser();

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

          supplierName,
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
    await requireUser();

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
