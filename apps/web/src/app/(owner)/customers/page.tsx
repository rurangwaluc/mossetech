import Link from 'next/link';
import {
  and,
  desc,
  eq,
  ilike,
  or,
  sql,
} from 'drizzle-orm';
import {
  Search,
} from 'lucide-react';

import {
  db,
} from '@mossetech/db/client';
import {
  customers,
  sales,
} from '@mossetech/db/schema';

import {
  requireUser,
} from '@/lib/auth/session';


type CustomersPageProps = {
  searchParams?:
    Promise<{
      q?: string;
      page?: string;
    }>;
};


const DESKTOP_PAGE_SIZE = 10;


function money(
  value:
    | string
    | number,
) {
  return `RWF ${Number(
    value || 0,
  ).toLocaleString(
    'en-US',
  )}`;
}


function niceDate(
  value:
    | Date
    | string
    | null,
) {
  if (!value) {
    return 'No purchase yet';
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value,
        );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'No purchase yet';
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(
    date,
  );
}


function pageHref(
  q: string,
  page: number,
) {
  const params =
    new URLSearchParams();

  if (q) {
    params.set(
      'q',
      q,
    );
  }

  if (page > 1) {
    params.set(
      'page',
      String(
        page,
      ),
    );
  }

  const query =
    params.toString();

  return query
    ? `/customers?${query}`
    : '/customers';
}


export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireUser();

  const params =
    await searchParams;

  const q =
    params?.q?.trim() ||
    '';

  const page =
    Math.max(
      1,
      Number(
        params?.page ||
        1,
      ) || 1,
    );

  const offset =
    (
      page -
      1
    ) *
    DESKTOP_PAGE_SIZE;

  const searchCondition =
    q
      ? or(
          ilike(
            customers.name,
            `%${q}%`,
          ),
          ilike(
            customers.phone,
            `%${q}%`,
          ),
        )
      : undefined;

  const whereCondition =
    and(
      eq(
        customers.status,
        'ACTIVE',
      ),
      searchCondition,
    );

  const [
    customerRows,
    countResult,
  ] =
    await Promise.all([
      db
        .select({
          id:
            customers.id,

          name:
            customers.name,

          phone:
            customers.phone,

          salesCount:
            sql<number>`
              count(${sales.id})
            `,

          unpaidBalance:
            sql<string>`
              coalesce(
                sum(${sales.balanceAmount}),
                0
              )
            `,

          lastSale:
            sql<Date | null>`
              max(${sales.saleDate})
            `,
        })
        .from(customers)
        .leftJoin(
          sales,
          eq(
            sales.customerId,
            customers.id,
          ),
        )
        .where(
          whereCondition,
        )
        .groupBy(
          customers.id,
          customers.name,
          customers.phone,
        )
        .orderBy(
          desc(
            sql`
              max(${sales.saleDate})
            `,
          ),
          desc(
            customers.createdAt,
          ),
        )
        .limit(
          DESKTOP_PAGE_SIZE,
        )
        .offset(
          offset,
        ),

      db
        .select({
          count:
            sql<number>`
              count(*)
            `,
        })
        .from(customers)
        .where(
          whereCondition,
        ),
    ]);

  const totalCustomers =
    Number(
      countResult[0]
        ?.count ||
      0,
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        totalCustomers /
        DESKTOP_PAGE_SIZE,
      ),
    );

  const currentPage =
    Math.min(
      page,
      totalPages,
    );

  const showingStart =
    customerRows.length >
    0
      ? offset + 1
      : 0;

  const showingEnd =
    offset +
    customerRows.length;

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
          Customers
        </p>

        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-black tracking-tight text-[var(--text)]">
              Customers
            </h2>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Find customers and see who still owes money.
            </p>
          </div>

          {totalCustomers > 0 ? (
            <p className="text-xs font-black text-[var(--muted)]">
              {totalCustomers}{' '}
              {totalCustomers ===
              1
                ? 'customer'
                : 'customers'}
            </p>
          ) : null}
        </div>
      </header>

      <form className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

          <input
            name="q"
            defaultValue={
              q
            }
            placeholder="Search customer name or phone"
            className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-10 pr-3 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
        >
          Search
        </button>
      </form>

      {customerRows.length ===
      0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center">
          <p className="text-sm font-black text-[var(--text)]">
            {q
              ? 'No customers found'
              : 'No customers yet'}
          </p>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            {q
              ? 'Try another name or phone number.'
              : 'Customers are saved when they are added during a sale.'}
          </p>
        </section>
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] lg:block">
            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-4 border-b border-[var(--border)] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              <div>
                Customer
              </div>

              <div>
                Last purchase
              </div>

              <div>
                Status
              </div>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {customerRows.map(
                (
                  customer,
                ) => {
                  const unpaid =
                    Number(
                      customer
                        .unpaidBalance,
                    );

                  const salesCount =
                    Number(
                      customer
                        .salesCount,
                    );

                  return (
                    <Link
                      key={
                        customer.id
                      }
                      href={`/customers/${customer.id}`}
                      className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-4 px-5 py-4 transition hover:bg-[var(--primary-soft)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--text)]">
                          {
                            customer.name
                          }
                        </p>

                        {customer.phone ? (
                          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                            {
                              customer.phone
                            }
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <p className="text-sm font-black text-[var(--text)]">
                          {niceDate(
                            customer
                              .lastSale,
                          )}
                        </p>

                        {salesCount >
                        0 ? (
                          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                            {salesCount}{' '}
                            {salesCount ===
                            1
                              ? 'sale'
                              : 'sales'}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        {unpaid >
                        0 ? (
                          <>
                            <p className="text-sm font-black text-[#F2A71B]">
                              Owes{' '}
                              {money(
                                unpaid,
                              )}
                            </p>

                            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                              Needs follow up
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-black text-[#5F8A63] dark:text-[#79C27D]">
                            Clear
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                },
              )}
            </div>
          </section>

          <section className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] lg:hidden">
            {customerRows.map(
              (
                customer,
              ) => {
                const unpaid =
                  Number(
                    customer
                      .unpaidBalance,
                  );

                const salesCount =
                  Number(
                    customer
                      .salesCount,
                  );

                return (
                  <Link
                    key={
                      customer.id
                    }
                    href={`/customers/${customer.id}`}
                    className="block p-4 transition hover:bg-[var(--primary-soft)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-black text-[var(--text)]">
                          {
                            customer.name
                          }
                        </p>

                        {customer.phone ? (
                          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                            {
                              customer.phone
                            }
                          </p>
                        ) : null}
                      </div>

                      {unpaid >
                      0 ? (
                        <p className="shrink-0 text-xs font-black text-[#F2A71B]">
                          Owes{' '}
                          {money(
                            unpaid,
                          )}
                        </p>
                      ) : (
                        <p className="shrink-0 text-xs font-black text-[#5F8A63] dark:text-[#79C27D]">
                          Clear
                        </p>
                      )}
                    </div>

                    <p className="mt-3 text-xs font-semibold text-[var(--muted)]">
                      {niceDate(
                        customer
                          .lastSale,
                      )}
                      {salesCount >
                      0
                        ? ` / ${salesCount} ${
                            salesCount ===
                            1
                              ? 'sale'
                              : 'sales'
                          }`
                        : ''}
                    </p>
                  </Link>
                );
              },
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-[var(--muted)]">
              Showing{' '}
              {showingStart}
              {'–'}
              {showingEnd}
              {' of '}
              {totalCustomers}
            </p>

            {totalPages >
            1 ? (
              <div className="flex gap-2">
                {currentPage >
                1 ? (
                  <Link
                    href={pageHref(
                      q,
                      currentPage -
                        1,
                    )}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)]"
                  >
                    Previous
                  </Link>
                ) : null}

                {currentPage <
                totalPages ? (
                  <Link
                    href={pageHref(
                      q,
                      currentPage +
                        1,
                    )}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)]"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
