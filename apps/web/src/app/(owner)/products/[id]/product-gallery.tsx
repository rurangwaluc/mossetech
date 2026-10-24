'use client';

import { useState } from 'react';

type GalleryImage = {
  id: string;
  imageKey: string;
};

type ProductGalleryProps = {
  productId: string;
  productName: string;
  mainImageKey: string | null;
  additionalImages: GalleryImage[];
};

export default function ProductGallery({
  productId,
  productName,
  mainImageKey,
  additionalImages,
}: ProductGalleryProps) {
  const images = [
    ...(mainImageKey
      ? [{
          id: 'main',
          url: `/api/media/product-image/${productId}?v=${encodeURIComponent(mainImageKey)}`,
        }]
      : []),
    ...additionalImages.map((image) => ({
      id: image.id,
      url: `/api/media/product-gallery/${productId}/${image.id}`,
    })),
  ];

  const [selectedId, setSelectedId] = useState(
    images[0]?.id ?? '',
  );

  const selected =
    images.find((image) => image.id === selectedId) ??
    images[0];

  return (
    <div className="space-y-3">
      <div className="flex aspect-[16/10] max-h-[460px] w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] sm:aspect-[16/9] sm:rounded-xl lg:max-h-[520px]">
        {selected ? (
          <img
            src={selected.url}
            alt={productName}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="text-center">
            <p className="text-5xl font-black text-[var(--primary)]">
              {productName.slice(0, 1).toUpperCase()}
            </p>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              No product photo
            </p>
          </div>
        )}
      </div>

      {images.length > 1 ? (
        <div
          aria-label="Product photos"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelectedId(image.id)}
              aria-label={`View photo ${index + 1}`}
              aria-pressed={selected?.id === image.id}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-[var(--surface)] ${
                selected?.id === image.id
                  ? 'border-[var(--primary)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <img
                src={image.url}
                alt=""
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
