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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/sales/external" className="text-sm font-semibold text-[var(--primary)]">
          ← External Sales
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-[var(--text)]">
          External Stock Sale
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {sale.productName} / Qty {sale.quantity} / {sale.status}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Customer total', sale.customerTotal],
          ['Customer owes', balances.customerBalanceCents / 100],
          ['Supplier owed', balances.supplierBalanceCents / 100],
          [
            sale.status === 'DRAFT'
              ? 'Expected gross profit'
              : 'Gross profit',
            balances.grossProfitCents / 100,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-[var(--text)]">
              {rwf(value)}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[var(--muted)]">Source shop</p>
            <p className="font-semibold text-[var(--text)]">{sale.supplierName}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">Customer</p>
            <p className="font-semibold text-[var(--text)]">
              {sale.customerName || 'Walk-in customer'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">Agreed source total</p>
            <p className="font-semibold text-[var(--text)]">{rwf(sale.supplierTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">Customer selling total</p>
            <p className="font-semibold text-[var(--text)]">{rwf(sale.customerTotal)}</p>
          </div>
        </div>
      </section>

      {sale.status === 'DRAFT' ? (
        <Link
          href={`/sales/external/${sale.id}/edit`}
          className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-semibold text-[var(--primary)]"
        >
          Edit draft
        </Link>
      ) : null}

      <ExternalPaymentActions
        saleId={sale.id}
        supplierId={sale.supplierId}
        status={sale.status}
        customerBalance={balances.customerBalanceCents / 100}
        supplierBalance={balances.supplierBalanceCents / 100}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="font-bold text-[var(--text)]">Customer payments</h2>
          <div className="mt-3 space-y-3">
            {customerPayments.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No payments recorded.</p>
            ) : customerPayments.map((p) => (
              <div key={p.id} className="flex justify-between gap-3 border-b border-[var(--border)] pb-2 text-sm">
                <span className="text-[var(--muted)]">{p.paymentMethod.replaceAll('_', ' ')}</span>
                <strong className="text-[var(--text)]">{rwf(p.amount)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="font-bold text-[var(--text)]">Supplier payments</h2>
          <div className="mt-3 space-y-3">
            {supplierPayments.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No payments recorded.</p>
            ) : supplierPayments.map((p) => (
              <div key={p.id} className="flex justify-between gap-3 border-b border-[var(--border)] pb-2 text-sm">
                <span className="text-[var(--muted)]">{p.paymentMethod.replaceAll('_', ' ')}</span>
                <strong className="text-[var(--text)]">{rwf(p.amount)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
