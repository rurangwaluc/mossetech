'use client';

import {
  useState,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertTriangle,
} from 'lucide-react';

import {
  enqueueOfflineOperation,
} from '@/lib/offline/outbox';

import {
  runOutboxSync,
} from '@/lib/offline/sync';

import {
  recordStockDamageAction,
} from '@/lib/stock/actions';

type RecordDamageFormProps = {
  userId: string;

  product: {
    id: string;
    name: string;
    category: string;
    unit: string;
    imageKey: string | null;
    sellingPrice: string;
    remaining: number;
  };

  error?: string;
};

function unitLabel(
  quantity: number,
  unit: string,
) {
  if (quantity === 1) {
    return `1 ${unit}`;
  }

  const plurals:
    Record<
      string,
      string
    > = {
      stem: 'stems',
      bouquet: 'bouquets',
      bunch: 'bunches',
      piece: 'pieces',
      pack: 'packs',
      box: 'boxes',
      pot: 'pots',
    };

  return `${quantity} ${
    plurals[
      unit.toLowerCase()
    ] ||
    unit
  }`;
}

const fieldClass =
  'h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none transition focus:border-[var(--primary)]';

export function RecordDamageForm({
  userId,
  product,
  error,
}: RecordDamageFormProps) {
  const router =
    useRouter();

  const [
    quantity,
    setQuantity,
  ] = useState('');

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    queued,
    setQueued,
  ] = useState(false);

  const [
    clientError,
    setClientError,
  ] = useState<string | null>(
    null,
  );

  const quantityNumber =
    Number(quantity);

  const validQuantity =
    Number.isInteger(
      quantityNumber,
    ) &&
    quantityNumber > 0
      ? quantityNumber
      : 0;

  const remainingAfter =
    Math.max(
      0,
      product.remaining -
        validQuantity,
    );

  async function saveLocally(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      saving ||
      queued
    ) {
      return;
    }

    const form =
      event.currentTarget;

    if (!form.reportValidity()) {
      return;
    }

    if (
      validQuantity < 1
    ) {
      setClientError(
        'Damaged quantity must be at least 1.',
      );

      return;
    }

    if (
      validQuantity >
      product.remaining
    ) {
      setClientError(
        `Only ${product.remaining} ${product.unit} are currently available.`,
      );

      return;
    }

    const data =
      new FormData(form);

    const reason =
      String(
        data.get(
          'reason',
        ) || '',
      ).trim();

    const notes =
      String(
        data.get(
          'notes',
        ) || '',
      ).trim();

    if (!reason) {
      setClientError(
        'Choose why the stock was damaged.',
      );

      return;
    }

    setClientError(
      null,
    );

    setSaving(
      true,
    );

    try {
      await enqueueOfflineOperation({
        userId,

        kind:
          'STOCK_DAMAGE',

        payload: {
          productId:
            product.id,

          quantityDamaged:
            validQuantity,

          reason,

          notes:
            notes || null,
        },
      });
    } catch (
      saveError
    ) {
      setSaving(
        false,
      );

      setClientError(
        saveError instanceof
          Error
          ? saveError.message
          : 'Damaged stock could not be saved on this device.',
      );

      return;
    }

    void runOutboxSync(
      userId,
    );

    if (
      navigator.onLine
    ) {
      router.replace(
        '/stock?damaged=1',
      );

      return;
    }

    setQueued(
      true,
    );

    setSaving(
      false,
    );
  }

  return (
    <form
      action={
        recordStockDamageAction
      }
      onSubmit={
        saveLocally
      }
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
    >
      <input
        type="hidden"
        name="productId"
        value={
          product.id
        }
      />

      <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
          Record damaged stock
        </h2>

        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          Record flowers that can
          no longer be sold.
        </p>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <section className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {product.imageKey ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={`/api/media/product-image/${product.id}?v=${encodeURIComponent(
                  product.imageKey,
                )}`}
                alt=""
                fill
                unoptimized
                sizes="48px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--card)]">
              <AlertTriangle className="h-5 w-5 text-[var(--muted)]" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[var(--text)]">
              {product.name}
            </p>

            <p className="mt-0.5 text-xs font-bold text-[var(--muted)]">
              {product.category}
              {' / '}
              {product.unit}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Available
            </p>

            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {unitLabel(
                product.remaining,
                product.unit,
              )}
            </p>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="quantityDamaged"
              className="text-sm font-black text-[var(--text)]"
            >
              Quantity damaged
            </label>

            <input
              id="quantityDamaged"
              name="quantityDamaged"
              type="number"
              min="1"
              max={
                product.remaining
              }
              step="1"
              required
              value={
                quantity
              }
              onChange={(
                event,
              ) =>
                setQuantity(
                  event.target
                    .value,
                )
              }
              className={`${fieldClass} mt-2`}
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="text-sm font-black text-[var(--text)]"
            >
              Reason
            </label>

            <select
              id="reason"
              name="reason"
              required
              defaultValue=""
              className={`${fieldClass} mt-2`}
            >
              <option
                value=""
                disabled
              >
                Choose reason
              </option>

              <option value="Wilted">
                Wilted
              </option>

              <option value="Broken">
                Broken
              </option>

              <option value="Spoiled">
                Spoiled
              </option>

              <option value="Handling damage">
                Handling damage
              </option>

              <option value="Other">
                Other
              </option>
            </select>
          </div>
        </div>

        {validQuantity >
        0 ? (
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--border)]">
            <div className="border-r border-[var(--border)] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                Current
              </p>

              <p className="mt-1 text-sm font-black text-[var(--text)]">
                {unitLabel(
                  product.remaining,
                  product.unit,
                )}
              </p>
            </div>

            <div className="px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                After damage
              </p>

              <p className="mt-1 text-sm font-black text-[var(--text)]">
                {unitLabel(
                  remainingAfter,
                  product.unit,
                )}
              </p>
            </div>
          </div>
        ) : null}

        <div>
          <label
            htmlFor="notes"
            className="text-sm font-black text-[var(--text)]"
          >
            Notes{' '}
            <span className="font-bold text-[var(--muted)]">
              (optional)
            </span>
          </label>

          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={1000}
            placeholder="Anything useful about the damage"
            className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
          />
        </div>

        {queued ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            Damage saved on this
            device. It will sync
            automatically when
            online.
          </div>
        ) : null}

        {clientError ||
        error ? (
          <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
            {clientError ||
              error}
          </div>
        ) : null}

        <div className="grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-[1fr_auto]">
          <Link
            href="/stock"
            prefetch
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={
              validQuantity <
                1 ||
              validQuantity >
                product.remaining ||
              saving ||
              queued
            }
            className="h-11 rounded-lg bg-[var(--primary)] px-6 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? 'Saving...'
              : queued
                ? 'Saved on device'
                : 'Record damage'}
          </button>
        </div>
      </div>
    </form>
  );
}
