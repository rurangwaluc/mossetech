import Link from 'next/link';
import {
  ArrowRight,
  Download,
} from 'lucide-react';
import { requireOwner } from '@/lib/auth/session';
import {
  getReport,
  money,
  type ReportFilters,
  type ReportPreset,
} from '@/lib/reports/report-data';

type ReportsPageProps = {
  searchParams?: Promise<{
    preset?: string;
    fromDate?: string;
    fromTime?: string;
    toDate?: string;
    toTime?: string;
  }>;
};

type Tone =
  | 'normal'
  | 'positive'
  | 'negative';

const PRESETS: Array<{
  value: ReportPreset;
  label: string;
}> = [
  {
    value: 'today',
    label: 'Today',
  },
  {
    value: 'yesterday',
    label: 'Yesterday',
  },
  {
    value: 'week',
    label: 'This week',
  },
  {
    value: 'month',
    label: 'This month',
  },
  {
    value: 'custom',
    label: 'Custom',
  },
];

function reportQuery(
  filters: ReportFilters,
) {
  const params =
    new URLSearchParams();

  params.set(
    'preset',
    filters.preset,
  );

  if (
    filters.preset ===
    'custom'
  ) {
    params.set(
      'fromDate',
      filters.fromDate,
    );

    params.set(
      'fromTime',
      filters.fromTime,
    );

    params.set(
      'toDate',
      filters.toDate,
    );

    params.set(
      'toTime',
      filters.toTime,
    );
  }

  return params.toString();
}

function valueClass(
  tone: Tone,
) {
  if (
    tone === 'negative'
  ) {
    return 'text-[#E85D5D]';
  }

  if (
    tone === 'positive'
  ) {
    return 'text-[#5F8A63] dark:text-[#79C27D]';
  }

  return 'text-[#222222] dark:text-[#F5F5F5]';
}

function Value({
  children,
  tone = 'normal',
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`font-black tabular-nums ${valueClass(
        tone,
      )}`}
    >
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)] sm:text-[11px]">
          {eyebrow}
        </p>

        <h2 className="mt-1 font-display text-lg font-black text-[#222222] dark:text-[#F5F5F5]">
          {title}
        </h2>
      </div>

      {action}
    </div>
  );
}

function MobileRow({
  label,
  value,
  detail,
  tone = 'normal',
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone?: Tone;
}) {
  return (
    <div className="border-t border-neutral-200 py-3.5 first:border-t-0 dark:border-[#343434]">
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
          {label}
        </p>

        <div className="shrink-0 text-right text-sm">
          <Value
            tone={tone}
          >
            {value}
          </Value>
        </div>
      </div>

      {detail ? (
        <p className="mt-1.5 pr-2 text-xs font-semibold leading-5 text-[#7D7D7D] dark:text-[#8F8F8F]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: ReportsPageProps) {
  await requireOwner();

  const params =
    await searchParams;

  const report =
    await getReport({
      preset:
        params?.preset,
      fromDate:
        params?.fromDate,
      fromTime:
        params?.fromTime,
      toDate:
        params?.toDate,
      toTime:
        params?.toTime,
    });

  const {
    summary,
    receivables,
    stock,
    filters,
  } = report;

  const query =
    reportQuery(
      filters,
    );

  const summaryRows: Array<{
    key: string;
    label: string;
    value: string;
    detail: string;
    tone: Tone;
  }> = [
    {
      key: 'sales',
      label: 'Sales',
      value:
        money(
          summary.salesTotal,
        ),
      detail: `${summary.salesCount} ${
        summary.salesCount ===
        1
          ? 'sale'
          : 'sales'
      }`,
      tone: 'normal',
    },
    {
      key: 'received',
      label:
        'Money received',
      value:
        money(
          summary.moneyReceived,
        ),
      detail:
        'Customer payments received in this period',
      tone:
        summary.moneyReceived >
        0
          ? 'positive'
          : 'normal',
    },
    {
      key: 'expenses',
      label: 'Expenses',
      value:
        money(
          summary.expensesTotal,
        ),
      detail:
        'Business money spent in this period',
      tone:
        summary.expensesTotal >
        0
          ? 'negative'
          : 'normal',
    },
    {
      key: 'discounts',
      label: 'Discounts',
      value:
        money(
          summary.discountTotal,
        ),
      detail:
        summary.discountTotal >
        0
          ? `Sales before discount: ${money(
              summary.salesBeforeDiscount,
            )}`
          : 'No discounts given',
      tone: 'normal',
    },
  ];

  const paymentRows =
    report.paymentRows.length >
    0
      ? report.paymentRows.map(
          (row) => ({
            key:
              `payment-${row.method}`,
            label:
              row.name,
            value:
              money(
                row.total,
              ),
            detail:
              row.later > 0
                ? `${money(
                    row.atSale,
                  )} at sale / ${money(
                    row.later,
                  )} later`
                : 'Customer payments received',
            tone:
              row.total > 0
                ? ('positive' as Tone)
                : ('normal' as Tone),
          }),
        )
      : [
          {
            key:
              'customer-payments-none',
            label:
              'Customer payments',
            value:
              money(0),
            detail:
              'No customer payments received in this period',
            tone:
              'normal' as Tone,
          },
        ];

  const expenseRows =
    report.expenseCategoryRows.map(
      (row) => ({
        key:
          `expense-${row.category}`,
        label:
          `Expense / ${row.category}`,
        value:
          money(
            row.total,
          ),
        detail:
          'Business expense',
        tone:
          'negative' as Tone,
      }),
    );

  const moneyRows = [
    ...paymentRows,
    ...expenseRows,
  ];

  return (
    <section className="space-y-7 pb-6">
      <header className="border-b border-neutral-200 pb-5 dark:border-[#343434]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
              {
                report.period
                  .label
              }
            </p>
          </div>

          <Link
            href={`/reports/download?${query}&mode=download`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Link>
        </div>

        <nav
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Report period"
        >
          {PRESETS.map(
            (preset) => {
              const active =
                filters.preset ===
                preset.value;

              return (
                <Link
                  key={
                    preset.value
                  }
                  href={`/reports?preset=${preset.value}`}
                  className={
                    active
                      ? 'shrink-0 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-black text-white'
                      : 'shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-bold text-[#6B7280] transition hover:border-[var(--primary)] hover:text-[var(--primary)] dark:border-[#343434] dark:text-[#A3A3A3]'
                  }
                >
                  {
                    preset.label
                  }
                </Link>
              );
            },
          )}
        </nav>

        {filters.preset ===
        'custom' ? (
          <form
            action="/reports"
            className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 dark:border-[#343434] sm:grid-cols-2 xl:grid-cols-[1fr_0.7fr_1fr_0.7fr_auto]"
          >
            <input
              type="hidden"
              name="preset"
              value="custom"
            />

            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[#6B7280] dark:text-[#A3A3A3]">
                From date
              </span>

              <input
                type="date"
                name="fromDate"
                required
                defaultValue={
                  filters.fromDate
                }
                className="h-11 w-full rounded-lg border border-neutral-200 bg-transparent px-3 text-sm font-bold text-[#222222] outline-none focus:border-[var(--primary)] dark:border-[#343434] dark:text-[#F5F5F5]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[#6B7280] dark:text-[#A3A3A3]">
                From time
              </span>

              <input
                type="time"
                name="fromTime"
                required
                defaultValue={
                  filters.fromTime
                }
                className="h-11 w-full rounded-lg border border-neutral-200 bg-transparent px-3 text-sm font-bold text-[#222222] outline-none focus:border-[var(--primary)] dark:border-[#343434] dark:text-[#F5F5F5]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[#6B7280] dark:text-[#A3A3A3]">
                To date
              </span>

              <input
                type="date"
                name="toDate"
                required
                defaultValue={
                  filters.toDate
                }
                className="h-11 w-full rounded-lg border border-neutral-200 bg-transparent px-3 text-sm font-bold text-[#222222] outline-none focus:border-[var(--primary)] dark:border-[#343434] dark:text-[#F5F5F5]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[#6B7280] dark:text-[#A3A3A3]">
                To time
              </span>

              <input
                type="time"
                name="toTime"
                required
                defaultValue={
                  filters.toTime
                }
                className="h-11 w-full rounded-lg border border-neutral-200 bg-transparent px-3 text-sm font-bold text-[#222222] outline-none focus:border-[var(--primary)] dark:border-[#343434] dark:text-[#F5F5F5]"
              />
            </label>

            <button
              type="submit"
              className="h-11 w-full self-end rounded-lg bg-[#222222] px-5 text-sm font-black text-white dark:bg-[#F5F5F5] dark:text-[#222222] sm:w-auto xl:w-full"
            >
              Apply
            </button>
          </form>
        ) : null}

        {report.period.error ? (
          <p className="mt-3 text-sm font-bold text-[#E85D5D]">
            {
              report.period
                .error
            }
          </p>
        ) : null}
      </header>

      <section>
        <SectionHeading
          eyebrow="Summary"
          title="Period activity"
        />

        <div className="md:hidden">
          {summaryRows.map(
            (row) => (
              <MobileRow
                key={
                  row.key
                }
                label={
                  row.label
                }
                value={
                  row.value
                }
                detail={
                  row.detail
                }
                tone={
                  row.tone
                }
              />
            ),
          )}
        </div>

        <div className="hidden overflow-hidden border-y border-neutral-200 dark:border-[#343434] md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FAFAFC] text-left dark:bg-[#1B1B1B]">
                <th className="w-[30%] px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Metric
                </th>

                <th className="w-[22%] px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Value
                </th>

                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Detail
                </th>
              </tr>
            </thead>

            <tbody>
              {summaryRows.map(
                (row) => (
                  <tr
                    key={
                      row.key
                    }
                    className="border-t border-neutral-200 dark:border-[#343434]"
                  >
                    <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                      {
                        row.label
                      }
                    </td>

                    <td className="px-4 py-3.5 text-right text-sm">
                      <Value
                        tone={
                          row.tone
                        }
                      >
                        {
                          row.value
                        }
                      </Value>
                    </td>

                    <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                      {
                        row.detail
                      }
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Money"
          title="Money and receivables"
          action={
            <Link
              href="/debts"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-[var(--primary)]"
            >
              View debts
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />

        <div className="md:hidden">
          {moneyRows.map(
            (row) => (
              <MobileRow
                key={
                  row.key
                }
                label={
                  row.label
                }
                value={
                  row.value
                }
                detail={
                  row.detail
                }
                tone={
                  row.tone
                }
              />
            ),
          )}

          <MobileRow
            label="Outstanding"
            value={money(
              receivables.currentOutstanding,
            )}
            detail="Current total across all unpaid sales"
          />

          <MobileRow
            label="Unpaid sales"
            value={
              receivables.unpaidSalesCount
            }
            detail={
              receivables.unpaidSalesCount ===
              0
                ? 'No customer balances are outstanding'
                : receivables.unpaidSalesCount ===
                    1
                  ? '1 sale still has money owed'
                  : `${receivables.unpaidSalesCount} sales still have money owed`
            }
          />
        </div>

        <div className="hidden overflow-hidden border-y border-neutral-200 dark:border-[#343434] md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FAFAFC] text-left dark:bg-[#1B1B1B]">
                <th className="w-[30%] px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Category
                </th>

                <th className="w-[22%] px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Value
                </th>

                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Detail
                </th>
              </tr>
            </thead>

            <tbody>
              {moneyRows.map(
                (row) => (
                  <tr
                    key={
                      row.key
                    }
                    className="border-t border-neutral-200 dark:border-[#343434]"
                  >
                    <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                      {
                        row.label
                      }
                    </td>

                    <td className="px-4 py-3.5 text-right text-sm">
                      <Value
                        tone={
                          row.tone
                        }
                      >
                        {
                          row.value
                        }
                      </Value>
                    </td>

                    <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                      {
                        row.detail
                      }
                    </td>
                  </tr>
                ),
              )}

              <tr className="border-t-2 border-neutral-300 dark:border-[#454545]">
                <td className="px-4 py-3.5 text-sm font-black text-[#222222] dark:text-[#F5F5F5]">
                  Outstanding
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {money(
                      receivables.currentOutstanding,
                    )}
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                  Current total
                  across all unpaid
                  sales
                </td>
              </tr>

              <tr className="border-t border-neutral-200 dark:border-[#343434]">
                <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                  Unpaid sales
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {
                      receivables.unpaidSalesCount
                    }
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                  {receivables.unpaidSalesCount ===
                  0
                    ? 'No customer balances are outstanding'
                    : receivables.unpaidSalesCount ===
                        1
                      ? '1 sale still has money owed'
                      : `${receivables.unpaidSalesCount} sales still have money owed`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Stock"
          title="Stock position"
        />

        <div className="md:hidden">
          <div className="border-t border-neutral-200 py-3.5 dark:border-[#343434]">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]">
                Current remaining
              </p>

              <div className="text-right">
                <p className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]">
                  {
                    stock.remainingUnits
                  }{' '}
                  units
                </p>

                <p className="mt-1 text-xs font-black text-[#222222] dark:text-[#F5F5F5]">
                  {money(
                    stock.remainingValue,
                  )}
                </p>
              </div>
            </div>

            <p className="mt-1.5 text-xs font-semibold leading-5 text-[#7D7D7D] dark:text-[#8F8F8F]">
              Current ledger /
              current selling
              prices
            </p>
          </div>

          <MobileRow
            label="Received"
            value={`${stock.receivedUnits} units`}
            detail={`${money(
              stock.receivedValue,
            )} / selling price at receipt`}
          />

          <MobileRow
            label="Sold"
            value={`${stock.soldUnits} units`}
            detail={`${money(
              stock.soldValue,
            )} / sale item value`}
          />

          <MobileRow
            label="Damaged"
            value={`${stock.damagedUnits} units`}
            detail="Quantity only"
          />
        </div>

        <div className="hidden overflow-hidden border-y border-neutral-200 dark:border-[#343434] md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FAFAFC] text-left dark:bg-[#1B1B1B]">
                <th className="w-[28%] px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Metric
                </th>

                <th className="w-[18%] px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Quantity
                </th>

                <th className="w-[22%] px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Value
                </th>

                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                  Notes
                </th>
              </tr>
            </thead>

            <tbody>
              <tr className="border-t border-neutral-200 dark:border-[#343434]">
                <td className="px-4 py-3.5 text-sm font-black text-[#222222] dark:text-[#F5F5F5]">
                  Current remaining
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {
                      stock.remainingUnits
                    }{' '}
                    units
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {money(
                      stock.remainingValue,
                    )}
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                  Current ledger /
                  current selling
                  prices
                </td>
              </tr>

              <tr className="border-t border-neutral-200 dark:border-[#343434]">
                <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                  Received
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {
                      stock.receivedUnits
                    }{' '}
                    units
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {money(
                      stock.receivedValue,
                    )}
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                  Selected period /
                  selling price at
                  receipt
                </td>
              </tr>

              <tr className="border-t border-neutral-200 dark:border-[#343434]">
                <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                  Sold
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {
                      stock.soldUnits
                    }{' '}
                    units
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {money(
                      stock.soldValue,
                    )}
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                  Selected period /
                  sale item value
                </td>
              </tr>

              <tr className="border-t border-neutral-200 dark:border-[#343434]">
                <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                  Damaged
                </td>

                <td className="px-4 py-3.5 text-right text-sm">
                  <Value>
                    {
                      stock.damagedUnits
                    }{' '}
                    units
                  </Value>
                </td>

                <td className="px-4 py-3.5 text-right text-sm font-bold text-[#8B8B8B]">
                  —
                </td>

                <td className="px-4 py-3.5 text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                  Selected period /
                  quantity only
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {report.productRows.length >
      0 ? (
        <section>
          <SectionHeading
            eyebrow="Products"
            title="Best sellers"
          />

          <div className="md:hidden">
            {report.productRows.map(
              (row) => (
                <MobileRow
                  key={
                    row.id
                  }
                  label={
                    row.name
                  }
                  value={money(
                    row.salesValue,
                  )}
                  detail={`${row.quantity} sold`}
                />
              ),
            )}
          </div>

          <div className="hidden overflow-hidden border-y border-neutral-200 dark:border-[#343434] md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FAFAFC] text-left dark:bg-[#1B1B1B]">
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                    Product
                  </th>

                  <th className="w-[22%] px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                    Quantity sold
                  </th>

                  <th className="w-[24%] px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#A3A3A3]">
                    Sales value
                  </th>
                </tr>
              </thead>

              <tbody>
                {report.productRows.map(
                  (row) => (
                    <tr
                      key={
                        row.id
                      }
                      className="border-t border-neutral-200 dark:border-[#343434]"
                    >
                      <td className="px-4 py-3.5 text-sm font-bold text-[#222222] dark:text-[#F5F5F5]">
                        {
                          row.name
                        }
                      </td>

                      <td className="px-4 py-3.5 text-right text-sm">
                        <Value>
                          {
                            row.quantity
                          }
                        </Value>
                      </td>

                      <td className="px-4 py-3.5 text-right text-sm">
                        <Value>
                          {money(
                            row.salesValue,
                          )}
                        </Value>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
