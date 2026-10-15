import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';

import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  lte,
  or,
} from 'drizzle-orm';

import {
  Edit,
  Plus,
  Search,
} from 'lucide-react';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import {
  HideItemButton,
} from './hide-item-button';

import {
  ProductsFlash,
} from './products-flash';

type ProductsPageProps = {
  searchParams?: Promise<{
    q?: string;
    created?: string;
    updated?: string;
    request?: string;
    saved?: string;
    requestSaved?: string;
  }>;
};

function money(
  value: string | number,
) {
  return `RWF ${Number(
    value,
  ).toLocaleString(
    'en-US',
  )}`;
}

function stockState(
  quantity: number,
  minQuantity: number,
) {
  if (
    quantity <= 0
  ) {
    return {
      text:
        'Out of stock',
      className:
        'text-[var(--danger)]',
    };
  }

  if (
    quantity <=
    minQuantity
  ) {
    return {
      text:
        'Low stock',
      className:
        'text-[var(--danger)]',
    };
  }

  return {
    text:
      'In stock',
    className:
      'text-[var(--success)]',
  };
}

function stockQuantity(
  quantity: number,
  unit: string,
) {
  if (
    quantity === 0
  ) {
    return `0 ${unit}`;
  }

  if (
    quantity === 1
  ) {
    return `1 ${unit}`;
  }

  return `${quantity} ${unit}`;
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const user =
    await requirePermission('products.view');

  const canHideProducts =
    user.role === 'OWNER';

  const params =
    await searchParams;

  const q =
    params?.q?.trim() ||
    '';

  const baseCondition =
    and(
      eq(
        products.status,
        'ACTIVE',
      ),
      eq(
        products.itemType,
        'PRODUCT',
      ),
    );

  const searchCondition =
    q
      ? or(
          ilike(
            products.name,
            `%${q}%`,
          ),
          ilike(
            products.category,
            `%${q}%`,
          ),
          ilike(
            products.unit,
            `%${q}%`,
          ),
        )
      : undefined;

  const filteredCondition =
    and(
      baseCondition,
      searchCondition,
    );

  const [
    totalResult,
    lowStockResult,
    outOfStockResult,
    filteredResult,
  ] = await Promise.all([
    db
      .select({
        value: count(),
      })
      .from(products)
      .where(
        baseCondition,
      ),

    db
      .select({
        value: count(),
      })
      .from(products)
      .where(
        and(
          baseCondition,
          gt(
            products.quantity,
            0,
          ),
          lte(
            products.quantity,
            products.minQuantity,
          ),
        ),
      ),

    db
      .select({
        value: count(),
      })
      .from(products)
      .where(
        and(
          baseCondition,
          lte(
            products.quantity,
            0,
          ),
        ),
      ),

    db
      .select({
        value: count(),
      })
      .from(products)
      .where(
        filteredCondition,
      ),
  ]);

  const totalProducts =
    Number(
      totalResult[0]
        ?.value || 0,
    );

  const lowStockCount =
    Number(
      lowStockResult[0]
        ?.value || 0,
    );

  const outOfStockCount =
    Number(
      outOfStockResult[0]
        ?.value || 0,
    );

  const filteredCount =
    Number(
      filteredResult[0]
        ?.value || 0,
    );

  const items =
    await db
      .select()
      .from(products)
      .where(
        filteredCondition,
      )
      .orderBy(
        desc(
          products.createdAt,
        ),
      );

  return (
    <section className="space-y-3 sm:space-y-4">
      {params?.saved === '1' ? (
        <ProductsFlash
          param="saved"
          message="Product saved. Changes sync automatically."
        />
      ) : null}

      {params?.requestSaved === '1' ? (
        <ProductsFlash
          param="requestSaved"
          message="Change request saved. It syncs automatically."
        />
      ) : null}

      {params?.created === '1' ? (
        <ProductsFlash
          param="created"
          message="Product added."
        />
      ) : null}

      {params?.updated === '1' ? (
        <ProductsFlash
          param="updated"
          message="Product updated."
        />
      ) : null}

      {params?.request === '1' ? (
        <ProductsFlash
          param="request"
          message="Request sent to the owner."
        />
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Products
            </p>

            <h1 className="mt-1 text-xl font-black tracking-tight text-[var(--text)]">
              Product list
            </h1>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              Products Bloom
              Kigali sells.
            </p>
          </div>

          <Link
            href="/products/new"
            prefetch
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)] sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Add product
          </Link>
        </div>

        <div className="grid grid-cols-3 border-t border-[var(--border)]">
          <div className="border-r border-[var(--border)] px-3 py-3 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              Products
            </p>

            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {totalProducts}
            </p>
          </div>

          <div className="border-r border-[var(--border)] px-3 py-3 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              Low stock
            </p>

            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {lowStockCount}
            </p>
          </div>

          <div className="px-3 py-3 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              Out of stock
            </p>

            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {outOfStockCount}
            </p>
          </div>
        </div>

        <form className="flex flex-col gap-2 border-t border-[var(--border)] px-4 py-4 sm:flex-row sm:px-6">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

            <input
              name="q"
              defaultValue={q}
              placeholder="Search products"
              className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-10 pr-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>

          <button className="h-11 rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]">
            Search
          </button>
        </form>
      </section>

      {filteredCount ===
      0 ? (
        <section className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-black text-[var(--text)]">
              {q
                ? 'No matching products'
                : 'No products yet'}
            </h2>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              {q
                ? 'Try another search.'
                : 'Add the first product Bloom Kigali sells.'}
            </p>
          </div>

          {!q ? (
            <Link
              href="/products/new"
              prefetch
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--primary)] px-4 text-sm font-black text-[var(--primary)]"
            >
              <Plus className="h-4 w-4" />
              Add product
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          <section className="hidden overflow-clip rounded-xl border border-[var(--border)] bg-[var(--card)] xl:block">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                <tr>
                  <th className="w-[42%] px-6 py-3">
                    Product
                  </th>

                  <th className="w-[18%] px-6 py-3">
                    Unit
                  </th>

                  <th className="w-[16%] px-6 py-3">
                    Price
                  </th>

                  <th className="w-[12%] px-6 py-3">
                    Stock
                  </th>

                  <th className="w-[12%] px-6 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--border)]">
                {items.map(
                  (item) => {
                    const stock =
                      stockState(
                        item.quantity,
                        item.minQuantity,
                      );

                    return (
                      <tr
                        key={
                          item.id
                        }
                        className="transition hover:bg-[var(--surface)]"
                      >
                        <td className="px-6 py-4 align-middle">
                          <Link
                            href={`/products/${item.id}`}
                            prefetch
                            className="flex flex-wrap items-center gap-2 sm:gap-3"
                          >
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] bg-cover bg-center"
                              style={
                                item.imageKey
                                  ? {
                                      backgroundImage:
                                        `url("/api/media/product-image/${item.id}?v=${encodeURIComponent(item.imageKey)}")`,
                                    }
                                  : undefined
                              }
                            >
                              {!item.imageKey ? (
                                <span className="text-sm font-black text-[var(--primary)]">
                                  {item.name
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </span>
                              ) : null}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-[var(--text)]">
                                {item.name}
                              </p>

                              <p className="mt-1 truncate text-xs font-bold text-[var(--muted)]">
                                {item.category}
                              </p>
                            </div>
                          </Link>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 align-middle text-sm font-bold text-[var(--text)]">
                          {
                            item.unit
                          }
                        </td>

                        <td className="px-6 py-4 align-middle">
                          <p className="whitespace-nowrap text-sm font-black text-[var(--text)]">
                            {money(
                              item.sellingPrice,
                            )}
                          </p>
                        </td>

                        <td className="px-6 py-4 align-middle">
                          <p className="whitespace-nowrap text-sm font-black text-[var(--text)]">
                            {stockQuantity(
                              item.quantity,
                              item.unit,
                            )}
                          </p>

                          <p
                            className={`mt-1 text-xs font-black ${stock.className}`}
                          >
                            {
                              stock.text
                            }
                          </p>
                        </td>

                        <td className="px-6 py-4 align-middle">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/products/${item.id}/edit`}
                              prefetch
                              className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Link>

                            {canHideProducts ? (
                              <HideItemButton
                                itemId={
                                  item.id
                                }
                                itemName={
                                  item.name
                                }
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </section>

          <section className="space-y-2.5 sm:space-y-3 xl:hidden">
            {items.map(
              (item) => {
                const stock =
                  stockState(
                    item.quantity,
                    item.minQuantity,
                  );

                return (
                  <article
                    key={
                      item.id
                    }
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
                  >
                    <div className="px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-4">
                        <Link
                          href={`/products/${item.id}`}
                          prefetch
                          className="flex min-w-0 items-center gap-3"
                        >
                          <div
                            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] bg-cover bg-center"
                            style={
                              item.imageKey
                                ? {
                                    backgroundImage:
                                      `url("/api/media/product-image/${item.id}?v=${encodeURIComponent(item.imageKey)}")`,
                                  }
                                : undefined
                            }
                          >
                            {!item.imageKey ? (
                              <span className="text-sm font-black text-[var(--primary)]">
                                {item.name
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </span>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--text)]">
                              {item.name}
                            </p>

                            <p className="mt-1 truncate text-xs font-bold text-[var(--muted)]">
                              {item.category}
                              {' / '}
                              {item.unit}
                            </p>
                          </div>
                        </Link>

                        <p
                          className={`max-w-[78px] shrink-0 text-right text-xs font-black leading-4 sm:max-w-none ${stock.className}`}
                        >
                          {stock.text}
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-2 border-t border-[var(--border)] pt-3">
                        <div className="border-r border-[var(--border)] pr-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                            Price
                          </p>

                          <p className="mt-1 text-sm font-black text-[var(--text)]">
                            {money(
                              item.sellingPrice,
                            )}
                          </p>
                        </div>

                        <div className="pl-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                            Stock
                          </p>

                          <p className="mt-1 text-sm font-black text-[var(--text)]">
                            {stockQuantity(
                              item.quantity,
                              item.unit,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={
                        canHideProducts
                          ? 'grid grid-cols-2 gap-2 border-t border-[var(--border)] px-4 py-3 sm:px-5'
                          : 'grid grid-cols-1 gap-2 border-t border-[var(--border)] px-4 py-3 sm:px-5'
                      }
                    >
                      <Link
                        href={`/products/${item.id}/edit`}
                        prefetch
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                      >
                        <Edit className="h-3.5 w-3.5" />

                        {user.role ===
                        'OWNER'
                          ? 'Edit product'
                          : 'Ask owner to edit'}
                      </Link>

                      {canHideProducts ? (
                        <div className="[&_button]:h-10 [&_button]:w-full">
                          <HideItemButton
                            itemId={
                              item.id
                            }
                            itemName={
                              item.name
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              },
            )}
          </section>

        </>
      )}
    </section>
  );
}
