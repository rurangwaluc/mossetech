import Link from 'next/link';
import {
  desc,
  ilike,
  inArray,
  or,
} from 'drizzle-orm';
import { Search } from 'lucide-react';
import { db } from '@mossetech/db/client';
import {
  saleItems,
  sales,
} from '@mossetech/db/schema';
import { requireUser } from '@/lib/auth/session';

type DebtsPageProps = {
  searchParams?: Promise<{
    q?: string;
    take?: string;
  }>;
};

const PAGE_SIZE = 10;

function money(
  value: string | number,
) {
  return `RWF ${Number(
    value,
  ).toLocaleString('en-US')}`;
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(value);
}

function buildLoadMoreHref(
  q: string,
  nextTake: number,
) {
  const params =
    new URLSearchParams();

  if (q) {
    params.set('q', q);
  }

  params.set(
    'take',
    String(nextTake),
  );

  return `/debts?${params.toString()}`;
}

export default async function DebtsPage({
  searchParams,
}: DebtsPageProps) {
  await requireUser();

  const params =
    await searchParams;

  const q =
    params?.q?.trim() || '';

  const take = Math.max(
    PAGE_SIZE,
    Number(
      params?.take ||
        PAGE_SIZE,
    ),
  );

  const saleList = await db
    .select()
    .from(sales)
    .where(
      q
        ? or(
            ilike(
              sales.customerName,
              `%${q}%`,
            ),
            ilike(
              sales.customerPhone,
              `%${q}%`,
            ),
          )
        : undefined,
    )
    .orderBy(
      desc(sales.saleDate),
    );

  const unpaidSales =
    saleList.filter(
      (sale) =>
        Number(
          sale.balanceAmount,
        ) > 0,
    );

  const visibleSales =
    unpaidSales.slice(
      0,
      take,
    );

  const hasMore =
    unpaidSales.length >
    visibleSales.length;

  const visibleSaleIds =
    visibleSales.map(
      (sale) => sale.id,
    );

  const itemList =
    visibleSaleIds.length > 0
      ? await db
          .select()
          .from(saleItems)
          .where(
            inArray(
              saleItems.saleId,
              visibleSaleIds,
            ),
          )
      : [];

  const totalUnpaid =
    unpaidSales.reduce(
      (sum, sale) =>
        sum +
        Number(
          sale.balanceAmount,
        ),
      0,
    );

  const customerKeys =
    unpaidSales.map(
      (sale) =>
        sale.customerId ||
        `${sale.customerName || ''}:${sale.customerPhone || ''}:${sale.id}`,
    );

  const customersOwing =
    new Set(customerKeys).size;

  const oldWalkInSales =
    unpaidSales.filter(
      (sale) =>
        !sale.customerId,
    ).length;

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Unpaid sales
            </p>

            <h2 className="mt-1 font-display text-3xl font-black tracking-tight text-[var(--text)]">
              Money still owed
            </h2>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Customer balances
              that still need
              payment.
            </p>
          </div>

          <div className="flex gap-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                Unpaid
              </p>

              <p className="mt-1 text-xl font-black text-[#F2A71B]">
                {money(
                  totalUnpaid,
                )}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                Customers
              </p>

              <p className="mt-1 text-xl font-black text-[var(--text)]">
                {
                  customersOwing
                }
              </p>
            </div>
          </div>
        </div>
      </header>

      {oldWalkInSales >
      0 ? (
        <div className="rounded-lg border border-[#F2C94C]/40 bg-[#F2C94C]/10 px-4 py-3 text-sm font-bold text-[#8a6413] dark:text-[#FFD45A]">
          {oldWalkInSales}{' '}
          older unpaid sale
          {oldWalkInSales ===
          1
            ? ''
            : 's'}{' '}
          has no saved
          customer.
        </div>
      ) : null}

      {unpaidSales.length ===
        0 &&
      !q ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center">
          <h3 className="font-display text-xl font-black text-[var(--text)]">
            No unpaid sales
          </h3>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            Nothing is
            currently owed.
          </p>
        </section>
      ) : (
        <>
          <form className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

              <input
                name="q"
                defaultValue={q}
                placeholder="Search customer"
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-11 pr-3 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              />
            </div>

            <button className="h-11 rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]">
              Search
            </button>
          </form>

          {visibleSales.length ===
          0 ? (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center">
              <h3 className="font-display text-xl font-black text-[var(--text)]">
                No matching
                unpaid sales
              </h3>

              <Link
                href="/debts"
                className="mt-3 inline-flex text-sm font-black text-[var(--primary)]"
              >
                Clear search
              </Link>
            </section>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] lg:block">
                <div className="grid grid-cols-[1.2fr_1.45fr_0.75fr_auto] border-b border-[var(--border)] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  <div>
                    Customer
                  </div>
                  <div>Sale</div>
                  <div>
                    Unpaid
                  </div>
                  <div />
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {visibleSales.map(
                    (sale) => {
                      const items =
                        itemList.filter(
                          (item) =>
                            item.saleId ===
                            sale.id,
                        );

                      const names =
                        items
                          .map(
                            (
                              item,
                            ) =>
                              `${item.itemName} x${item.quantity}`,
                          )
                          .join(
                            ', ',
                          );

                      return (
                        <div
                          key={
                            sale.id
                          }
                          className="grid grid-cols-[1.2fr_1.45fr_0.75fr_auto] items-center gap-4 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--text)]">
                              {sale.customerName ||
                                'Customer'}
                            </p>

                            {sale.customerPhone ? (
                              <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                                {
                                  sale.customerPhone
                                }
                              </p>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[var(--text)]">
                              {dateTime(
                                sale.saleDate,
                              )}
                            </p>

                            <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">
                              {names ||
                                'Sale'}
                            </p>
                          </div>

                          <p className="text-sm font-black text-[#F2A71B]">
                            {money(
                              sale.balanceAmount,
                            )}
                          </p>

                          <Link
                            href={`/debts/${sale.id}`}
                            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                          >
                            Open
                          </Link>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="space-y-2 lg:hidden">
                {visibleSales.map(
                  (sale) => {
                    const items =
                      itemList.filter(
                        (item) =>
                          item.saleId ===
                          sale.id,
                      );

                    const names =
                      items
                        .map(
                          (item) =>
                            `${item.itemName} x${item.quantity}`,
                        )
                        .join(', ');

                    return (
                      <Link
                        key={
                          sale.id
                        }
                        href={`/debts/${sale.id}`}
                        className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-black text-[var(--text)]">
                              {sale.customerName ||
                                'Customer'}
                            </p>

                            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                              {sale.customerPhone ||
                                dateTime(
                                  sale.saleDate,
                                )}
                            </p>
                          </div>

                          <p className="shrink-0 text-sm font-black text-[#F2A71B]">
                            {money(
                              sale.balanceAmount,
                            )}
                          </p>
                        </div>

                        <p className="mt-3 truncate text-xs font-semibold text-[var(--muted)]">
                          {names ||
                            'Sale'}{' '}
                          /{' '}
                          {dateTime(
                            sale.saleDate,
                          )}
                        </p>
                      </Link>
                    );
                  },
                )}
              </div>

              {hasMore ? (
                <div className="flex justify-center">
                  <Link
                    href={buildLoadMoreHref(
                      q,
                      take +
                        PAGE_SIZE,
                    )}
                    className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)]"
                  >
                    Load more
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
