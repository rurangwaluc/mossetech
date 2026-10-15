import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';

import {
  and,
  asc,
  eq,
  gte,
  ilike,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import {
  Boxes,
  CalendarDays,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Truck,
} from 'lucide-react';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
  saleItems,
  sales,
  stockArrivals,
  stockDamages,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import {
  StockFlash,
} from './stock-flash';

import {
  StockTable,
  type StockTableRow,
} from './stock-table';

type StockPageProps = {
  searchParams?: Promise<{
    q?: string;
    stock?: string;
    period?: string;
    from?: string;
    to?: string;
    received?: string;
    fixed?: string;
    request?: string;
    damaged?: string;
  }>;
};

type Period =
  | 'today'
  | 'week'
  | 'month'
  | 'custom'
  | 'all';

function money(
  value: number,
) {
  return `${new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
}

function localToday() {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
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
      new Date(),
    );

  const get = (
    type: string,
  ) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value || '';

  return `${get('year')}-${get(
    'month',
  )}-${get('day')}`;
}

function validYmd(
  value:
    | string
    | undefined,
) {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      ),
  );
}

function shiftYmd(
  value: string,
  days: number,
) {
  const [
    year,
    month,
    day,
  ] = value
    .split('-')
    .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + days,
      ),
    );

  return [
    date
      .getUTCFullYear()
      .toString()
      .padStart(4, '0'),

    (
      date.getUTCMonth() +
      1
    )
      .toString()
      .padStart(2, '0'),

    date
      .getUTCDate()
      .toString()
      .padStart(2, '0'),
  ].join('-');
}

function kigaliStart(
  value: string,
) {
  return new Date(
    `${value}T00:00:00+02:00`,
  );
}

function periodRange(
  period: Period,
  from?: string,
  to?: string,
) {
  const today =
    localToday();

  if (
    period === 'all'
  ) {
    return {
      start: null,
      end: null,
      label:
        'All time',
    };
  }

  if (
    period ===
    'custom'
  ) {
    const start =
      validYmd(from)
        ? kigaliStart(
            from!,
          )
        : null;

    const end =
      validYmd(to)
        ? kigaliStart(
            shiftYmd(
              to!,
              1,
            ),
          )
        : null;

    return {
      start,
      end,
      label:
        start || end
          ? `${from || 'Start'} – ${to || 'Today'}`
          : 'Custom dates',
    };
  }

  if (
    period === 'today'
  ) {
    return {
      start:
        kigaliStart(
          today,
        ),

      end:
        kigaliStart(
          shiftYmd(
            today,
            1,
          ),
        ),

      label:
        'Today',
    };
  }

  if (
    period === 'month'
  ) {
    const [
      year,
      month,
    ] = today
      .split('-')
      .map(Number);

    const startYmd =
      `${year}-${String(
        month,
      ).padStart(
        2,
        '0',
      )}-01`;

    const nextMonth =
      new Date(
        Date.UTC(
          year,
          month,
          1,
        ),
      );

    const endYmd = [
      nextMonth
        .getUTCFullYear()
        .toString()
        .padStart(4, '0'),

      (
        nextMonth.getUTCMonth() +
        1
      )
        .toString()
        .padStart(2, '0'),

      '01',
    ].join('-');

    return {
      start:
        kigaliStart(
          startYmd,
        ),

      end:
        kigaliStart(
          endYmd,
        ),

      label:
        'This month',
    };
  }

  const [
    year,
    month,
    day,
  ] = today
    .split('-')
    .map(Number);

  const weekday =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    ).getUTCDay();

  const daysFromMonday =
    (
      weekday +
      6
    ) % 7;

  const weekStart =
    shiftYmd(
      today,
      -daysFromMonday,
    );

  return {
    start:
      kigaliStart(
        weekStart,
      ),

    end:
      kigaliStart(
        shiftYmd(
          weekStart,
          7,
        ),
      ),

    label:
      'This week',
  };
}

export default async function StockPage({
  searchParams,
}: StockPageProps) {
  await requirePermission('stock.view');

  const params =
    await searchParams;

  const q =
    params?.q?.trim() ||
    '';

  const selectedStock =
    params?.stock ===
      'LOW' ||
    params?.stock ===
      'OUT'
      ? params.stock
      : '';

  const selectedPeriod: Period =
    params?.period ===
      'today' ||
    params?.period ===
      'month' ||
    params?.period ===
      'custom' ||
    params?.period ===
      'all'
      ? params.period
      : 'week';

  const from =
    validYmd(
      params?.from,
    )
      ? params!.from!
      : '';

  const to =
    validYmd(
      params?.to,
    )
      ? params!.to!
      : '';

  const range =
    periodRange(
      selectedPeriod,
      from,
      to,
    );

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

  const tableCondition =
    and(
      baseCondition,
      searchCondition,
    );

  const arrivalPeriodCondition =
    and(
      range.start
        ? gte(
            stockArrivals.arrivedAt,
            range.start,
          )
        : undefined,

      range.end
        ? lt(
            stockArrivals.arrivedAt,
            range.end,
          )
        : undefined,
    );

  const salePeriodCondition =
    and(
      range.start
        ? gte(
            sales.saleDate,
            range.start,
          )
        : undefined,

      range.end
        ? lt(
            sales.saleDate,
            range.end,
          )
        : undefined,
    );

  const [
    productRows,
    importedRows,
    soldRows,
    damagedRows,
    periodImported,
    periodSales,
    activeProductPrices,
  ] = await Promise.all([
    db
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

        minQuantity:
          products.minQuantity,
      })
      .from(products)
      .where(
        tableCondition,
      )
      .orderBy(
        asc(
          products.name,
        ),
      ),

    db
      .select({
        productId:
          stockArrivals.productId,

        imported:
          sql<string>`
            COALESCE(
              SUM(
                ${stockArrivals.quantityReceived}
              ),
              0
            )
          `,

        importedValue:
          sql<string>`
            COALESCE(
              SUM(
                ${stockArrivals.quantityReceived}
                *
                ${stockArrivals.sellingPriceSnapshot}::numeric
              ),
              0
            )
          `,
      })
      .from(
        stockArrivals,
      )
      .groupBy(
        stockArrivals.productId,
      ),

    db
      .select({
        productId:
          saleItems.productId,

        sold:
          sql<string>`
            COALESCE(
              SUM(
                ${saleItems.quantity}
              ),
              0
            )
          `,

        salesValue:
          sql<string>`
            COALESCE(
              SUM(
                ${saleItems.lineTotal}::numeric
              ),
              0
            )
          `,
      })
      .from(saleItems)
      .innerJoin(
        sales,
        eq(
          saleItems.saleId,
          sales.id,
        ),
      )
      .groupBy(
        saleItems.productId,
      ),

    db
      .select({
        productId:
          stockDamages.productId,

        damaged:
          sql<string>`
            COALESCE(
              SUM(
                ${stockDamages.quantityDamaged}
              ),
              0
            )
          `,
      })
      .from(
        stockDamages,
      )
      .groupBy(
        stockDamages.productId,
      ),

    db
      .select({
        imported:
          sql<string>`
            COALESCE(
              SUM(
                ${stockArrivals.quantityReceived}
              ),
              0
            )
          `,

        importedValue:
          sql<string>`
            COALESCE(
              SUM(
                ${stockArrivals.quantityReceived}
                *
                ${stockArrivals.sellingPriceSnapshot}::numeric
              ),
              0
            )
          `,
      })
      .from(
        stockArrivals,
      )
      .where(
        arrivalPeriodCondition,
      ),

    db
      .select({
        sold:
          sql<string>`
            COALESCE(
              SUM(
                ${saleItems.quantity}
              ),
              0
            )
          `,

        salesValue:
          sql<string>`
            COALESCE(
              SUM(
                ${saleItems.lineTotal}::numeric
              ),
              0
            )
          `,
      })
      .from(saleItems)
      .innerJoin(
        sales,
        eq(
          saleItems.saleId,
          sales.id,
        ),
      )
      .where(
        salePeriodCondition,
      ),

    db
      .select({
        id:
          products.id,

        sellingPrice:
          products.sellingPrice,
      })
      .from(products)
      .where(
        baseCondition,
      ),
  ]);

  const importedMap =
    new Map(
      importedRows.map(
        (row) => [
          row.productId,
          {
            imported:
              Number(
                row.imported ||
                  0,
              ),

            importedValue:
              Number(
                row.importedValue ||
                  0,
              ),
          },
        ],
      ),
    );

  const soldMap =
    new Map(
      soldRows.map(
        (row) => [
          row.productId,
          {
            sold:
              Number(
                row.sold ||
                  0,
              ),

            salesValue:
              Number(
                row.salesValue ||
                  0,
              ),
          },
        ],
      ),
    );

  const damagedMap =
    new Map(
      damagedRows.map(
        (row) => [
          row.productId,
          Number(
            row.damaged ||
              0,
          ),
        ],
      ),
    );

  const unfilteredRows: StockTableRow[] =
    productRows.map(
      (product) => {
        const imported =
          importedMap.get(
            product.id,
          ) || {
            imported: 0,
            importedValue:
              0,
          };

        const sold =
          soldMap.get(
            product.id,
          ) || {
            sold: 0,
            salesValue: 0,
          };

        const damaged =
          damagedMap.get(
            product.id,
          ) || 0;

        const remaining =
          imported.imported -
          sold.sold -
          damaged;

        const unitPrice =
          Number(
            product.sellingPrice,
          );

        return {
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

          unitPrice,

          imported:
            imported.imported,

          sold:
            sold.sold,

          remaining,

          importedValue:
            imported.importedValue,

          salesValue:
            sold.salesValue,

          remainingValue:
            remaining *
            unitPrice,

          damaged,

          minQuantity:
            product.minQuantity,
        };
      },
    );

  const rows =
    unfilteredRows.filter(
      (row) => {
        if (
          selectedStock ===
          'OUT'
        ) {
          return (
            row.remaining <= 0
          );
        }

        if (
          selectedStock ===
          'LOW'
        ) {
          return (
            row.remaining > 0 &&
            row.remaining <=
              row.minQuantity
          );
        }

        return true;
      },
    );

  const importedUnits =
    Number(
      periodImported[0]
        ?.imported ||
        0,
    );

  const importedValue =
    Number(
      periodImported[0]
        ?.importedValue ||
        0,
    );

  const soldUnits =
    Number(
      periodSales[0]
        ?.sold ||
        0,
    );

  const salesValue =
    Number(
      periodSales[0]
        ?.salesValue ||
        0,
    );

  const remainingSummary =
    activeProductPrices.reduce(
      (
        summary,
        product,
      ) => {
        const imported =
          importedMap.get(
            product.id,
          )?.imported || 0;

        const sold =
          soldMap.get(
            product.id,
          )?.sold || 0;

        const damaged =
          damagedMap.get(
            product.id,
          ) || 0;

        const remaining =
          imported -
          sold -
          damaged;

        return {
          units:
            summary.units +
            remaining,

          value:
            summary.value +
            remaining *
              Number(
                product.sellingPrice,
              ),
        };
      },
      {
        units: 0,
        value: 0,
      },
    );

  const remainingUnits =
    remainingSummary.units;

  const remainingValue =
    remainingSummary.value;

  return (
    <section className="space-y-4">
      {params?.damaged ===
      '1' ? (
        <StockFlash
          param="damaged"
          message="Damaged stock recorded."
        />
      ) : null}

      {params?.received ===
      '1' ? (
        <StockFlash
          param="received"
          message="Stock receipt saved. Changes sync automatically."
        />
      ) : null}

      {params?.fixed ===
      '1' ? (
        <StockFlash
          param="fixed"
          message="Stock correction applied."
        />
      ) : null}

      {params?.request ===
      '1' ? (
        <StockFlash
          param="request"
          message="Correction request sent to the owner."
        />
      ) : null}

      <p className="-mt-1 text-sm font-bold text-[var(--muted)]">
        Track flowers received,
        sold, damaged and currently
        available.
      </p>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <PackagePlus className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--muted)]">
                Imported Stock
                Value
              </p>

              <p className="mt-1 truncate text-xl font-black tracking-tight tabular-nums text-[var(--text)] sm:text-2xl">
                {money(
                  importedValue,
                )}
              </p>

              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {importedUnits}{' '}
                units imported
                {' / '}
                {range.label}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShoppingCart className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--muted)]">
                Sales Value
              </p>

              <p className="mt-1 truncate text-xl font-black tracking-tight tabular-nums text-[var(--text)] sm:text-2xl">
                {money(
                  salesValue,
                )}
              </p>

              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {soldUnits}{' '}
                units sold
                {' / '}
                {range.label}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text)]">
              <Boxes className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--muted)]">
                Remaining Stock
                Value
              </p>

              <p className="mt-1 truncate text-xl font-black tracking-tight tabular-nums text-[var(--text)] sm:text-2xl">
                {money(
                  remainingValue,
                )}
              </p>

              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {remainingUnits}{' '}
                units remaining
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <form className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[180px_170px_minmax(220px,1fr)_auto]">
            <div>
              <label
                htmlFor="period"
                className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]"
              >
                Activity period
              </label>

              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

                <select
                  id="period"
                  name="period"
                  defaultValue={
                    selectedPeriod
                  }
                  className="h-11 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--card)] pl-10 pr-3 text-sm font-black text-[var(--text)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="today">
                    Today
                  </option>

                  <option value="week">
                    This week
                  </option>

                  <option value="month">
                    This month
                  </option>

                  <option value="custom">
                    Custom dates
                  </option>

                  <option value="all">
                    All time
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="stock"
                className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]"
              >
                Stock
              </label>

              <select
                id="stock"
                name="stock"
                defaultValue={
                  selectedStock
                }
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-black text-[var(--text)] outline-none focus:border-[var(--primary)]"
              >
                <option value="">
                  All stock
                </option>

                <option value="LOW">
                  Low stock
                </option>

                <option value="OUT">
                  Out of stock
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="q"
                className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]"
              >
                Search
              </label>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

                <input
                  id="q"
                  name="q"
                  defaultValue={
                    q
                  }
                  placeholder="Search products"
                  className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-10 pr-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                />
              </div>
            </div>

            <button className="h-11 self-end rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]">
              Apply
            </button>

            {selectedPeriod ===
            'custom' ? (
              <>
                <div>
                  <label
                    htmlFor="from"
                    className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]"
                  >
                    From
                  </label>

                  <input
                    id="from"
                    name="from"
                    type="date"
                    defaultValue={
                      from
                    }
                    className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="to"
                    className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]"
                  >
                    To
                  </label>

                  <input
                    id="to"
                    name="to"
                    type="date"
                    defaultValue={
                      to
                    }
                    className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </>
            ) : null}
          </form>

          <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:shrink-0">
            <Link
              href="/products/new"
              prefetch
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--primary)] px-4 text-sm font-black text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
            >
              <Plus className="h-4 w-4" />
              Add product
            </Link>

            <Link
              href="/stock/receive"
              prefetch
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
            >
              <Truck className="h-4 w-4" />
              Receive stock
            </Link>
          </div>
        </div>

        <p className="mt-3 text-xs font-bold text-[var(--muted)]">
          Imported, sold and
          damaged quantities in
          the table are cumulative.
          The selected period
          changes the Imported
          Stock Value and Sales
          Value cards.
        </p>
      </section>

      <StockTable
        rows={rows}
      />
    </section>
  );
}
