import Link from 'next/link';
import {
  ArrowRight,
  Download,
} from 'lucide-react';
import { requirePermission } from '@/lib/auth/require-permission';
import { hasEmployeePermission } from '@/lib/auth/permissions';
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


type OverviewCardProps = {
  label: string;
  value: string;
  detail: string;
  accent?: 'positive' | 'negative';
};

function OverviewCard({ label, value, detail, accent }: OverviewCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <p className="text-xs font-bold text-[var(--muted)]">{label}</p>
      <p className={`mt-2 break-words text-xl font-black tabular-nums sm:text-2xl ${
        accent === 'negative' ? 'text-red-600 dark:text-red-400' :
        accent === 'positive' ? 'text-emerald-700 dark:text-emerald-400' :
        'text-[var(--text)]'
      }`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--border)] py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
        {note ? <p className="mt-0.5 text-xs text-[var(--muted)]">{note}</p> : null}
      </div>
      <span className="shrink-0 text-sm font-black tabular-nums text-[var(--text)]">{value}</span>
    </div>
  );
}

function ReportSection({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-black text-[var(--text)] sm:text-lg">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: ReportsPageProps) {
  const user = await requirePermission('reports.view');
  const canDownload = await hasEmployeePermission(
    user,
    'reports.download',
  );

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

  return (
    <section className="space-y-7 pb-8">
      <header className="border-b border-[var(--border)] pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-[var(--text)]">Reports</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {
                report.period
                  .label
              }
            </p>
          </div>

          <Link
            href={canDownload ? `/reports/download?${query}&mode=download` : '#'}
            aria-disabled={!canDownload}
            tabIndex={canDownload ? undefined : -1}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)] sm:w-auto"
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
                      ? 'shrink-0 rounded-lg bg-[var(--primary-action)] px-3 py-2 text-sm font-black text-white'
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

      <ReportSection title="Performance" description="Activity during the selected period. External stock sales are included in total sales.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard label="Total sales" value={money(summary.salesTotal)} detail={`${summary.salesCount} completed sale${summary.salesCount === 1 ? '' : 's'}`} />
          <OverviewCard label="Money received" value={money(summary.moneyReceived)} detail="Customer payments received during this period" />
          <OverviewCard label="Business expenses" value={money(summary.expensesTotal)} detail="Recorded expenses during this period" />
          <OverviewCard label="Profit after expenses" value={summary.netProfit === null ? 'Cost missing' : money(summary.netProfit)} accent={summary.netProfit !== null && summary.netProfit < 0 ? 'negative' : 'positive'} detail={summary.netProfit === null ? 'Some product costs are missing; profit cannot be confirmed' : 'Sales less product costs and recorded expenses'} />
        </div>
      </ReportSection>

      <ReportSection title="Money still owed" description="Current outstanding balances, not sales or expenses for the selected period.">
        <div className="grid gap-3 sm:grid-cols-2">
          <OverviewCard label="Customers owe us" value={money(receivables.currentOutstanding)} detail={`${receivables.unpaidSalesCount} sale${receivables.unpaidSalesCount === 1 ? '' : 's'} with unpaid balances`} />
          <OverviewCard label="We owe suppliers" value={money(report.external.supplierOutstanding)} accent={report.external.supplierOutstanding > 0 ? 'negative' : undefined} detail="Unpaid external-source shop balances; stays until settled" />
        </div>
        <Link href="/debts" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--primary)]">
          View customer debts <ArrowRight className="h-4 w-4" />
        </Link>
      </ReportSection>

      <ReportSection title="Stock overview" description="Remaining stock is the current position. Stock movements reflect the selected period.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard label="Remaining stock" value={`${stock.remainingUnits.toLocaleString('en-US')} units`} detail="Current quantity in inventory" />
          <OverviewCard label="Selling value of stock" value={money(stock.remainingValue)} detail="Estimated at current selling prices; not stock cost or profit" />
          <OverviewCard label="Received" value={`${stock.receivedUnits.toLocaleString('en-US')} units`} detail="Added during selected period" />
          <OverviewCard label="Sold" value={`${stock.soldUnits.toLocaleString('en-US')} units`} detail="Sold from owned inventory in selected period" />
        </div>
      </ReportSection>

      <details className="group rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-black text-[var(--text)] sm:p-5 [&::-webkit-details-marker]:hidden">
          Detailed financial breakdown
          <span className="text-xs font-semibold text-[var(--muted)] group-open:hidden">Show details +</span>
          <span className="hidden text-xs font-semibold text-[var(--muted)] group-open:inline">Hide details −</span>
        </summary>
        <div className="border-t border-[var(--border)] px-4 pb-2 sm:px-5">
          <DetailRow label="External stock sales" value={money(report.external.salesTotal)} note={`${report.external.salesCount} completed external sale(s); already included in total sales`} />
          <DetailRow label="External source shop costs" value={money(report.external.supplierCost)} note="Included in product costs, not an additional expense" />
          <DetailRow label="External stock gross profit" value={money(report.external.grossProfit)} note="Already included in overall gross profit" />
          <DetailRow label="Cost of goods sold" value={money(summary.costOfGoodsSold)} note={summary.missingCostItems > 0 ? `${summary.missingCostItems} sale item(s) missing cost` : 'Recorded cost of products sold'} />
          <DetailRow label="Profit before business expenses" value={summary.grossProfit === null ? 'Cost missing' : money(summary.grossProfit)} />
          <DetailRow label="Discounts" value={money(summary.discountTotal)} />
          <DetailRow label="Damaged stock" value={`${stock.damagedUnits} units`} />
          {report.paymentRows.map(row => (
            <DetailRow key={row.method} label={`${row.name} received`} value={money(row.total)} note={row.later > 0 ? `${money(row.atSale)} at sale / ${money(row.later)} later` : undefined} />
          ))}
          {report.expenseCategoryRows.map(row => (
            <DetailRow key={row.category} label={`Expense: ${row.category}`} value={money(row.total)} />
          ))}
        </div>
      </details>

      {report.productRows.length > 0 ? (
        <ReportSection title="Best-selling products" description="Product sales during the selected period.">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 sm:px-5">
            {report.productRows.map(row => (
              <DetailRow key={row.id} label={row.name} value={money(row.salesValue)} note={`${row.quantity} units sold`} />
            ))}
          </div>
        </ReportSection>
      ) : null}
    </section>
  );
}
