import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

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

function rwf(cents: number) {
  return `${new Intl.NumberFormat('en-RW', {
    maximumFractionDigits: 2,
  }).format(cents / 100)} RWF`;
}

export default async function ExternalSalesPage() {
  await requirePermission('sales.view');

  const [sales, customerPayments, supplierPayments] = await Promise.all([
    db.select({
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
      .orderBy(desc(externalSales.createdAt))
      .limit(100),

    db.select({
      externalSaleId: externalCustomerPayments.externalSaleId,
      amount: externalCustomerPayments.amount,
    }).from(externalCustomerPayments),

    db.select({
      externalSaleId: externalSupplierSettlements.externalSaleId,
      amount: externalSupplierSettlements.amount,
    }).from(externalSupplierSettlements),
  ]);

  const paidBySale = new Map<string, number>();
  const settledBySale = new Map<string, number>();

  for (const payment of customerPayments) {
    paidBySale.set(
      payment.externalSaleId,
      (paidBySale.get(payment.externalSaleId) || 0) +
        parseMoney(payment.amount),
    );
  }

  for (const payment of supplierPayments) {
    settledBySale.set(
      payment.externalSaleId,
      (settledBySale.get(payment.externalSaleId) || 0) +
        parseMoney(payment.amount),
    );
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
            Sales supplied by other shops, separate from owned inventory.
          </p>
        </div>
        <Link
          href="/sales/external/new"
          className="rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white"
        >
          New external sale
        </Link>
      </div>

      {sales.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="font-semibold text-[var(--text)]">No external sales yet.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Record your first sale from another shop.
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
                    {sale.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
                  {[
                    ['Sale total', parseMoney(sale.customerTotal)],
                    ['Customer owes', balance.customerBalanceCents],
                    ['Supplier owed', balance.supplierBalanceCents],
                    ['Gross profit', balance.grossProfitCents],
                  ].map(([label, cents]) => (
                    <div key={label}>
                      <p className="text-xs text-[var(--muted)]">{label}</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-[var(--text)]">
                        {rwf(Number(cents))}
                      </p>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
