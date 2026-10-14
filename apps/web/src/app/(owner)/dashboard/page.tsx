import Link from 'next/link';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
} from 'drizzle-orm';
import {
  ArrowRight,
  Banknote,
  Boxes,
  CreditCard,
  FileText,
  Package,
  Plus,
  ReceiptText,
  ShoppingCart,
  Users,
  WalletCards,
} from 'lucide-react';

import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  cashDrawers,
  expenses,
  products,
  saleItems,
  salePayments,
  sales,
} from '@mossetech/db/schema';
import { requireUser } from '@/lib/auth/session';
import {
  getDrawerCashIn,
  getDrawerCashOut,
  getExpectedDrawerCash,
} from '@/lib/cash-drawer/calculations';

const KIGALI_TIME_ZONE =
  'Africa/Kigali';

function money(
  value: string | number,
) {
  return `${Number(
    value,
  ).toLocaleString('en-US')} RWF`;
}

function shortMoney(value: number) {
  if (value >= 1_000_000) {
    return `${(
      value / 1_000_000
    ).toFixed(
      value >= 10_000_000 ? 0 : 1,
    )}M`;
  }

  if (value >= 1_000) {
    return `${Math.round(
      value / 1_000,
    )}K`;
  }

  return String(
    Math.round(value),
  );
}

function kigaliDateKey(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        KIGALI_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).format(value);
}

function addDays(
  dateKey: string,
  amount: number,
) {
  const [year, month, day] =
    dateKey
      .split('-')
      .map(Number);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day + amount,
    ),
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function kigaliStart(
  dateKey: string,
) {
  return new Date(
    `${dateKey}T00:00:00+02:00`,
  );
}

function todayLongLabel() {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        KIGALI_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  ).format(new Date());
}

function timeLabel(value: Date) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        KIGALI_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  ).format(value);
}

function plural(
  countValue: number,
  word: string,
) {
  return `${countValue} ${word}${
    countValue === 1 ? '' : 's'
  }`;
}

function saleStatus(
  sale: {
    totalAmount: string;
    paidAmount: string;
    balanceAmount: string;
  },
) {
  const balance = Number(
    sale.balanceAmount,
  );

  if (balance <= 0) {
    return {
      text: 'Paid',
      className:
        'text-[var(--success)]',
    };
  }

  if (
    Number(sale.paidAmount) > 0
  ) {
    return {
      text: 'Partial',
      className:
        'text-[var(--primary)]',
    };
  }

  return {
    text: 'Unpaid',
    className:
      'text-[var(--danger)]',
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const isOwner =
    user.role === 'OWNER';

  const firstName =
    user.name
      .trim()
      .split(/\s+/)[0] ||
    user.name;

  const now = new Date();
  const todayKey =
    kigaliDateKey(now);

  const tomorrowKey =
    addDays(todayKey, 1);

  const weekday =
    new Date(
      `${todayKey}T12:00:00Z`,
    ).getUTCDay();

  const daysSinceMonday =
    (weekday + 6) % 7;

  const weekStartKey =
    addDays(
      todayKey,
      -daysSinceMonday,
    );

  const weekEndKey =
    addDays(
      weekStartKey,
      7,
    );

  const todayStart =
    kigaliStart(todayKey);

  const tomorrowStart =
    kigaliStart(tomorrowKey);

  const weekStart =
    kigaliStart(weekStartKey);

  const weekEnd =
    kigaliStart(weekEndKey);

  const [
    todaySales,
    weekSales,
    todayExpenses,
    todayPayments,
    lowStockRows,
    lowStockCountRows,
    unpaidSales,
    currentDrawer,
  ] = await Promise.all([
    db
      .select()
      .from(sales)
      .where(
        and(
          gte(
            sales.saleDate,
            todayStart,
          ),
          lt(
            sales.saleDate,
            tomorrowStart,
          ),
        ),
      )
      .orderBy(
        desc(sales.saleDate),
      ),

    db
      .select({
        saleDate:
          sales.saleDate,
        totalAmount:
          sales.totalAmount,
      })
      .from(sales)
      .where(
        and(
          gte(
            sales.saleDate,
            weekStart,
          ),
          lt(
            sales.saleDate,
            weekEnd,
          ),
        ),
      ),

    db
      .select({
        amount: expenses.amount,
      })
      .from(expenses)
      .where(
        and(
          gte(
            expenses.expenseDate,
            todayStart,
          ),
          lt(
            expenses.expenseDate,
            tomorrowStart,
          ),
        ),
      ),

    db
      .select()
      .from(salePayments)
      .where(
        and(
          eq(
            salePayments.isActive,
            true,
          ),
          gte(
            salePayments.paidAt,
            todayStart,
          ),
          lt(
            salePayments.paidAt,
            tomorrowStart,
          ),
        ),
      ),

    db
      .select({
        id: products.id,
        name: products.name,
        quantity:
          products.quantity,
        minQuantity:
          products.minQuantity,
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
          lte(
            products.quantity,
            products.minQuantity,
          ),
        ),
      )
      .orderBy(
        products.quantity,
      )
      .limit(5),

    db
      .select({
        value: count(),
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
          lte(
            products.quantity,
            products.minQuantity,
          ),
        ),
      ),

    db
      .select({
        id: sales.id,
        customerId:
          sales.customerId,
        customerName:
          sales.customerName,
        customerPhone:
          sales.customerPhone,
        balanceAmount:
          sales.balanceAmount,
        saleDate:
          sales.saleDate,
      })
      .from(sales)
      .where(
        gt(
          sales.balanceAmount,
          '0',
        ),
      )
      .orderBy(
        desc(
          sales.balanceAmount,
        ),
      ),

    db.query.cashDrawers.findFirst(
      {
        where: eq(
          cashDrawers.status,
          'OPEN',
        ),
        orderBy: desc(
          cashDrawers.openedAt,
        ),
      },
    ),
  ]);

  const currentMovements =
    currentDrawer
      ? await db
          .select()
          .from(
            cashDrawerMovements,
          )
          .where(
            eq(
              cashDrawerMovements.drawerId,
              currentDrawer.id,
            ),
          )
      : [];

  const recentSales =
    todaySales.slice(0, 5);

  const recentIds =
    recentSales.map(
      (sale) => sale.id,
    );

  const recentItems =
    recentIds.length > 0
      ? await db
          .select({
            saleId:
              saleItems.saleId,
            itemName:
              saleItems.itemName,
          })
          .from(saleItems)
          .where(
            inArray(
              saleItems.saleId,
              recentIds,
            ),
          )
      : [];

  const itemNamesBySale =
    new Map<
      string,
      string[]
    >();

  for (const item of recentItems) {
    const current =
      itemNamesBySale.get(
        item.saleId,
      ) || [];

    current.push(
      item.itemName,
    );

    itemNamesBySale.set(
      item.saleId,
      current,
    );
  }

  const todaySalesTotal =
    todaySales.reduce(
      (sum, sale) =>
        sum +
        Number(
          sale.totalAmount,
        ),
      0,
    );

  const todayMoneyReceived =
    todayPayments.reduce(
      (sum, payment) =>
        sum +
        Number(
          payment.receivedAmount,
        ) -
        Number(
          payment.returnedAmount,
        ),
      0,
    );

  const todayExpensesTotal =
    todayExpenses.reduce(
      (sum, expense) =>
        sum +
        Number(expense.amount),
      0,
    );

  const outstandingBalance =
    unpaidSales.reduce(
      (sum, sale) =>
        sum +
        Number(
          sale.balanceAmount,
        ),
      0,
    );

  const drawerCashIn =
    currentDrawer
      ? getDrawerCashIn(
          currentMovements,
        )
      : 0;

  const drawerCashOut =
    currentDrawer
      ? getDrawerCashOut(
          currentMovements,
        )
      : 0;

  const expectedCash =
    currentDrawer
      ? getExpectedDrawerCash(
          currentDrawer,
          currentMovements,
        )
      : 0;

  const lowStockCount =
    Number(
      lowStockCountRows[0]
        ?.value || 0,
    );

  const customerKeys =
    new Set<string>();

  for (const sale of todaySales) {
    customerKeys.add(
      sale.customerId ||
        sale.customerPhone ||
        sale.customerName ||
        `walk-in-${sale.id}`,
    );
  }

  const customersToday =
    customerKeys.size;

  const weekDays =
    Array.from(
      { length: 7 },
      (_, index) => {
        const key = addDays(
          weekStartKey,
          index,
        );

        const daySales =
          weekSales.filter(
            (sale) =>
              kigaliDateKey(
                sale.saleDate,
              ) === key,
          );

        return {
          key,
          label: [
            'Mon',
            'Tue',
            'Wed',
            'Thu',
            'Fri',
            'Sat',
            'Sun',
          ][index],
          amount:
            daySales.reduce(
              (sum, sale) =>
                sum +
                Number(
                  sale.totalAmount,
                ),
              0,
            ),
          count:
            daySales.length,
        };
      },
    );

  const chartValues = weekDays.map(
    (day) =>
      isOwner
        ? day.amount
        : day.count,
  );

  const chartMax = Math.max(
    0,
    ...chartValues,
  );

  const hasWeekActivity =
    chartMax > 0;

  const balancesByCustomer =
    new Map<
      string,
      {
        name: string;
        phone: string;
        balance: number;
      }
    >();

  for (const sale of unpaidSales) {
    const name =
      sale.customerName ||
      'Walk-in customer';

    const phone =
      sale.customerPhone || '—';

    const key =
      sale.customerId ||
      `${name}|${phone}`;

    const existing =
      balancesByCustomer.get(
        key,
      );

    if (existing) {
      existing.balance +=
        Number(
          sale.balanceAmount,
        );

      continue;
    }

    balancesByCustomer.set(
      key,
      {
        name,
        phone,
        balance: Number(
          sale.balanceAmount,
        ),
      },
    );
  }

  const topBalances =
    Array.from(
      balancesByCustomer.values(),
    )
      .sort(
        (a, b) =>
          b.balance -
          a.balance,
      )
      .slice(0, 5);

  const ownerCards = [
    {
      label: "Today's Sales",
      value: money(
        todaySalesTotal,
      ),
      helper: plural(
        todaySales.length,
        'sale',
      ),
      icon: ShoppingCart,
    },
    {
      label: 'Money Received',
      value: money(
        todayMoneyReceived,
      ),
      helper: plural(
        todayPayments.length,
        'payment',
      ),
      icon: Banknote,
    },
    {
      label: 'Expenses',
      value: money(
        todayExpensesTotal,
      ),
      helper: plural(
        todayExpenses.length,
        'expense',
      ),
      icon: ReceiptText,
    },
    {
      label:
        'Outstanding Balance',
      value: money(
        outstandingBalance,
      ),
      helper: plural(
        unpaidSales.length,
        'unpaid sale',
      ),
      icon: CreditCard,
    },
  ];

  const staffCards = [
    {
      label: 'Sales Today',
      value: String(
        todaySales.length,
      ),
      helper: 'Recorded today',
      icon: ShoppingCart,
    },
    {
      label: 'Customers',
      value: String(
        customersToday,
      ),
      helper: 'Served today',
      icon: Users,
    },
    {
      label: 'Low Stock',
      value: String(
        lowStockCount,
      ),
      helper: 'Needs attention',
      icon: Boxes,
    },
    {
      label: 'Unpaid Sales',
      value: String(
        unpaidSales.length,
      ),
      helper:
        'Customers to follow',
      icon: CreditCard,
    },
  ];

  const cards =
    isOwner
      ? ownerCards
      : staffCards;

  return (
    <section className="space-y-4 pb-6">
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.035em] text-[var(--text)] sm:text-[34px]">
            Dashboard
          </h1>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            Here&apos;s what&apos;s happening at Bloom Kigali today.
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-sm font-bold text-[var(--text)]">
            {todayLongLabel()}
          </p>

          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            Have a great day, {firstName}.
          </p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon =
            card.icon;

          return (
            <article
              key={card.label}
              className="flex min-h-[126px] items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary)]">
                <Icon className="h-6 w-6" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--muted)]">
                  {card.label}
                </p>

                <p className="mt-1 truncate text-[22px] font-black tracking-tight text-[var(--text)]">
                  {card.value}
                </p>

                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  {card.helper}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.9fr)_minmax(230px,0.72fr)]">
        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-[var(--text)]">
                Sales This Week
              </h2>

              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                {isOwner
                  ? 'Sales value from Monday to Sunday'
                  : 'Number of sales from Monday to Sunday'}
              </p>
            </div>

            <span className="text-xs font-bold text-[var(--muted)]">
              This week
            </span>
          </div>

          <div className="relative mt-6 h-[220px] border-b border-[var(--border)] px-1 sm:px-2">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-1 bottom-[37px] top-0 flex flex-col justify-between sm:inset-x-2"
            >
              {Array.from({ length: 4 }).map(
                (_, index) => (
                  <span
                    key={index}
                    className="block border-t border-[var(--border)] opacity-60"
                  />
                ),
              )}
            </div>

            {!hasWeekActivity ? (
              <div className="pointer-events-none absolute inset-x-6 top-[42%] -translate-y-1/2 text-center">
                <p className="text-sm font-bold text-[var(--text)]">
                  No sales recorded this week
                </p>

                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  Weekly activity will appear here as sales are recorded.
                </p>
              </div>
            ) : null}

            <div className="relative z-[1] flex h-full items-end gap-2 sm:gap-3">
              {weekDays.map(
                (day) => {
                  const value =
                    isOwner
                      ? day.amount
                      : day.count;

                  const height =
                    !hasWeekActivity ||
                    value <= 0
                      ? 0
                      : Math.max(
                          8,
                          Math.round(
                            (value /
                              chartMax) *
                              100,
                          ),
                        );

                  return (
                    <div
                      key={day.key}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    >
                      <div className="flex flex-1 items-end justify-center">
                        <div
                          title={
                            isOwner
                              ? money(
                                  day.amount,
                                )
                              : plural(
                                  day.count,
                                  'sale',
                                )
                          }
                          className="w-full max-w-12 rounded-t-[4px] bg-[var(--primary)] transition-[height] duration-300"
                          style={{
                            height: `${height}%`,
                          }}
                        />
                      </div>

                      <p className="py-3 text-center text-[11px] font-bold text-[var(--muted)]">
                        {day.label}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          <div className="mt-3 flex justify-between gap-3 text-[11px] font-semibold text-[var(--muted)]">
            <span>
              {!hasWeekActivity
                ? isOwner
                  ? 'Peak 0 RWF'
                  : 'Peak 0 sales'
                : isOwner
                  ? `Peak ${shortMoney(
                      chartMax,
                    )} RWF`
                  : `Peak ${chartMax} sales`}
            </span>

            <span>
              Live business data
            </span>
          </div>
        </article>

        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-black text-[var(--text)]">
              Cash Drawer
            </h2>

            <Link
              href="/money"
              className="text-xs font-black text-[var(--primary)]"
            >
              {currentDrawer
                ? 'Open drawer'
                : 'Manage'}
            </Link>
          </div>

          {currentDrawer ? (
            <div className="mt-4 divide-y divide-[var(--border)]">
              <div className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Opening cash
                </span>

                <strong className="text-[var(--text)]">
                  {money(
                    currentDrawer.openingCash,
                  )}
                </strong>
              </div>

              <div className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Cash in
                </span>

                <strong className="text-[var(--success)]">
                  {money(
                    drawerCashIn,
                  )}
                </strong>
              </div>

              <div className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Cash out
                </span>

                <strong className="text-[var(--danger)]">
                  {money(
                    drawerCashOut,
                  )}
                </strong>
              </div>

              <div className="flex justify-between gap-4 py-3 text-sm">
                <span className="font-bold text-[var(--text)]">
                  Expected cash
                </span>

                <strong className="text-[var(--text)]">
                  {money(
                    expectedCash,
                  )}
                </strong>
              </div>

              <div className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Counted cash
                </span>

                <strong className="text-[var(--muted)]">
                  —
                </strong>
              </div>

              <div className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Difference
                </span>

                <strong className="text-[var(--muted)]">
                  —
                </strong>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <WalletCards className="h-7 w-7 text-[var(--primary)]" />

              <p className="mt-4 text-sm font-black text-[var(--text)]">
                Drawer closed
              </p>

              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">
                Open the cash drawer before taking cash payments.
              </p>

              <Link
                href="/money"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-xs font-black text-white"
              >
                Open drawer
              </Link>
            </div>
          )}
        </article>

        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <h2 className="text-base font-black text-[var(--text)]">
            Quick Actions
          </h2>

          <div className="mt-4 space-y-2">
            <Link
              href="/sales/new"
              className="flex h-11 items-center gap-3 rounded-lg bg-[var(--primary)] px-4 text-sm font-black text-white"
            >
              <Plus className="h-4 w-4" />
              New Sale
            </Link>

            <Link
              href="/products/new"
              className="flex h-11 items-center gap-3 rounded-lg bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] transition hover:text-[var(--primary)]"
            >
              <Package className="h-4 w-4" />
              Add Product
            </Link>

            <Link
              href="/stock/receive"
              className="flex h-11 items-center gap-3 rounded-lg bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] transition hover:text-[var(--primary)]"
            >
              <Boxes className="h-4 w-4" />
              Receive Stock
            </Link>

            {isOwner ? (
              <Link
                href="/expenses"
                className="flex h-11 items-center gap-3 rounded-lg bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] transition hover:text-[var(--primary)]"
              >
                <FileText className="h-4 w-4" />
                Record Expense
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(250px,0.72fr)_minmax(280px,0.83fr)]">
        <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <h2 className="text-base font-black text-[var(--text)]">
              Recent Sales
            </h2>

            <Link
              href="/sales"
              className="inline-flex items-center gap-1 text-xs font-black text-[var(--primary)]"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentSales.length > 0 ? (
            <div className="divide-y divide-[var(--border)] md:hidden">
              {recentSales.map(
                (sale) => {
                  const status =
                    saleStatus(
                      sale,
                    );

                  const names =
                    itemNamesBySale.get(
                      sale.id,
                    ) || [];

                  const itemText =
                    names.length <= 2
                      ? names.join(
                          ', ',
                        )
                      : `${names
                          .slice(
                            0,
                            2,
                          )
                          .join(
                            ', ',
                          )} +${
                          names.length -
                          2
                        }`;

                  return (
                    <Link
                      key={
                        sale.id
                      }
                      href={`/sales/${sale.id}`}
                      className="block px-4 py-4 transition hover:bg-[var(--surface)]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[var(--text)]">
                            {sale.customerName ||
                              'Walk-in'}
                          </p>

                          <p className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">
                            {itemText ||
                              'Sale items'}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="whitespace-nowrap text-sm font-black text-[var(--text)]">
                            {money(
                              sale.totalAmount,
                            )}
                          </p>

                          <p
                            className={`mt-1 text-xs font-black ${status.className}`}
                          >
                            {
                              status.text
                            }
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-4 text-[11px] font-semibold text-[var(--muted)]">
                        <span>
                          #
                          {sale.id
                            .slice(
                              0,
                              6,
                            )
                            .toUpperCase()}
                        </span>

                        <span>
                          {timeLabel(
                            sale.saleDate,
                          )}
                        </span>
                      </div>
                    </Link>
                  );
                },
              )}
            </div>
          ) : (
            <div className="px-4 py-7 text-sm font-semibold text-[var(--muted)] md:hidden">
              No sales recorded today.
            </div>
          )}

          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[0.55fr_1.12fr_1.35fr_0.95fr_0.72fr_0.62fr] gap-3 bg-[var(--surface)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)] sm:px-5">
                <span>Sale</span>
                <span>Customer</span>
                <span>Items</span>
                <span>Total</span>
                <span>Status</span>
                <span>Time</span>
              </div>

              {recentSales.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {recentSales.map(
                    (sale) => {
                      const status =
                        saleStatus(
                          sale,
                        );

                      const names =
                        itemNamesBySale.get(
                          sale.id,
                        ) || [];

                      const itemText =
                        names.length <= 2
                          ? names.join(
                              ', ',
                            )
                          : `${names
                              .slice(
                                0,
                                2,
                              )
                              .join(
                                ', ',
                              )} +${
                              names.length -
                              2
                            }`;

                      return (
                        <Link
                          key={
                            sale.id
                          }
                          href={`/sales/${sale.id}`}
                          className="grid grid-cols-[0.55fr_1.12fr_1.35fr_0.95fr_0.72fr_0.62fr] gap-3 items-center px-4 py-3 text-xs transition hover:bg-[var(--surface)] sm:px-5"
                        >
                          <span className="font-black text-[var(--muted)]">
                            #
                            {sale.id
                              .slice(
                                0,
                                6,
                              )
                              .toUpperCase()}
                          </span>

                          <span className="truncate font-bold text-[var(--text)]">
                            {sale.customerName ||
                              'Walk-in'}
                          </span>

                          <span className="truncate font-semibold text-[var(--muted)]">
                            {itemText ||
                              'Sale items'}
                          </span>

                          <span className="whitespace-nowrap font-black text-[var(--text)]">
                            {money(
                              sale.totalAmount,
                            )}
                          </span>

                          <span
                            className={`whitespace-nowrap font-black ${status.className}`}
                          >
                            {
                              status.text
                            }
                          </span>

                          <span className="whitespace-nowrap font-semibold text-[var(--muted)]">
                            {timeLabel(
                              sale.saleDate,
                            )}
                          </span>
                        </Link>
                      );
                    },
                  )}
                </div>
              ) : (
                <div className="px-5 py-8 text-sm font-semibold text-[var(--muted)]">
                  No sales recorded today.
                </div>
              )}
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <h2 className="text-base font-black text-[var(--text)]">
              Stock Alerts
            </h2>

            <Link
              href="/stock"
              className="inline-flex items-center gap-1 text-xs font-black text-[var(--primary)]"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-[1fr_0.45fr_0.55fr] bg-[var(--surface)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)] sm:px-5">
            <span>Product</span>
            <span>Stock</span>
            <span>Status</span>
          </div>

          {lowStockRows.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {lowStockRows.map(
                (product) => (
                  <div
                    key={
                      product.id
                    }
                    className="grid grid-cols-[1fr_0.45fr_0.55fr] items-center px-4 py-3 text-xs sm:px-5"
                  >
                    <span className="truncate font-bold text-[var(--text)]">
                      {
                        product.name
                      }
                    </span>

                    <span className="font-black text-[var(--text)]">
                      {
                        product.quantity
                      }
                    </span>

                    <span className="font-black text-[var(--danger)]">
                      {product.quantity <=
                      0
                        ? 'Out'
                        : 'Low'}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="px-5 py-8 text-sm font-semibold text-[var(--muted)]">
              Stock levels look good.
            </div>
          )}
        </article>

        <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <h2 className="text-base font-black text-[var(--text)]">
              Outstanding Balances
            </h2>

            <Link
              href="/debts"
              className="inline-flex items-center gap-1 text-xs font-black text-[var(--primary)]"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-[1fr_0.9fr_0.72fr] bg-[var(--surface)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)] sm:px-5">
            <span>Customer</span>
            <span>Phone</span>
            <span className="text-right">
              Balance
            </span>
          </div>

          {topBalances.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {topBalances.map(
                (
                  balance,
                  index,
                ) => (
                  <div
                    key={`${balance.name}-${balance.phone}-${index}`}
                    className="grid grid-cols-[1fr_0.9fr_0.72fr] items-center px-4 py-3 text-xs sm:px-5"
                  >
                    <span className="truncate font-bold text-[var(--text)]">
                      {
                        balance.name
                      }
                    </span>

                    <span className="truncate font-semibold text-[var(--muted)]">
                      {
                        balance.phone
                      }
                    </span>

                    <span className="text-right font-black text-[var(--text)]">
                      {money(
                        balance.balance,
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="px-5 py-8 text-sm font-semibold text-[var(--muted)]">
              No outstanding balances.
            </div>
          )}
        </article>
      </section>

      <section className="grid overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] lg:grid-cols-[0.72fr_0.82fr_1.7fr]">
        <div
          className="min-h-[190px] bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "url('/brand/dashboard-bouquet.jpg')",
          }}
          role="img"
          aria-label="Bloom Kigali flower bouquet"
        />

        <div className="flex min-h-[190px] flex-col justify-center border-t border-[var(--border)] p-6 lg:border-l lg:border-t-0">
          <p className="shop-display text-[25px] font-semibold leading-[1.12] tracking-[-0.04em] text-[var(--text)]">
            “Flowers always
            <br />
            make people feel
            <br />
            better.”
          </p>

          <div className="mt-5 h-[3px] w-10 rounded-full bg-[var(--primary)]" />
        </div>

        <div className="border-t border-[var(--border)] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <h2 className="text-lg font-black text-[var(--text)]">
            Today at a glance
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 shrink-0 text-[var(--primary)]" />

              <div>
                <p className="text-xl font-black text-[var(--text)]">
                  {todaySales.length}
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted)]">
                  Sales
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 shrink-0 text-[var(--primary)]" />

              <div>
                <p className="text-xl font-black text-[var(--text)]">
                  {customersToday}
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted)]">
                  Customers
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 shrink-0 text-[var(--primary)]" />

              <div>
                <p className="text-xl font-black text-[var(--text)]">
                  {lowStockCount}
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted)]">
                  Low stock
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 shrink-0 text-[var(--primary)]" />

              <div>
                <p className="text-xl font-black text-[var(--text)]">
                  {
                    unpaidSales.length
                  }
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted)]">
                  Unpaid sales
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
