import {
  setProductPublicationAction,
} from '@/lib/products/publication-actions';

type ProductPublicationCardProps = {
  productId: string;
  isPublished: boolean;
  availableQuantity: number;
};

export function ProductPublicationCard({
  productId,
  isPublished,
  availableQuantity,
}: ProductPublicationCardProps) {
  const publiclyVisible =
    isPublished && availableQuantity > 0;

  const statusLabel = publiclyVisible
    ? 'Published and available'
    : isPublished
      ? 'Published — out of stock'
      : 'Not published';

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[var(--text)]">
            Public sharing
          </h2>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            {statusLabel}
          </p>

          <p className="mt-2 text-xs font-bold leading-5 text-[var(--muted)]">
            Only published products with available stock
            can appear in the public catalog.
          </p>
        </div>

        <form action={setProductPublicationAction}>
          <input
            type="hidden"
            name="productId"
            value={productId}
          />

          <input
            type="hidden"
            name="isPublished"
            value={isPublished ? 'false' : 'true'}
          />

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)] sm:w-auto"
          >
            {isPublished ? 'Unpublish product' : 'Publish product'}
          </button>
        </form>
      </div>
    </section>
  );
}
