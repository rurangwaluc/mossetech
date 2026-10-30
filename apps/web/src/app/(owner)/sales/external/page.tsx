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

const PAGE_SIZE = 25;

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
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="font-semibold text-[var(--text)]">
            No external sales found.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Try another search or clear the filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {sales.map((sale) => {
            const balance = calculateExternalSaleBalances({
              customerTotalCents: parseMoney(sale.customerTotal),
              supplierTotalCents: parseMoney(sale.supplierTotal),
              customerPaidCents: paidBySale.get(sale.id) || 0,
              supplierPaidCents: settledBySale.get(sale.id) || 0,
            });

            const isDraft = sale.status === 'DRAFT';

            return (
              <Link
                key={sale.id}
                href={`/sales/external/${sale.id}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)] sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[var(--text)]">
                      {sale.productName} / Qty {sale.quantity}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {sale.supplierName} / {sale.customerName || 'Walk-in customer'}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[var(--muted)]">
                    {statusLabel(sale.status)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
                  {[
                    [isDraft ? 'Expected sale total' : 'Sale total',
                      parseMoney(sale.customerTotal)],
                    [isDraft ? 'Customer payment' : 'Customer owes',
                      isDraft ? 0 : balance.customerBalanceCents],
                    [isDraft ? 'Supplier payment' : 'Supplier owed',
                      isDraft ? 0 : balance.supplierBalanceCents],
                    [isDraft ? 'Expected gross profit' : 'Gross profit',
                      balance.grossProfitCents],
                  ].map(([label, cents]) => (
                    <div key={String(label)}>
                      <p className="text-xs text-[var(--muted)]">{label}</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-[var(--text)]">
                        {rwf(Number(cents))}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 border-t border-[var(--border)] pt-3 text-sm font-semibold text-[var(--primary)]">
                  {isDraft ? 'Continue draft' :
                    sale.status === 'POSTED'
                      ? 'View completed sale'
                      : 'View cancelled sale'}
                </p>
              </Link>
            );
          })}
        </div>
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
