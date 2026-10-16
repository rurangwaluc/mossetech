import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';
import { CostPriceForm } from './cost-price-form';
import {
  notFound,
} from 'next/navigation';

import {
  eq,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import {
  HideItemButton,
} from '../hide-item-button';

type ProductDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function money(
  value: string | number,
) {
  return `RWF ${Number(
    value,
  ).toLocaleString(
    'en-US',
  )}`;
}

function stockText(
  quantity: number,
  minQuantity: number,
) {
  if (quantity <= 0) {
    return {
      label:
        'Out of stock',
      className:
        'text-[var(--danger)]',
    };
  }

  if (
    quantity <=
    minQuantity
  ) {
    return {
      label:
        'Low stock',
      className:
        'text-[var(--danger)]',
    };
  }

  return {
    label:
      'In stock',
    className:
      'text-[var(--success)]',
  };
}

export default async function ProductDetailsPage({
  params,
}: ProductDetailsPageProps) {
  const user =
    await requirePermission('products.view');

  const {
    id,
  } = await params;

  const [product] =
    await db
      .select()
      .from(products)
      .where(
        eq(
          products.id,
          id,
        ),
      )
      .limit(1);

  if (
    !product ||
    product.status !==
      'ACTIVE' ||
    product.itemType !==
      'PRODUCT'
  ) {
    notFound();
  }

  const stock =
    stockText(
      product.quantity,
      product.minQuantity,
    );

  return (
    <section className="space-y-4 sm:space-y-5">
      <div>
        <Link
          href="/products"
          prefetch
          className="text-xs font-black text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          ← Back to products
        </Link>

        <div className="mt-3 flex flex-col gap-4 sm:mt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl">
              {product.name}
            </h1>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              {product.category}
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link
              href={`/products/${product.id}/edit`}
              prefetch
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)] sm:w-auto sm:px-5"
            >
              {user.role ===
              'OWNER'
                ? 'Edit product'
                : 'Ask owner to edit'}
            </Link>

            <Link
              href="/stock"
              prefetch
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:w-auto sm:px-5"
            >
              View stock
            </Link>

            {user.role ===
            'OWNER' ? (
              <div className="col-span-2 [&_button]:h-10 [&_button]:w-full sm:col-span-1 sm:[&_button]:w-auto">
                <HideItemButton
                  itemId={
                    product.id
                  }
                  itemName={
                    product.name
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(270px,0.6fr)] xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="p-3 sm:p-5 lg:p-6">
            <div
              className="flex aspect-[16/10] max-h-[460px] w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] bg-cover bg-center sm:aspect-[16/9] sm:rounded-xl lg:max-h-[520px]"
              style={
                product.imageKey
                  ? {
                      backgroundImage:
                        `url("/api/media/product-image/${product.id}?v=${encodeURIComponent(product.imageKey)}")`,
                    }
                  : undefined
              }
            >
              {!product.imageKey ? (
                <div className="text-center">
                  <p className="text-5xl font-black text-[var(--primary)]">
                    {product.name
                      .slice(0, 1)
                      .toUpperCase()}
                  </p>

                  <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    No product photo
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Notes
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-[var(--text)]">
              {product.notes ||
                'No notes added for this product.'}
            </p>
          </div>
        </section>

        <aside className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <header className="border-b border-[var(--border)] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Product details
            </p>

            <h2 className="mt-1 text-lg font-black text-[var(--text)]">
              Selling & stock
            </h2>
          </header>

          <dl className="divide-y divide-[var(--border)]">
            <div className="px-5 py-4">
              <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Selling price
              </dt>

              <dd className="mt-1 text-lg font-black text-[var(--text)]">
                {money(
                  product.sellingPrice,
                )}
              </dd>
            </div>

            <div className="grid grid-cols-2">
              <div className="border-r border-[var(--border)] px-5 py-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  Unit
                </dt>

                <dd className="mt-1 text-sm font-black text-[var(--text)]">
                  {product.unit}
                </dd>
              </div>

              <div className="px-5 py-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  Low-stock level
                </dt>

                <dd className="mt-1 text-sm font-black text-[var(--text)]">
                  {product.minQuantity}
                </dd>
              </div>
            </div>

            <div className="px-5 py-4">
              <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Current stock
              </dt>

              <dd className="mt-1 text-lg font-black text-[var(--text)]">
                {product.quantity}{' '}
                {product.unit}
              </dd>

              <p
                className={`mt-1 text-xs font-black ${stock.className}`}
              >
                {stock.label}
              </p>
            </div>

            <div className="px-5 py-4">
              <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Category
              </dt>

              <dd className="mt-1 text-sm font-black text-[var(--text)]">
                {product.category}
              </dd>
            </div>
          </dl>

          <div className="border-t border-[var(--border)] px-5 py-4">
            <p className="text-xs font-black text-[var(--text)]">
              Stock is managed from
              Stock
            </p>

            <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
              Receiving and stock
              corrections stay in one
              place so product details
              do not alter stock history.
            </p>
          </div>
        </aside>
      </div>
      {user.role === 'OWNER' ? (
        <CostPriceForm
          productId={product.id}
          buyingPrice={product.buyingPrice}
          minimumSellingPrice={product.minimumSellingPrice}
        />
      ) : null}
    </section>
  );
}
