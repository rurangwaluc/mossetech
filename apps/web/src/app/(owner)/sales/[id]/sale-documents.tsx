import {
  Download,
  FileText,
  Printer,
} from 'lucide-react';

type Props = {
  saleId: string;
};

const documentTypes = [
  {
    label: 'Sales receipt',
    slug: 'receipt',
    description: 'Payment and sale record',
  },
  {
    label: 'Sales invoice',
    slug: 'invoice',
    description: 'Items, prices and balance',
  },
  {
    label: 'Delivery note',
    slug: 'delivery-note',
    description: 'Items prepared for handover',
  },
] as const;

export default function SaleDocuments({ saleId }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <h2 className="font-display text-xl font-black text-[var(--text)]">
          Documents
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          View, print or download documents for this sale.
        </p>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {documentTypes.map((document) => {
          const href = `/sales/${saleId}/${document.slug}`;

          return (
            <div
              key={document.slug}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--primary)]">
                  <FileText className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                  <p className="font-black text-[var(--text)]">
                    {document.label}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    {document.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <a
                  href={`${href}?mode=inline`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-bold text-[var(--text)] transition hover:border-[var(--primary)]"
                >
                  <Printer className="h-4 w-4" />
                  View / Print
                </a>

                <a
                  href={href}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-bold text-[var(--text)] transition hover:border-[var(--primary)]"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
