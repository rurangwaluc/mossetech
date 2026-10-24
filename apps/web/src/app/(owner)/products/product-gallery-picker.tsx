'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { prepareProductImage } from '@/lib/products/image-upload';

export type SelectedGalleryPhoto = {
  id: string;
  file: File;
};

type GalleryPickerProps = {
  value: SelectedGalleryPhoto[];
  onChange: (value: SelectedGalleryPhoto[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
};

export function ProductGalleryPicker({
  value,
  onChange,
  disabled = false,
  maxPhotos = 7,
}: GalleryPickerProps) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const urls = useRef<Record<string, string>>({});

  useEffect(() => {
    const current = new Set(value.map((photo) => photo.id));
    const next: Record<string, string> = {};

    for (const photo of value) {
      if (!urls.current[photo.id]) {
        urls.current[photo.id] = URL.createObjectURL(photo.file);
      }

      next[photo.id] = urls.current[photo.id];
    }

    for (const [id, url] of Object.entries(urls.current)) {
      if (!current.has(id)) {
        URL.revokeObjectURL(url);
        delete urls.current[id];
      }
    }

    setPreviews(next);
  }, [value]);

  useEffect(() => {
    const currentUrls = urls.current;
    return () => {
      for (const url of Object.values(currentUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  async function addFiles(files: FileList | null) {
    if (!files || disabled || preparing) return;

    setError(null);
    setPreparing(true);

    try {
      const available = Math.max(0, maxPhotos - value.length);

      if (files.length > available) {
        throw new Error(
          `You can add ${available} more photo${available === 1 ? '' : 's'}.`,
        );
      }

      const added: SelectedGalleryPhoto[] = [];

      for (const file of Array.from(files)) {
        const prepared = await prepareProductImage(file);

        added.push({
          id: crypto.randomUUID(),
          file: prepared,
        });
      }

      onChange([...value, ...added]);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Photos could not be prepared.',
      );
    } finally {
      setPreparing(false);
    }
  }

  function removePhoto(id: string) {
    if (disabled || preparing) return;
    onChange(value.filter((photo) => photo.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-[var(--text)]">
            Other product views
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            Up to {maxPhotos} additional photos.
          </p>
        </div>

        <span className="text-xs font-bold text-[var(--muted)]">
          {value.length} / {maxPhotos}
        </span>
      </div>

      {value.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((photo, index) => (
            <div
              key={photo.id}
              className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            >
              <div className="aspect-square">
                {previews[photo.id] ? (
                  <img
                    src={previews[photo.id]}
                    alt={`Additional product photo ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>

              <button
                type="button"
                disabled={disabled || preparing}
                onClick={() => removePhoto(photo.id)}
                className="min-h-10 w-full border-t border-[var(--border)] px-2 text-xs font-bold text-[var(--danger)] disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {value.length < maxPhotos ? (
        <label className={`flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-center ${
          disabled || preparing
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:border-[var(--primary)]'
        }`}>
          <span className="text-sm font-black text-[var(--text)]">
            {preparing ? 'Preparing photos…' : 'Add more photos'}
          </span>
          <span className="mt-1 text-xs text-[var(--muted)]">
            JPG, PNG or WebP
          </span>

          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || preparing}
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = '';
            }}
            className="sr-only"
          />
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-bold text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
