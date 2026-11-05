import Link from 'next/link';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
} from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  externalCustomerPayments,
  externalSales,
  externalSupplierSettlements,
  suppliers,
} from '@mossetech/db/schema';

import { requirePermission } from '@/lib/auth/require-permission';
import {
  calculateExternalSaleBalances,
  parseMoney,
} from '@/lib/external-sales/money';

const PAGE_SIZE = 10;

function rwf(cents: number) {
  return `${new Intl.NumberFormat('en-RW', {
    maximumFractionDigits: 2,
  }).format(cents / 100)} RWF`;
}

function statusLabel(status: string) {
  switch (status) {
    case 'DRAFT': return 'Draft';
    case 'POSTED': return 'Completed';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

function paymentStatus(
  status: string,
  totalCents: number,
  paidCents: number,
) {
  if (status !== 'POSTED') return '—';
  if (totalCents === 0 || paidCents >= totalCents) return 'Paid';
  if (paidCents === 0) return 'Not Paid';
  return 'Partly Paid';
}

type Params = {
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function ExternalSalesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePermission('sales.view');

  const params = await searchParams;
  const q = single(params.q).trim().slice(0, 100);
  const requestedStatus = single(params.status);

  const status = [
    'ALL', 'DRAFT', 'POSTED', 'CANCELLED',
  ].includes(requestedStatus) ? requestedStatus : 'ALL';

  const pageText = single(params.page);
  const parsedPage = /^[1-9]\d*$/.test(pageText)
    ? Number(pageText)
    : 1;
  const requestedPage = Number.isSafeInteger(parsedPage)
    ? Math.min(parsedPage, 1000000)
    : 1;

  const searchCondition = q
    ? or(
        ilike(externalSales.productName, `%${q}%`),
        ilike(externalSales.customerName, `%${q}%`),
        ilike(suppliers.name, `%${q}%`),
      )
    : undefined;

  const conditions = and(
    status === 'ALL'
      ? undefined
      : eq(externalSales.status, status),
    searchCondition,
  );

  const [totalResult, statusCounts] = await Promise.all([
    db.select({ total: count() })
      .from(externalSales)
      .innerJoin(suppliers, eq(externalSales.supplierId, suppliers.id))
      .where(conditions),

    db.select({
      status: externalSales.status,
      total: count(),
    })
      .from(externalSales)
      .groupBy(externalSales.status),
  ]);

  const total = totalResult[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const sales = await db.select({
    id: externalSales.id,
    productName: externalSales.productName,
    quantity: externalSales.quantity,
    customerName: externalSales.customerName,
    supplierName: suppliers.name,
    customerTotal: externalSales.customerTotal,
    supplierTotal: externalSales.agreedSupplierTotal,
    status: externalSales.status,
    createdAt: externalSales.createdAt,
  })
    .from(externalSales)
    .innerJoin(suppliers, eq(externalSales.supplierId, suppliers.id))
    .where(conditions)
    .orderBy(desc(externalSales.createdAt), desc(externalSales.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const saleIds = sales.map((sale) => sale.id);

  const [customerPayments, supplierPayments] = saleIds.length
    ? await Promise.all([
        db.select({
          externalSaleId: externalCustomerPayments.externalSaleId,
          amount: externalCustomerPayments.amount,
        })
          .from(externalCustomerPayments)
          .where(inArray(
            externalCustomerPayments.externalSaleId,
            saleIds,
          )),

        db.select({
          externalSaleId: externalSupplierSettlements.externalSaleId,
          amount: externalSupplierSettlements.amount,
        })
          .from(externalSupplierSettlements)
          .where(inArray(
            externalSupplierSettlements.externalSaleId,
            saleIds,
          )),
      ])
    : [[], []];

  const paidBySale = new Map<string, number>();
  const settledBySale = new Map<string, number>();

  for (const payment of customerPayments) {
    paidBySale.set(
      payment.externalSaleId,
      (paidBySale.get(payment.externalSaleId) || 0)
        + parseMoney(payment.amount),
    );
  }

  for (const payment of supplierPayments) {
    settledBySale.set(
      payment.externalSaleId,
      (settledBySale.get(payment.externalSaleId) || 0)
        + parseMoney(payment.amount),
    );
  }

  const totals = new Map(
    statusCounts.map((item) => [item.status, item.total]),
  );
  const draftCount = totals.get('DRAFT') ?? 0;
  const completedCount = totals.get('POSTED') ?? 0;

  function hrefFor(nextPage: number, nextStatus = status) {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (nextStatus !== 'ALL') query.set('status', nextStatus);
    if (nextPage > 1) query.set('page', String(nextPage));
    const suffix = query.toString();
    return `/sales/external${suffix ? `?${suffix}` : ''}`;
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/sales" className="text-sm font-semibold text-[var(--primary)]">
            ← Sales
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-[var(--text)]">
            External Sales
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Sales supplied by other shops, separate from your own stock.
          </p>
        </div>
        <Link
          href="/sales/external/new"
          className="rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white"
        >
          New external sale
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href={hrefFor(1, 'DRAFT')}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <p className="text-sm text-[var(--muted)]">Saved drafts</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
            {draftCount}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--primary)]">
            View drafts
          </p>
        </Link>
        <Link
          href={hrefFor(1, 'POSTED')}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <p className="text-sm text-[var(--muted)]">Completed sales</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
            {completedCount}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--primary)]">
            View completed sales
          </p>
        </Link>
      </div>

      <form
        action="/sales/external"
        method="get"
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm font-semibold text-[var(--text)]">
          Search sales
          <input
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Product, customer or source shop"
            className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)]"
          />
        </label>
        <label className="text-sm font-semibold text-[var(--text)]">
          Status
          <select
            name="status"
            defaultValue={status}
            className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)]"
          >
            <option value="ALL">All sales</option>
            <option value="DRAFT">Drafts</option>
            <option value="POSTED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-11 rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-white"
        >
          Find sales
        </button>
        <Link
          href="/sales/external"
          className="flex h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)]"
        >
          Clear
        </Link>
      </form>

      <p className="text-sm text-[var(--muted)]">
        {total === 0
          ? 'No matching sales'
          : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} matching sales`}
      </p>

      {sales.length === 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center">
          <h2 className="font-display text-xl font-black text-[var(--text)]">
            No external sales found
          </h2>
          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
            Try another search or clear the filters.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <header className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <h2 className="font-display text-xl font-black text-[var(--text)]">
              External sales history
            </h2>
            <p className="mt-1 text-xs font-bold text-[var(--muted)]">
              {total} {total === 1 ? 'sale' : 'sales'} matching
            </p>
          </header>

          {/* DESKTOP TABLE / COMPACT WITHOUT HORIZONTAL SCROLL */}
          <div className="hidden xl:block">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[32%]" />
                <col className="w-[15%]" />
                <col className="w-[25%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="bg-[var(--surface)] text-left">
                  {['Date', 'Sale details', 'Total', 'Payments', 'Action'].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="border-b border-r border-[var(--border)] px-3 py-3 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)] last:border-r-0"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const isDraft = sale.status === 'DRAFT';
                  const isCompleted = sale.status === 'POSTED';
                  const href = `/sales/external/${sale.id}`;

                  const totalCents = parseMoney(sale.customerTotal);
                  const supplierTotalCents = parseMoney(sale.supplierTotal);
                  const customerPaidCents = paidBySale.get(sale.id) || 0;
                  const supplierPaidCents = settledBySale.get(sale.id) || 0;

                  const balances = calculateExternalSaleBalances({
                    customerTotalCents: totalCents,
                    supplierTotalCents,
                    customerPaidCents,
                    supplierPaidCents,
                  });

                  const date = new Intl.DateTimeFormat('en-RW', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Africa/Kigali',
                  }).format(sale.createdAt);

                  return (
                    <tr
                      key={sale.id}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface)]"
                    >
                      <td className="px-3 py-4 align-top">
                        <span className="block text-xs font-bold leading-relaxed text-[var(--text)]">
                          {date}
                        </span>
                      </td>

                      <td className="px-3 py-4 align-top">
                        <Link
                          href={href}
                          className="block min-w-0 space-y-1.5"
                        >
                          <span className="block break-words text-sm font-black text-[var(--text)]">
                            {sale.customerName || 'Walk-in customer'}
                          </span>
                          <span className="block break-words text-xs font-semibold text-[var(--text)]">
                            {sale.productName} ×{sale.quantity}
                          </span>
                          <span className="block break-words text-xs text-[var(--muted)]">
                            {sale.supplierName}
                          </span>
                          <span className="block text-[11px] font-semibold text-[var(--muted)]">
                            {statusLabel(sale.status)}
                          </span>
                        </Link>
                      </td>

                      <td className="px-3 py-4 align-top">
                        <span className="block break-words text-right text-xs font-black tabular-nums text-[var(--text)]">
                          {rwf(totalCents)}
                        </span>
                      </td>

                      <td className="px-3 py-4 align-top">
                        {isCompleted ? (
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="block text-[11px] text-[var(--muted)]">
                                Customer
                              </span>
                              <span className="font-bold text-[var(--text)]">
                                {paymentStatus(sale.status, totalCents, customerPaidCents)}
                              </span>
                              {balances.customerBalanceCents > 0 ? (
                                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                                  Owes {rwf(balances.customerBalanceCents)}
                                </span>
                              ) : null}
                            </div>
                            <div>
                              <span className="block text-[11px] text-[var(--muted)]">
                                Supplier
                              </span>
                              <span className="font-bold text-[var(--text)]">
                                {paymentStatus(sale.status, supplierTotalCents, supplierPaidCents)}
                              </span>
                              {balances.supplierBalanceCents > 0 ? (
                                <span className="block text-[11px] font-semibold text-[#A66B09] dark:text-[#E8B449]">
                                  Owe {rwf(balances.supplierBalanceCents)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">
                            {isDraft ? 'Not completed' : 'Cancelled'}
                          </span>
                        )}
                      </td>

                      <td className="px-2 py-4 text-center align-top">
                        <Link
                          href={href}
                          className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-bold text-[var(--primary)] hover:border-[var(--primary)] hover:bg-[var(--surface)]"
                        >
                          {isDraft ? 'Continue' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET */}
          <div className="divide-y divide-[var(--border)] xl:hidden">
            {sales.map((sale) => {
              const isDraft = sale.status === 'DRAFT';
              const balances = calculateExternalSaleBalances({
                customerTotalCents: parseMoney(sale.customerTotal),
                supplierTotalCents: parseMoney(sale.supplierTotal),
                customerPaidCents: paidBySale.get(sale.id) || 0,
                supplierPaidCents: settledBySale.get(sale.id) || 0,
              });
              const date = new Intl.DateTimeFormat('en-RW', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Kigali',
              }).format(sale.createdAt);

              return (
                <Link
                  key={sale.id}
                  href={`/sales/external/${sale.id}`}
                  className="block p-4 transition hover:bg-[var(--surface)] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--text)]">
                        {sale.customerName || 'Walk-in customer'}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        {date}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black tabular-nums text-[var(--text)]">
                        {rwf(parseMoney(sale.customerTotal))}
                      </p>
                      <p className="mt-1 text-xs font-black text-[var(--primary)]">
                        {statusLabel(sale.status)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        Customer payment: {paymentStatus(
                          sale.status,
                          parseMoney(sale.customerTotal),
                          paidBySale.get(sale.id) || 0,
                        )}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        Supplier payment: {paymentStatus(
                          sale.status,
                          parseMoney(sale.supplierTotal),
                          settledBySale.get(sale.id) || 0,
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs font-bold text-[var(--text)]">
                    {sale.productName} ×{sale.quantity}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    Source shop: {sale.supplierName}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[var(--border)] pt-3">
                    {[
                      ['Paid', isDraft ? null : paidBySale.get(sale.id) || 0],
                      ['Customer owes', isDraft ? null : balances.customerBalanceCents],
                      ['Supplier owed', isDraft ? null : balances.supplierBalanceCents],
                      [isDraft ? 'Expected profit' : 'Gross profit', balances.grossProfitCents],
                    ].map(([label, amount]) => (
                      <div key={String(label)} className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                          {label}
                        </p>
                        <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                          {amount === null ? '—' : rwf(Number(amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                  {isDraft ? (
                    <p className="mt-3 text-xs font-black text-[var(--primary)]">
                      Continue draft
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="External sales pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"
        >
          <span className="text-sm text-[var(--muted)]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={hrefFor(page - 1)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={hrefFor(page + 1)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </main>
  );
}
