import AsyncSubmitButton from '@/components/async-submit-button';
import Link from 'next/link';
import { desc, eq, ilike, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@mossetech/db/client';
import {
  stockArrivals,
  supplierPayments,
  suppliers,
} from '@mossetech/db/schema';
import { requireOwner } from '@/lib/auth/session';
import {
  recordSupplierPaymentAction,
  updateSupplierAction,
} from '@/lib/suppliers/actions';

const fieldClass =
  'mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)]';

export default async function SupplierDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();

  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);

  if (!supplier) {
    notFound();
  }

  const purchaseHistory = await db
    .select({
      id: stockArrivals.id,
      productName: stockArrivals.productName,
      productId: stockArrivals.productId,
      supplierId: stockArrivals.supplierId,
      quantity: stockArrivals.quantityReceived,
      buyingPrice: stockArrivals.buyingPrice,
      supplierAmountOwed: stockArrivals.supplierAmountOwed,
      arrivedAt: stockArrivals.arrivedAt,
    })
    .from(stockArrivals)
    .where(
      or(
        eq(stockArrivals.supplierId, supplier.id),
        ilike(stockArrivals.supplierName, supplier.name),
      ),
    )
    .orderBy(desc(stockArrivals.arrivedAt));

  const totalPurchaseCost = purchaseHistory.reduce(
    (total, purchase) =>
      total +
      Number(purchase.buyingPrice) * purchase.quantity,
    0,
  );

  const paymentHistory = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, supplier.id))
    .orderBy(desc(supplierPayments.paidAt));

  const recordedDebt = purchaseHistory.reduce(
    (total, purchase) =>
      total + (
        purchase.supplierId === supplier.id
          ? Number(purchase.supplierAmountOwed)
          : 0
      ),
    0,
  );

  const totalPaid = paymentHistory.reduce(
    (total, payment) => total + Number(payment.amount),
    0,
  );

  const outstandingBalance = Math.max(0, recordedDebt - totalPaid);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('en-RW', {
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/suppliers"
          className="text-sm font-bold text-[var(--muted)] hover:text-[var(--text)]"
        >
          ← All suppliers
        </Link>
        <h1 className="mt-3 text-2xl font-black text-[var(--text)]">
          {supplier.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Supplier contact and business information
        </p>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-5 text-lg font-black text-[var(--text)]">
          Supplier details
        </h2>

        <form action={updateSupplierAction} className="space-y-5">
          <input type="hidden" name="supplierId" value={supplier.id} />

          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { name: 'name', label: 'Supplier name', value: supplier.name, required: true },
              { name: 'contactPerson', label: 'Contact person', value: supplier.contactPerson },
              { name: 'phone', label: 'Phone number', value: supplier.phone },
              { name: 'email', label: 'Email address', value: supplier.email },
            ].map((field) => (
              <label key={field.name} className="block">
                <span className="text-sm font-bold text-[var(--text)]">
                  {field.label}
                </span>
                <input
                  name={field.name}
                  type={field.name === 'email' ? 'email' : 'text'}
                  required={field.required}
                  defaultValue={field.value ?? ''}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-bold text-[var(--text)]">
              Address
            </span>
            <textarea
              name="address"
              defaultValue={supplier.address ?? ''}
              rows={2}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[var(--text)]">
              Notes
            </span>
            <textarea
              name="notes"
              defaultValue={supplier.notes ?? ''}
              rows={3}
              className={fieldClass}
            />
          </label>

          <div className="flex justify-end">
            <AsyncSubmitButton
              idleLabel="Save changes"
              pendingLabel="Saving changes…"
            />
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[var(--text)]">
              Purchasing history
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Stock received from this supplier, including matching older records.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-[var(--muted)]">
              Recorded purchase costs
            </p>
            <p className="mt-1 text-lg font-black text-[var(--text)]">
              RWF {formatMoney(totalPurchaseCost)}
            </p>
          </div>
        </div>

        {purchaseHistory.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--muted)]">
            No stock receipts associated with this supplier yet.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-3 pr-4 font-bold">Product</th>
                  <th className="py-3 pr-4 font-bold">Received</th>
                  <th className="py-3 pr-4 font-bold">Quantity</th>
                  <th className="py-3 pr-4 text-right font-bold">Purchase cost</th>
                </tr>
              </thead>
              <tbody>
                {purchaseHistory.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="py-4 pr-4 font-semibold text-[var(--text)]">
                      {purchase.productName}
                    </td>
                    <td className="py-4 pr-4 text-[var(--muted)]">
                      {purchase.arrivedAt.toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-4 pr-4 text-[var(--text)]">
                      {purchase.quantity}
                    </td>
                    <td className="py-4 text-right font-semibold text-[var(--text)]">
                      RWF {formatMoney(
                        Number(purchase.buyingPrice) * purchase.quantity,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--muted)]">
          Purchase costs are historical records, not amounts owed.
          Older records are matched by supplier name.
        </p>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-black text-[var(--text)]">
          Related products
        </h2>

        {purchaseHistory.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            No products received yet.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from(
              new Map(
                purchaseHistory.map((receipt) => [
                  receipt.productId,
                  {
                    id: receipt.productId,
                    name: receipt.productName,
                  },
                ]),
              ).values(),
            ).map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
              >
                {product.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-black text-[var(--text)]">
          Supplier balance
        </h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Recorded unpaid purchases', value: recordedDebt },
            { label: 'Payments made', value: totalPaid },
            { label: 'Outstanding balance', value: outstandingBalance },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[var(--border)] p-4">
              <p className="text-xs font-semibold text-[var(--muted)]">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-black text-[var(--text)]">
                RWF {formatMoney(item.value)}
              </p>
            </div>
          ))}
        </div>

        {outstandingBalance > 0 ? (
          <form action={recordSupplierPaymentAction} className="mt-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="supplierId" value={supplier.id} />
            <label className="text-sm font-bold text-[var(--text)]">
              Payment amount (RWF)
              <input name="amount" type="number" min="0.01" step="0.01"
                required className={fieldClass} />
            </label>
            <label className="text-sm font-bold text-[var(--text)]">
              Payment method
              <select name="paymentMethod" required className={fieldClass}>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="BANK">Bank transfer</option>
                <option value="CARD">Card</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-sm font-bold text-[var(--text)]">
              Notes (optional)
              <textarea name="notes" rows={2} maxLength={2000}
                className={fieldClass} />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <AsyncSubmitButton
                idleLabel="Record payment"
                pendingLabel="Recording payment…"
              />
            </div>
          </form>
        ) : (
          <p className="mt-5 text-sm text-[var(--muted)]">
            No outstanding supplier balance recorded.
          </p>
        )}

        {paymentHistory.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold text-[var(--text)]">Payment history</h3>
            <div className="mt-3 space-y-3">
              {paymentHistory.map((payment) => (
                <div key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-3">
                  <div>
                    <p className="font-semibold text-[var(--text)]">
                      {payment.paymentMethod.replaceAll('_', ' ')}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {payment.paidAt.toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <p className="font-bold text-[var(--text)]">
                    RWF {formatMoney(Number(payment.amount))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
