import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';

import {
  and,
  asc,
  eq,
  inArray,
  sql,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  cashDrawers,
  customers,
  products,
  saleItems,
  stockArrivals,
  stockDamages,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import {
  SaleForm,
} from '../sale-form';

export default async function NewSalePage() {
  const user =
    await requirePermission('sales.create');

  const [
    productRows,
    customerList,
    openDrawer,
  ] =
    await Promise.all([
      db
        .select({
          id:
            products.id,

          name:
            products.name,

          category:
            products.category,

          sellingPrice:
            products.sellingPrice,

          minimumSellingPrice:
            products.minimumSellingPrice,

          unit:
            products.unit,

          imageKey:
            products.imageKey,
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
        })
        .from(customers)
        .where(
          eq(
            customers.status,
            'ACTIVE',
          ),
        )
        .orderBy(
          asc(
            customers.name,
          ),
        ),

      db.query.cashDrawers.findFirst(
        {
          where:
            eq(
              cashDrawers.status,
              'OPEN',
            ),
        },
      ),
    ]);

  const productIds =
    productRows.map(
      (product) =>
        product.id,
    );

  const quantities =
    new Map<
      string,
      {
        imported: number;
        sold: number;
        damaged: number;
      }
    >();

  if (
    productIds.length > 0
  ) {
    const [
      receivedRows,
      soldRows,
      damagedRows,
    ] =
      await Promise.all([
        db
          .select({
            productId:
              stockArrivals
                .productId,

            quantity:
              sql<number>`
                coalesce(
                  sum(
                    ${stockArrivals.quantityReceived}
                  ),
                  0
                )::int
              `,
          })
          .from(
            stockArrivals,
          )
          .where(
            inArray(
              stockArrivals
                .productId,
              productIds,
            ),
          )
          .groupBy(
            stockArrivals
              .productId,
          ),

        db
          .select({
            productId:
              saleItems
                .productId,

            quantity:
              sql<number>`
                coalesce(
                  sum(
                    ${saleItems.quantity}
                  ),
                  0
                )::int
              `,
          })
          .from(
            saleItems,
          )
          .where(
            inArray(
              saleItems
                .productId,
              productIds,
            ),
          )
          .groupBy(
            saleItems
              .productId,
          ),

        db
          .select({
            productId:
              stockDamages
                .productId,

            quantity:
              sql<number>`
                coalesce(
                  sum(
                    ${stockDamages.quantityDamaged}
                  ),
                  0
                )::int
              `,
          })
          .from(
            stockDamages,
          )
          .where(
            inArray(
              stockDamages
                .productId,
              productIds,
            ),
          )
          .groupBy(
            stockDamages
              .productId,
          ),
      ]);

    for (
      const productId
      of productIds
    ) {
      quantities.set(
        productId,
        {
          imported: 0,
          sold: 0,
          damaged: 0,
        },
      );
    }

    for (
      const row
      of receivedRows
    ) {
      const current =
        quantities.get(
          row.productId,
        );

      if (current) {
        current.imported =
          Number(
            row.quantity ||
              0,
          );
      }
    }

    for (
      const row
      of soldRows
    ) {
      const current =
        quantities.get(
          row.productId,
        );

      if (current) {
        current.sold =
          Number(
            row.quantity ||
              0,
          );
      }
    }

    for (
      const row
      of damagedRows
    ) {
      const current =
        quantities.get(
          row.productId,
        );

      if (current) {
        current.damaged =
          Number(
            row.quantity ||
              0,
          );
      }
    }
  }

  const items =
    productRows
      .map(
        (product) => {
          const totals =
            quantities.get(
              product.id,
            ) || {
              imported: 0,
              sold: 0,
              damaged: 0,
            };

          return {
            ...product,

            quantity:
              totals.imported -
              totals.sold -
              totals.damaged,
          };
        },
      )
      .filter(
        (product) =>
          product.quantity >
          0,
      );

  return (
    <section className="space-y-4">
      {items.length ===
      0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-6 sm:px-6">
          <p className="text-sm font-black text-[var(--text)]">
            No stock available
            to sell
          </p>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Receive stock before
            recording a sale.
          </p>

          <Link
            href="/stock/receive"
            prefetch
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-[var(--primary)] px-4 text-sm font-black text-[var(--primary)]"
          >
            Receive stock
          </Link>
        </section>
      ) : (
        <SaleForm
          userId={
            user.id
          }
          cashDrawerId={
            openDrawer?.id ??
            null
          }
          items={items}
          customers={
            customerList
          }
          hasOpenDrawer={
            Boolean(
              openDrawer,
            )
          }
          canGiveDiscount={
            user.role ===
              'OWNER' ||
            user.role ===
              'EMPLOYEE'
          }
        />
      )}
    </section>
  );
}
