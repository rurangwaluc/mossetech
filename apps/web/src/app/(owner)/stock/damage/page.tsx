import {
  eq,
  sql,
} from 'drizzle-orm';

import {
  notFound,
  redirect,
} from 'next/navigation';

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
  requireUser,
} from '@/lib/auth/session';

import {
  RecordDamageForm,
} from './record-damage-form';

type DamagePageProps = {
  searchParams?: Promise<{
    product?: string;
    error?: string;
  }>;
};

export default async function DamagePage({
  searchParams,
}: DamagePageProps) {
  const user =
    await requireUser();

  const params =
    await searchParams;

  const productId =
    params?.product || '';

  if (!productId) {
    redirect('/stock');
  }

  const [product] =
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

        imageKey:
          products.imageKey,

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
    product.status !==
      'ACTIVE' ||
    product.itemType !==
      'PRODUCT'
  ) {
    notFound();
  }

  const [
    importedResult,
    soldResult,
    damagedResult,
  ] = await Promise.all([
    db
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

    db
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

    db
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
    redirect(
      '/stock',
    );
  }

  return (
    <section className="mx-auto max-w-3xl">
      <RecordDamageForm
        userId={
          user.id
        }
        product={{
          id:
            product.id,

          name:
            product.name,

          category:
            product.category,

          unit:
            product.unit,

          imageKey:
            product.imageKey,

          sellingPrice:
            product.sellingPrice,

          remaining,
        }}
        error={
          params?.error ||
          ''
        }
      />
    </section>
  );
}
