import {
  and,
  asc,
  eq,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
} from '@mossetech/db/schema';

import {
  requireUser,
} from '@/lib/auth/session';

import {
  ReceiveStockForm,
} from './receive-stock-form';

type ReceiveStockPageProps = {
  searchParams?: Promise<{
    product?: string;
    error?: string;
  }>;
};

export default async function ReceiveStockPage({
  searchParams,
}: ReceiveStockPageProps) {
  const user =
    await requireUser();

  const params =
    await searchParams;

  const requestedProductId =
    params?.product || '';

  const error =
    params?.error || '';

  const stockProducts =
    await db
      .select({
        id:
          products.id,

        name:
          products.name,

        category:
          products.category,

        unit:
          products.unit,

        quantity:
          products.quantity,

        sellingPrice:
          products.sellingPrice,
      })
      .from(products)
      .where(
        and(
          eq(
            products.status,
            'ACTIVE',
          ),

          eq(
            products.itemType,
            'PRODUCT',
          ),
        ),
      )
      .orderBy(
        asc(products.name),
      );

  const initialProductId =
    stockProducts.some(
      (product) =>
        product.id ===
        requestedProductId,
    )
      ? requestedProductId
      : '';

  return (
    <section className="mx-auto max-w-5xl">
      <ReceiveStockForm
        userId={
          user.id
        }
        products={
          stockProducts
        }
        initialProductId={
          initialProductId
        }
        error={error}
      />
    </section>
  );
}
