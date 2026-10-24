'use client';

import { useState } from 'react';

type Props = {
  productId: string;
  productName: string;
  hasMainImage: boolean;
  additionalImageIds: string[];
};

export function PublicProductGallery({
  productId,
  productName,
  hasMainImage,
  additionalImageIds,
}: Props) {
  const photos = [
    ...(hasMainImage
      ? [{
          id: 'main',
          url: `/api/public/product-image/${productId}`,
        }]
      : []),
    ...additionalImageIds.map((id) => ({
      id,
      url: `/api/public/product-gallery/${productId}/${id}`,
    })),
  ];

  const [selectedId, setSelectedId] = useState(
    photos[0]?.id ?? '',
  );

  const selected =
    photos.find((photo) => photo.id === selectedId) ??
    photos[0];

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {selected ? (
          <img
            key={selected.id}
            src={selected.url}
            alt={productName}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-7xl font-black text-[var(--primary)]">
            {productName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {photos.length > 1 ? (
        <div
          role="group"
          aria-label="Product photos"
          className="flex max-w-full gap-2 overflow-x-auto pb-1"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedId(photo.id)}
              aria-label={`View product photo ${index + 1}`}
              aria-pressed={selected?.id === photo.id}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-[var(--surface)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
                selected?.id === photo.id
                  ? 'border-[var(--primary)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <img
                src={photo.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
