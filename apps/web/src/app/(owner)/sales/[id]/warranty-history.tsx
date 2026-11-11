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
        Issued certificates for this sale. On iPhone, open the PDF and use Share → Save to Files.
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
            <div className="flex flex-wrap gap-2">
              <a
                href={`/sales/${saleId}/warranty/${record.id}?mode=inline`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] hover:border-[var(--primary)]"
              >
                Open PDF
              </a>
              <a
                href={`/sales/${saleId}/warranty/${record.id}?mode=download`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--primary)] hover:border-[var(--primary)]"
              >
                Download PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
