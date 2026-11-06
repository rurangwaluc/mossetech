import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  saleItems,
  saleReturnItems,
  saleReturns,
  saleReturnRefunds,
  sales,
} from '@mossetech/db/schema';

import { requireOwner } from '@/lib/auth/session';
import { ReturnProductsForm } from './return-products-form';

export default async function ReturnProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();

  const { id } = await params;

  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, id))
    .limit(1);

  if (!sale) notFound();

  const [items, previous] = await Promise.all([
    db.select()
      .from(saleItems)
      .where(eq(saleItems.saleId, id)),

    db.select({
      saleItemId: saleReturnItems.originalSaleItemId,
      quantity: saleReturnItems.quantityReturned,
    })
      .from(saleReturnItems)
      .innerJoin(
        saleReturns,
        eq(saleReturnItems.saleReturnId, saleReturns.id),
      )
      .where(eq(saleReturns.saleId, id)),
  ]);

  const previouslyReturned = new Map<string, number>();

  for (const row of previous) {
    previouslyReturned.set(
      row.saleItemId,
      (previouslyReturned.get(row.saleItemId) || 0) + row.quantity,
    );
  }

  const previousCredits = await db
    .select({ amount: saleReturns.creditAmount })
    .from(saleReturns)
    .where(eq(saleReturns.saleId, id));

  const issuedRefunds = await db
    .select({ amount: saleReturnRefunds.amount })
    .from(saleReturnRefunds)
    .where(eq(saleReturnRefunds.saleId, id));

  const creditedTotal = previousCredits.reduce(
    (sum, row) => sum + Number(row.amount), 0,
  );
  const refundedTotal = issuedRefunds.reduce(
    (sum, row) => sum + Number(row.amount), 0,
  );

  const availableItems = items
    .filter((item) => item.itemType === 'PRODUCT')
    .map((item) => ({
      id: item.id,
      name: item.itemName,
      sold: item.quantity,
      returned: previouslyReturned.get(item.id) || 0,
      remaining:
        item.quantity - (previouslyReturned.get(item.id) || 0),
      unitPrice: item.unitPrice,
    }))
    .filter((item) => item.remaining > 0);

  return (
    <main className="mx-auto max-w-4xl space-y-5 pb-12">
      <div>
        <Link
          href={`/sales/${id}`}
          className="text-sm font-semibold text-[var(--primary)]"
        >
          Back to sale
        </Link>

        <h1 className="mt-3 text-2xl font-black text-[var(--text)]">
          Return Products
        </h1>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Choose the returned products, review the new debt and stock impact, then confirm. Original payments and sale history are preserved.
        </p>
      </div>

      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-3 sm:p-5">
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Current sale total</p>
          <p className="mt-1 font-bold tabular-nums text-[var(--text)]">
            {Number(sale.totalAmount).toLocaleString('en-RW')} RWF
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Outstanding balance</p>
          <p className="mt-1 font-bold tabular-nums text-[var(--text)]">
            {Number(sale.balanceAmount).toLocaleString('en-RW')} RWF
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Previous return credits</p>
          <p className="mt-1 font-bold tabular-nums text-[var(--text)]">
            {creditedTotal.toLocaleString('en-RW')} RWF
          </p>
          {refundedTotal > 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Refunded: {refundedTotal.toLocaleString('en-RW')} RWF
            </p>
          ) : null}
        </div>
      </section>

      <ReturnProductsForm
        cashRefundEnabled={
          process.env.MOSSETECH_ENABLE_RETURN_CASH_REFUNDS === 'YES'
        }
        saleId={id}
        items={availableItems}
        originalItems={items.filter(item => item.itemType === 'PRODUCT').map(item => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }))}
        previousReturns={[...previouslyReturned].map(([saleItemId, quantity]) => ({
          saleItemId,
          quantity,
        }))}
        originalDiscount={sale.discountAmount}
        alreadyPaid={sale.paidAmount}
        currentSaleTotal={sale.totalAmount}
      />
    </main>
  );
}
