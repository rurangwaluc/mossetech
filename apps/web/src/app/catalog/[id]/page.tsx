import { StorefrontHeader } from '@/components/storefront-header';
import { eq } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import { productImages } from '@mossetech/db/schema';
import { PublicProductGallery } from './public-product-gallery';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getPublicProduct,
} from '@/lib/products/public-catalog';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

function money(value: string | number) {
  return `RWF ${Number(value).toLocaleString('en-US')}`;
}

export default async function PublicProductPage({
  params,
}: PageProps) {
  const { id } = await params;
  const product = await getPublicProduct(id);

  if (!product) {
    notFound();
  }

  const galleryImages = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(productImages.position, productImages.createdAt);

  const specifications =
    product.specifications &&
    typeof product.specifications === 'object' &&
    !Array.isArray(product.specifications)
      ? Object.entries(product.specifications)
          .filter(
            ([key, value]) =>
              key !== '__proto__' &&
              (typeof value === 'string' ||
                typeof value === 'number'),
          )
      : [];

  const productUrl =
    `https://mossetech.store/catalog/${product.id}`;

  const whatsappMessage = [
    'Hello Mosse Tech,',
    `I am interested in ${product.name}.`,
    `Product link: ${productUrl}`,
    'Is it still available?',
  ].join('\\n');

  const whatsappUrl =
    `https://wa.me/250785147371?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <StorefrontHeader />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/catalog"
          className="text-sm font-bold text-[var(--muted)] hover:text-[var(--text)]"
        >
          ← Back to products
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-10">
          <PublicProductGallery
            productId={product.id}
            productName={product.name}
            hasMainImage={Boolean(product.imageKey)}
            additionalImageIds={galleryImages.map((image) => image.id)}
          />

          <section>
            <p className="text-xs font-black uppercase tracking-wider text-[var(--primary)]">
              {product.category}
            </p>

            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              {product.name}
            </h1>

            {product.brand || product.model ? (
              <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                {[product.brand, product.model]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}

            <p className="mt-6 text-3xl font-black text-[var(--primary)]">
              {money(product.sellingPrice)}
            </p>

            {product.condition ? (
              <p className="mt-4 text-sm font-bold">
                Condition: {product.condition}
              </p>
            ) : null}

            {product.compatibility ? (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">
                {product.compatibility}
              </p>
            ) : null}

            {product.notes?.trim() ? (
              <section className="mt-8">
                <h2 className="text-lg font-black">
                  Description
                </h2>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--muted)]">
                  {product.notes}
                </p>
              </section>
            ) : null}

            {specifications.length > 0 ? (
              <section className="mt-8">
                <h2 className="text-lg font-black">
                  Specifications
                </h2>

                <dl className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] px-4">
                  {specifications.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-2 gap-3 py-3 text-sm"
                    >
                      <dt className="font-bold text-[var(--muted)]">
                        {key}
                      </dt>
                      <dd className="font-bold">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-[#128C7E] px-6 text-sm font-black text-white transition hover:bg-[#075E54]"
              >
                Enquire on WhatsApp
              </a>

              <a
                href={productUrl}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--border)] px-6 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
              >
                Product link
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
