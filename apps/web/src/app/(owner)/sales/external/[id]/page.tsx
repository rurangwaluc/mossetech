import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  externalCustomerPayments,
  externalSales,
  externalSupplierSettlements,
  suppliers,
} from '@mossetech/db/schema';

import { requirePermission } from '@/lib/auth/require-permission';
import { calculateExternalSaleBalances, parseMoney } from '@/lib/external-sales/money';

import { ExternalPaymentActions } from './payment-actions';

function rwf(value: string | number) {
  return `${new Intl.NumberFormat('en-RW', {
    maximumFractionDigits: 2,
  }).format(Number(value))} RWF`;
}

export default async function ExternalSaleDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('sales.view');

  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const [sale] = await db
    .select({
      id: externalSales.id,
      status: externalSales.status,
      supplierId: externalSales.supplierId,
      supplierName: suppliers.name,
      productName: externalSales.productName,
      quantity: externalSales.quantity,
      customerName: externalSales.customerName,
      customerTotal: externalSales.customerTotal,
      supplierTotal: externalSales.agreedSupplierTotal,
      notes: externalSales.notes,
    })
    .from(externalSales)
    .innerJoin(suppliers, eq(externalSales.supplierId, suppliers.id))
    .where(eq(externalSales.id, id))
    .limit(1);

  if (!sale) notFound();

  const [customerPayments, supplierPayments] = await Promise.all([
    db.select().from(externalCustomerPayments)
      .where(eq(externalCustomerPayments.externalSaleId, id))
      .orderBy(desc(externalCustomerPayments.paidAt)),
    db.select().from(externalSupplierSettlements)
      .where(eq(externalSupplierSettlements.externalSaleId, id))
      .orderBy(desc(externalSupplierSettlements.paidAt)),
  ]);

  const balances = calculateExternalSaleBalances({
    customerTotalCents: parseMoney(sale.customerTotal),
    supplierTotalCents: parseMoney(sale.supplierTotal),
    customerPaidCents: customerPayments.reduce(
      (sum, payment) => sum + parseMoney(payment.amount),
      0,
    ),
    supplierPaidCents: supplierPayments.reduce(
      (sum, payment) => sum + parseMoney(payment.amount),
      0,
    ),
  });

  const isDraft = sale.status === 'DRAFT';

  const customerPaidCents = customerPayments.reduce(
    (sum, payment) => sum + parseMoney(payment.amount),
    0,
  );

  const supplierPaidCents = supplierPayments.reduce(
    (sum, payment) => sum + parseMoney(payment.amount),
    0,
  );

  const saleStatus = isDraft
    ? 'Draft'
    : sale.status === 'POSTED'
      ? 'Completed'
      : 'Cancelled';

  return (
    <section className="space-y-4">
      <header className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              External Stock Sale
            </p>
            <h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
              {sale.customerName || 'Walk-in customer'}
            </h2>
            <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
              {sale.productName} / Qty {sale.quantity}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              Source shop: {sale.supplierName}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <Link
                href={`/sales/external/${sale.id}/edit`}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
              >
                Edit draft
              </Link>
            ) : null}
            <Link
              href="/sales/external"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              Back to External Sales
            </Link>
          </div>
        </div>

        <div className="grid border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-4 sm:gap-px">
          {[
            ['Total', rwf(sale.customerTotal)],
            ['Paid', isDraft ? '—' : rwf(customerPaidCents / 100)],
            ['Balance', isDraft ? '—' : rwf(balances.customerBalanceCents / 100)],
            ['Status', saleStatus],
          ].map(([label, value], index) => (
            <div
              key={label}
              className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-4 first:border-t-0 sm:border-0 sm:px-6"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                {label}
              </p>
              <p
                className={`mt-1 text-lg font-black tabular-nums ${
                  (index === 2 && !isDraft && balances.customerBalanceCents > 0)
                    ? 'text-[#C88C18] dark:text-[#E8B449]'
                    : 'text-[var(--text)]'
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Items
          </p>
          <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
            What was sold
          </h3>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-black text-[var(--text)]">
              {sale.productName}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              Quantity: {sale.quantity} / Source: {sale.supplierName}
            </p>
          </div>
          <p className="text-lg font-black tabular-nums text-[var(--text)]">
            {rwf(sale.customerTotal)}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Source Shop
          </p>
          <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
            Supplier and profit
          </h3>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          {[
            ['Source shop', sale.supplierName],
            ['Agreed source cost', rwf(sale.supplierTotal)],
            ['Paid to supplier', isDraft ? '—' : rwf(supplierPaidCents / 100)],
            ['Supplier owed', isDraft ? '—' : rwf(balances.supplierBalanceCents / 100)],
            [
              isDraft ? 'Expected gross profit' : 'Gross profit',
              rwf(balances.grossProfitCents / 100),
            ],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                {label}
              </p>
              <p className="mt-1 text-sm font-black text-[var(--text)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {sale.status === 'POSTED' ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="font-display text-lg font-black text-[var(--text)]">
              Documents
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              View, print or download customer documents.
            </p>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {[
              { label: 'Sales invoice', path: 'invoice', available: true },
              {
                label: 'Sales receipt',
                path: 'receipt',
                available: customerPaidCents > 0,
              },
              {
                label: 'Delivery note',
                path: 'delivery-note',
                available: true,
              },
            ].map((document) => {
              const href = `/sales/external/${sale.id}/${document.path}`;

              return (
                <div
                  key={document.path}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm font-bold text-[var(--text)]">
                    {document.label}
                  </span>

                  {document.available ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={`${href}?mode=inline`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-[var(--primary)] hover:underline"
                      >
                        View / Print
                      </a>
                      <a
                        href={href}
                        className="text-sm font-bold text-[var(--primary)] hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      Available after customer payment
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <ExternalPaymentActions
        saleId={sale.id}
        supplierId={sale.supplierId}
        status={sale.status}
        customerBalance={balances.customerBalanceCents / 100}
        supplierBalance={balances.supplierBalanceCents / 100}
      />

      <section className="grid gap-4 md:grid-cols-2">
        {[
          { title: 'Customer payments', entries: customerPayments },
          { title: 'Supplier payments', entries: supplierPayments },
        ].map(({ title, entries }) => (
          <div
            key={title}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h3 className="font-display text-lg font-black text-[var(--text)]">
                {title}
              </h3>
            </div>
            <div className="divide-y divide-[var(--border)] px-5">
              {entries.length === 0 ? (
                <p className="py-5 text-sm font-semibold text-[var(--muted)]">
                  No payments recorded.
                </p>
              ) : entries.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <span className="text-sm font-semibold text-[var(--muted)]">
                    {payment.paymentMethod.replaceAll('_', ' ')}
                  </span>
                  <strong className="text-sm font-black tabular-nums text-[var(--text)]">
                    {rwf(payment.amount)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {sale.notes ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-[var(--text)]">
            {sale.notes}
          </p>
        </section>
      ) : null}
    </section>
  );
}
