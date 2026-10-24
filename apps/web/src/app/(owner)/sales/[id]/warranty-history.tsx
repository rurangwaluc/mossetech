import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import { warranties } from '@mossetech/db/schema';

export default async function WarrantyHistory({
  saleId,
}: {
  saleId: string;
}) {
  const records = await db
    .select()
    .from(warranties)
    .where(eq(warranties.saleId, saleId))
    .orderBy(desc(warranties.issuedAt));

  if (records.length === 0) return null;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <h2 className="font-display text-xl font-black text-[var(--text)]">
        Warranties
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Issued certificates for this sale
      </p>
      <div className="mt-4 divide-y divide-[var(--border)]">
        {records.map((record) => (
          <div
            key={record.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-bold text-[var(--text)]">
                {record.productName}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {record.startDate} / {record.expiryDate}
                {' / '}
                Quantity: {record.coveredQuantity}
              </p>
              {record.serialNumber ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Serial / IMEI: {record.serialNumber}
                </p>
              ) : null}
            </div>
            <a
              href={`/sales/${saleId}/warranty/${record.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] hover:border-[var(--primary)]"
            >
              View / Print certificate
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
