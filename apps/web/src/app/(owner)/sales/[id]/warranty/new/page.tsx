import AsyncSubmitButton from '@/components/async-submit-button';
import SoldProductSearch from './sold-product-search';
import { db } from '@mossetech/db/client';
import { saleItems, sales } from '@mossetech/db/schema';
import { eq } from 'drizzle-orm';
import { requireOwner } from '@/lib/auth/session';
import { issueWarrantyAction } from '@/lib/warranties/actions';
import Link from 'next/link';
import { notFound } from 'next/navigation';

function kigaliDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default async function NewWarrantyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();

  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const [sale] = await db.select()
    .from(sales)
    .where(eq(sales.id, id))
    .limit(1);

  if (!sale) notFound();

  const items = (await db.select()
    .from(saleItems)
    .where(eq(saleItems.saleId, sale.id)))
    .filter((item) => item.itemType === 'PRODUCT');

  const date = kigaliDate(sale.saleDate);
  const today = kigaliDate(new Date());

  const startDate = today > date ? today : date;

  const inputClass =
    'mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]';

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-[var(--text)]">
            Issue warranty
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {sale.customerName || 'Walk-in customer'} / Sale {sale.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <Link href={`/sales/${sale.id}`} className="text-sm font-bold text-[var(--primary)]">
          Back to sale
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] p-5 text-sm text-[var(--text)]">
          This sale has no products eligible for a warranty.
        </p>
      ) : (
        <form action={issueWarrantyAction} className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7">
          <input type="hidden" name="saleId" value={sale.id} />

          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-bold text-[var(--text)]">
              Sold product
              <SoldProductSearch
                items={items.map((item) => ({
                  id: item.id,
                  name: item.itemName,
                  quantity: item.quantity,
                }))}
              />
            </label>

            <label className="text-sm font-bold text-[var(--text)]">
              Quantity covered
              <input name="coveredQuantity" type="number" min="1" step="1" defaultValue="1" required className={inputClass} />
            </label>

            <label className="text-sm font-bold text-[var(--text)]">
              Serial number / IMEI (optional)
              <input name="serialNumber" maxLength={160} placeholder="Enter device identifier" className={inputClass} />
            </label>

            <label className="text-sm font-bold text-[var(--text)]">
              Warranty start date
              <input name="startDate" type="date" min={date} defaultValue={startDate} required className={inputClass} />
            </label>

            <label className="text-sm font-bold text-[var(--text)]">
              Warranty expiry date
              <input name="expiryDate" type="date" min={startDate} required className={inputClass} />
            </label>
          </div>

          <label className="block text-sm font-bold text-[var(--text)]">
            What does the warranty cover?
            <textarea name="coverage" rows={3} minLength={5} maxLength={3000} required placeholder="Describe the actual agreed warranty coverage" className={inputClass} />
          </label>

          <label className="block text-sm font-bold text-[var(--text)]">
            Warranty terms and conditions
            <textarea name="terms" rows={4} minLength={5} maxLength={5000} required placeholder="Enter the agreed conditions and exclusions" className={inputClass} />
          </label>

          <p className="text-xs text-[var(--muted)]">
            Only issue a warranty when coverage has been agreed with the customer. The certificate will retain these terms.
          </p>

          <div className="flex justify-end border-t border-[var(--border)] pt-5">
            <AsyncSubmitButton
              idleLabel="Issue warranty"
              pendingLabel="Issuing warranty…"
            />
          </div>
        </form>
      )}
    </section>
  );
}
