import { requirePermission } from '@/lib/auth/require-permission';
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
  suppliers,
} from '@mossetech/db/schema';

import {
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
    await requirePermission('stock.receive');

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

  const supplierOptions = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(suppliers)
    .where(eq(suppliers.status, 'ACTIVE'))
    .orderBy(asc(suppliers.name));

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
        isOwner={
          user.role === 'OWNER'
        }
        products={
          stockProducts
        }
        suppliers={supplierOptions}
        initialProductId={
          initialProductId
        }
        error={error}
      />
    </section>
  );
}
