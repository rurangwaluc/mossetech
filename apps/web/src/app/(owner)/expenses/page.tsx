import Link from 'next/link';
import {
  desc,
  eq,
  ilike,
  or,
} from 'drizzle-orm';
import {
  Search,
} from 'lucide-react';

import {
  db,
} from '@mossetech/db/client';
import {
  cashDrawers,
  expenses,
} from '@mossetech/db/schema';

import {
  requireUser,
} from '@/lib/auth/session';
import {
  createExpenseAction,
} from '@/lib/expenses/actions';


type ExpensesPageProps = {
  searchParams?:
    Promise<{
      q?: string;
      take?: string;
      error?: string;
      added?: string;
      add?: string;
    }>;
};


const PAGE_SIZE = 10;


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


function paymentName(
  value: string,
) {
  const names:
    Record<
      string,
      string
    > = {
    CASH:
      'Cash',

    MOBILE_MONEY:
      'Mobile money',

    BANK:
      'Bank',

    CARD:
      'Card',
  };

  return (
    names[value] ||
    value
  );
}


function kigaliDateKey(
  value: Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'Africa/Kigali',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      },
    ).formatToParts(
      value,
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        'year',
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        'month',
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        'day',
    )?.value;

  return `${year}-${month}-${day}`;
}


function isToday(
  value: Date,
) {
  return (
    kigaliDateKey(
      value,
    ) ===
    kigaliDateKey(
      new Date(),
    )
  );
}


function niceDate(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        'Africa/Kigali',

      month:
        'short',

      day:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  ).format(
    value,
  );
}


function buildLoadMoreHref(
  q: string,
  nextTake: number,
) {
  const params =
    new URLSearchParams();

  if (q) {
    params.set(
      'q',
      q,
    );
  }

  params.set(
    'take',
    String(
      nextTake,
    ),
  );

  return `/expenses?${params.toString()}`;
}


function buildAddHref(
  q: string,
) {
  const params =
    new URLSearchParams();

  params.set(
    'add',
    '1',
  );

  if (q) {
    params.set(
      'q',
      q,
    );
  }

  return `/expenses?${params.toString()}`;
}


export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  const user =
    await requireUser();

  const isOwner =
    user.role ===
    'OWNER';

  const params =
    await searchParams;

  const q =
    params?.q?.trim() ||
    '';

  const take =
    Math.max(
      PAGE_SIZE,
      Number(
        params?.take ||
        PAGE_SIZE,
      ) ||
        PAGE_SIZE,
    );

  const error =
    params?.error ||
    '';

  const added =
    params?.added ===
    '1';

  const showAdd =
    params?.add ===
      '1' ||
    Boolean(
      error,
    );

  const [
    expenseList,
    openDrawer,
  ] =
    await Promise.all([
      db
        .select()
        .from(
          expenses,
        )
        .where(
          q
            ? or(
                ilike(
                  expenses.name,
                  `%${q}%`,
                ),
                ilike(
                  expenses.category,
                  `%${q}%`,
                ),
                ilike(
                  expenses.notes,
                  `%${q}%`,
                ),
              )
            : undefined,
        )
        .orderBy(
          desc(
            expenses.expenseDate,
          ),
        ),

      db.query.cashDrawers.findFirst(
        {
          where:
            eq(
              cashDrawers.status,
              'OPEN',
            ),

          orderBy:
            desc(
              cashDrawers.openedAt,
            ),
        },
      ),
    ]);

  const roleExpenses =
    isOwner
      ? expenseList
      : expenseList.filter(
          (
            expense,
          ) =>
            isToday(
              expense.expenseDate,
            ),
        );

  const visibleExpenses =
    roleExpenses.slice(
      0,
      take,
    );

  const hasMore =
    roleExpenses.length >
    visibleExpenses.length;

  const todayTotal =
    roleExpenses
      .filter(
        (
          expense,
        ) =>
          isToday(
            expense.expenseDate,
          ),
      )
      .reduce(
        (
          sum,
          expense,
        ) =>
          sum +
          Number(
            expense.amount,
          ),
        0,
      );

  const hasExpenses =
    roleExpenses.length >
    0;

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Expenses
            </p>

            <h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[var(--text)]">
              Expenses
            </h2>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Record money spent by the shop.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isOwner &&
            todayTotal > 0 ? (
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  Spent today
                </p>

                <p className="mt-1 text-sm font-black text-[var(--text)]">
                  {money(
                    todayTotal,
                  )}
                </p>
              </div>
            ) : null}

            {!showAdd ? (
              <Link
                href={buildAddHref(
                  q,
                )}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-strong)]"
              >
                Add expense
              </Link>
            ) : (
              <Link
                href="/expenses"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
              >
                Close
              </Link>
            )}
          </div>
        </div>
      </header>

      {added ? (
        <div className="rounded-lg border border-[#5F8A63]/40 bg-[#5F8A63]/10 px-4 py-3 text-sm font-bold text-[#5F8A63] dark:text-[#79C27D]">
          Expense saved.
        </div>
      ) : null}

      {showAdd ? (
        <form
          action={
            createExpenseAction
          }
          className="rounded-xl border border-[var(--border)] bg-[var(--card)]"
        >
          <header className="border-b border-[var(--border)] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              New expense
            </p>

            <h3 className="mt-1 text-xl font-black text-[var(--text)]">
              Add expense
            </h3>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Record what was paid and how it was paid.
            </p>
          </header>

          <div className="space-y-5 px-5 py-5">
            {!openDrawer ? (
              <div className="rounded-lg border border-[#F2C94C]/50 bg-[#F2C94C]/10 px-4 py-3 text-sm font-bold text-[#8A5A00] dark:text-[#FFD45A]">
                Cash is unavailable until the cash drawer is opened. Mobile money, Bank, and Card can still be used.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-[var(--text)]">
                  Expense name
                </span>

                <input
                  name="name"
                  required
                  placeholder="Transport, electricity, packaging"
                  className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-[var(--text)]">
                  Category
                </span>

                <input
                  name="category"
                  required
                  defaultValue="Shop costs"
                  placeholder="Shop costs"
                  className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-[var(--text)]">
                  Amount
                </span>

                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="5000"
                  className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-[var(--text)]">
                  Paid from
                </span>

                <select
                  name="paymentMethod"
                  defaultValue={
                    openDrawer
                      ? 'CASH'
                      : 'MOBILE_MONEY'
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-black text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
                >
                  <option value="CASH">
                    Cash
                  </option>

                  <option value="MOBILE_MONEY">
                    Mobile money
                  </option>

                  <option value="BANK">
                    Bank
                  </option>

                  <option value="CARD">
                    Card
                  </option>
                </select>
              </label>

              {isOwner ? (
                <label className="block">
                  <span className="text-sm font-black text-[var(--text)]">
                    Date
                  </span>

                  <input
                    name="expenseDate"
                    type="date"
                    className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
                  />

                  <span className="mt-2 block text-xs font-semibold text-[var(--muted)]">
                    Cash expenses must be for today.
                  </span>
                </label>
              ) : null}

              <label className="block md:col-span-2">
                <span className="text-sm font-black text-[var(--text)]">
                  Notes
                </span>

                <span className="ml-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  Optional
                </span>

                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Anything useful about this expense"
                  className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {!isOwner ? (
                <p className="text-xs font-semibold text-[var(--muted)]">
                  Recorded for today
                </p>
              ) : (
                <span />
              )}

              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-strong)]"
              >
                Save expense
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {hasExpenses ||
      q ? (
        <form className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

            <input
              name="q"
              defaultValue={
                q
              }
              placeholder="Search expense or category"
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
      ) : null}

      {visibleExpenses.length ===
      0 ? (
        showAdd ? null : (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center">
          <p className="text-sm font-black text-[var(--text)]">
            {q
              ? 'No expenses found'
              : 'No expenses yet'}
          </p>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            {q
              ? 'Try another expense name or category.'
              : 'Recorded shop expenses will appear here.'}
          </p>
        </section>
        )
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] md:block">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              <div>
                Expense
              </div>

              <div>
                Paid from
              </div>

              <div>
                Date
              </div>

              <div className="text-right">
                Amount
              </div>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {visibleExpenses.map(
                (
                  expense,
                ) => (
                  <div
                    key={
                      expense.id
                    }
                    className="grid grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/expenses/${expense.id}`}
                        className="block truncate text-sm font-black text-[var(--text)] transition hover:text-[var(--primary)]"
                      >
                        {expense.name}
                      </Link>

                      <p className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">
                        {
                          expense.category
                        }
                        {expense.notes
                          ? ` / ${expense.notes}`
                          : ''}
                      </p>
                    </div>

                    <p className="text-sm font-black text-[var(--text)]">
                      {paymentName(
                        expense.paymentMethod,
                      )}
                    </p>

                    <p className="text-sm font-semibold text-[var(--muted)]">
                      {niceDate(
                        expense.expenseDate,
                      )}
                    </p>

                    <p className="text-right text-sm font-black text-[var(--text)]">
                      {money(
                        expense.amount,
                      )}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>

          <section className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] md:hidden">
            {visibleExpenses.map(
              (
                expense,
              ) => (
                <article
                  key={
                    expense.id
                  }
                  className="p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/expenses/${expense.id}`}
                        className="block truncate font-black text-[var(--text)] transition hover:text-[var(--primary)]"
                      >
                        {expense.name}
                      </Link>

                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        {
                          expense.category
                        }
                        {' / '}
                        {paymentName(
                          expense.paymentMethod,
                        )}
                      </p>
                    </div>

                    <p className="shrink-0 text-sm font-black text-[var(--text)]">
                      {money(
                        expense.amount,
                      )}
                    </p>
                  </div>

                  <p className="mt-3 text-xs font-semibold text-[var(--muted)]">
                    {niceDate(
                      expense.expenseDate,
                    )}
                  </p>

                  {expense.notes ? (
                    <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">
                      {
                        expense.notes
                      }
                    </p>
                  ) : null}
                </article>
              ),
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-[var(--muted)]">
              Showing{' '}
              {visibleExpenses.length}
              {' of '}
              {roleExpenses.length}
            </p>

            {hasMore ? (
              <Link
                href={buildLoadMoreHref(
                  q,
                  take +
                    PAGE_SIZE,
                )}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
              >
                Load more
              </Link>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
