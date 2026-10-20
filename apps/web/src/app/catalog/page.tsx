import { StorefrontHeader } from '@/components/storefront-header';
import Link from 'next/link';
import {
  getPublicCatalog,
  type CatalogFilters,
} from '@/lib/products/public-catalog';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function money(value: string | number) {
  return `RWF ${Number(value).toLocaleString('en-US')}`;
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

function pageHref(filters: CatalogFilters, page: number) {
  const params = new URLSearchParams();

  for (const key of ['q', 'category', 'sort', 'min', 'max'] as const) {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  }

  params.set('page', String(page));
  return `/catalog?${params.toString()}`;
}

export default async function CatalogPage({ searchParams }: Props) {
  const raw = await searchParams;

  const filters: CatalogFilters = {
    q: readParam(raw, 'q'),
    category: readParam(raw, 'category'),
    sort: readParam(raw, 'sort'),
    min: readParam(raw, 'min'),
    max: readParam(raw, 'max'),
    page: readParam(raw, 'page'),
  };

  const result = await getPublicCatalog(filters);
  const hasFilters = Boolean(
    filters.q || filters.category || filters.min || filters.max,
  );

  const fieldClass =
    'min-h-11 w-full rounded-lg border border-[var(--border)] ' +
    'bg-[var(--card)] px-3 text-sm text-[var(--text)] ' +
    'outline-none focus:border-[var(--primary)]';

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <StorefrontHeader />
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <header className="border-b border-[var(--border)] pb-7">
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Electronics & accessories
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Explore available laptops, phones, chargers and accessories.
            Find the right product and contact Mosse Tech directly.
          </p>
        </header>

        <form
          action="/catalog"
          method="get"
          className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label
                htmlFor="catalog-search"
                className="mb-2 block text-xs font-bold text-[var(--muted)]"
              >
                Search products
              </label>

              <input
                id="catalog-search"
                name="q"
                type="search"
                maxLength={100}
                defaultValue={filters.q}
                placeholder="Search products..."
                className={fieldClass}
              />
            </div>

            <button
              type="submit"
              className="min-h-11 self-end rounded-lg bg-[var(--primary)] px-7 text-sm font-bold text-white"
            >
              Search products
            </button>
          </div>

          <details
            className="catalog-responsive-filters mt-4"
          >
            <summary className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-bold lg:hidden">
              Filters & sorting
            </summary>
            <div className="catalog-responsive-filters-content mt-3 lg:mt-0">
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="catalog-category"
                className="mb-2 block text-xs font-bold text-[var(--muted)]"
              >
                Category
              </label>
              <select
                id="catalog-category"
                name="category"
                defaultValue={filters.category}
                className={fieldClass}
              >
                <option value="">All categories</option>
                {result.categories.map(({ category }) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="catalog-min"
                className="mb-2 block text-xs font-bold text-[var(--muted)]"
              >
                Min price (RWF)
              </label>
              <input
                id="catalog-min"
                name="min"
                type="number"
                min="0"
                step="1"
                defaultValue={filters.min}
                placeholder="Any"
                className={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor="catalog-max"
                className="mb-2 block text-xs font-bold text-[var(--muted)]"
              >
                Max price (RWF)
              </label>
              <input
                id="catalog-max"
                name="max"
                type="number"
                min="0"
                step="1"
                defaultValue={filters.max}
                placeholder="Any"
                className={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor="catalog-sort"
                className="mb-2 block text-xs font-bold text-[var(--muted)]"
              >
                Sort by
              </label>
              <select
                id="catalog-sort"
                name="sort"
                defaultValue={filters.sort || 'newest'}
                className={fieldClass}
              >
                <option value="newest">Newest products</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Product name</option>
              </select>
            </div>
            </div>

            </div>
          </details>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-bold hover:border-[var(--primary)]"
            >
              Apply filters
            </button>

            <Link
              href="/catalog"
              className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]"
            >
              Clear filters
            </Link>
          </div>
        </form>

        <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Available products</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {result.total} {result.total === 1 ? 'product' : 'products'} found
            </p>
          </div>

          {result.total > 0 && (
            <p className="text-sm text-[var(--muted)]">
              Page {result.page} of {result.totalPages}
            </p>
          )}
        </div>

        {result.items.length === 0 ? (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-16 text-center">
            <h2 className="text-lg font-black">
              {hasFilters
                ? 'No products match your search'
                : 'No products available yet'}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {hasFilters
                ? 'Try another search or clear the filters.'
                : 'Check back soon for newly available electronics.'}
            </p>
            {hasFilters && (
              <Link
                href="/catalog"
                className="mt-5 inline-block text-sm font-bold text-[var(--primary)]"
              >
                View all products
              </Link>
            )}
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((product) => (
              <Link
                key={product.id}
                href={`/catalog/${product.id}`}
                className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition hover:border-[var(--primary)] hover:shadow-md"
              >
                <div className="relative aspect-square overflow-hidden bg-white">
                  {product.imageKey ? (
                    <div
                      role="img"
                      aria-label={product.name}
                      className="absolute inset-0 bg-contain bg-center bg-no-repeat transition-transform duration-200 group-hover:scale-[1.03]"
                      style={{
                        backgroundImage: `url("/api/public/product-image/${product.id}")`,
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--surface)]">
                      <span className="text-4xl font-black text-[var(--primary)]">
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                    {product.category}
                  </p>

                  <h3 className="mt-2 line-clamp-2 text-sm font-black leading-5 sm:text-base">
                    {product.name}
                  </h3>

                  {product.condition && (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {product.condition}
                    </p>
                  )}

                  <p className="mt-3 text-base font-black text-[var(--primary)] sm:text-lg">
                    {money(product.sellingPrice)}
                  </p>

                  <div className="mt-auto pt-4">
                    <span className="flex min-h-10 items-center justify-center rounded-lg border border-[var(--border)] text-xs font-bold transition group-hover:border-[var(--primary)] group-hover:text-[var(--primary)] sm:text-sm">
                      View product
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {result.totalPages > 1 && (
          <nav
            aria-label="Catalog pages"
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            {result.page > 1 && (
              <Link
                href={pageHref(filters, result.page - 1)}
                className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-bold hover:border-[var(--primary)]"
              >
                Previous
              </Link>
            )}

            <span className="px-2 text-sm text-[var(--muted)]">
              {result.page} / {result.totalPages}
            </span>

            {result.page < result.totalPages && (
              <Link
                href={pageHref(filters, result.page + 1)}
                className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-bold hover:border-[var(--primary)]"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
