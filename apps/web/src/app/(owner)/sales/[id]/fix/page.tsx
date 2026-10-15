import { requirePermission } from '@/lib/auth/require-permission';
import {
  and,
  asc,
  eq,
  sql,
} from 'drizzle-orm';
import {
  notFound,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  customers,
  products,
  saleItems,
  sales,
  stockArrivals,
  stockDamages,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import {
  SaleFixForm,
} from './sale-fix-form';


type SaleFixPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams?: Promise<{
    error?: string;
  }>;
};


export default async function SaleFixPage({
  params,
  searchParams,
}: SaleFixPageProps) {
  const user =
    await requirePermission('sales.correct');

  const { id } =
    await params;

  const query =
    await searchParams;

  const [sale] =
    await db
      .select()
      .from(sales)
      .where(
        eq(
          sales.id,
          id,
        ),
      )
      .limit(1);

  if (!sale) {
    notFound();
  }

  const [
    items,
    productRows,
    customerRows,
    pendingRows,
  ] = await Promise.all([
    db
      .select()
      .from(saleItems)
      .where(
        eq(
          saleItems.saleId,
          sale.id,
        ),
      ),

    db
      .select({
        id:
          products.id,

        name:
          products.name,

        sellingPrice:
          products.sellingPrice,

        quantity:
          sql<number>`
            (
              coalesce(
                (
                  select sum(
                    ${stockArrivals.quantityReceived}
                  )
                  from ${stockArrivals}
                  where ${stockArrivals.productId} =
                    ${products.id}
                ),
                0
              )
              -
              coalesce(
                (
                  select sum(
                    ${saleItems.quantity}
                  )
                  from ${saleItems}
                  where ${saleItems.productId} =
                    ${products.id}
                ),
                0
              )
              -
              coalesce(
                (
                  select sum(
                    ${stockDamages.quantityDamaged}
                  )
                  from ${stockDamages}
                  where ${stockDamages.productId} =
                    ${products.id}
                ),
                0
              )
            )::int
          `,

        status:
          products.status,
      })
      .from(products)
      .where(
        eq(
          products.itemType,
          'PRODUCT',
        ),
      )
      .orderBy(
        asc(
          products.name,
        ),
      ),

    db
      .select({
        id:
          customers.id,

        name:
          customers.name,

        phone:
          customers.phone,

        status:
          customers.status,
      })
      .from(customers)
      .orderBy(
        asc(
          customers.name,
        ),
      ),

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
            'SALE',
          ),
          eq(
            corrections.targetId,
            sale.id,
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
    items.length === 0
  ) {
    notFound();
  }

  const currentProductIds =
    new Set(
      items.map(
        (item) =>
          item.productId,
      ),
    );

  const availableProducts =
    productRows
      .filter(
        (product) =>
          product.status ===
            'ACTIVE' ||
          currentProductIds.has(
            product.id,
          ),
      )
      .map(
        (product) => ({
          id:
            product.id,

          name:
            product.name,

          sellingPrice:
            Number(
              product
                .sellingPrice,
            ),

          quantity:
            product.quantity,

          status:
            product.status,
        }),
      );

  const availableCustomers =
    customerRows.filter(
      (customer) =>
        customer.status ===
          'ACTIVE' ||
        customer.id ===
          sale.customerId,
    );

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      {query?.error ? (
        <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
          {query.error}
        </div>
      ) : null}

      <SaleFixForm
        saleId={
          sale.id
        }
        userRole={
          user.role
        }
        hasPendingRequest={
          pendingRows.length >
          0
        }
        customerId={
          sale.customerId
        }
        customers={
          availableCustomers
        }
        products={
          availableProducts
        }
        initialRows={
          items.map(
            (item) => ({
              sourceItemId:
                item.id,

              productId:
                item.productId,

              itemName:
                item.itemName,

              quantity:
                item.quantity,

              unitPrice:
                Number(
                  item
                    .unitPrice,
                ),
            }),
          )
        }
        discountAmount={
          Number(
            sale.discountAmount,
          )
        }
        discountReason={
          sale.discountReason
        }
        notes={
          sale.notes
        }
        paidAmount={
          Number(
            sale.paidAmount,
          )
        }
      />
    </section>
  );
}
