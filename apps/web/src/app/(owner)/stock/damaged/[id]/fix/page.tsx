import Link from 'next/link';

import {
  notFound,
} from 'next/navigation';

import {
  and,
  eq,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  products,
  stockDamages,
} from '@mossetech/db/schema';

import {
  requireUser,
} from '@/lib/auth/session';

import {
  submitStockDamageFixAction,
} from '@/lib/stock/damage-fixes';

type DamageFixPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams?: Promise<{
    error?: string;
  }>;
};

function formatDate(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        'Africa/Kigali',

      day:
        'numeric',

      month:
        'short',

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  ).format(value);
}

function unitLabel(
  quantity: number,
  unit: string,
) {
  if (quantity === 1) {
    return `1 ${unit}`;
  }

  const plurals:
    Record<string, string> = {
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
    ] || unit
  }`;
}

export default async function DamageFixPage({
  params,
  searchParams,
}: DamageFixPageProps) {
  const user =
    await requireUser();

  const {
    id,
  } = await params;

  const query =
    await searchParams;

  const [damage] =
    await db
      .select({
        id:
          stockDamages.id,

        productId:
          stockDamages.productId,

        productName:
          stockDamages.productName,

        quantityDamaged:
          stockDamages.quantityDamaged,

        reason:
          stockDamages.reason,

        notes:
          stockDamages.notes,

        damagedAt:
          stockDamages.damagedAt,

        unit:
          products.unit,
      })
      .from(stockDamages)
      .innerJoin(
        products,
        eq(
          stockDamages.productId,
          products.id,
        ),
      )
      .where(
        eq(
          stockDamages.id,
          id,
        ),
      )
      .limit(1);

  if (!damage) {
    notFound();
  }

  const [pendingRequest] =
    await db
      .select({
        id:
          corrections.id,
      })
      .from(corrections)
      .where(
        and(
          eq(
            corrections.targetType,
            'STOCK_DAMAGE',
          ),

          eq(
            corrections.targetId,
            damage.id,
          ),

          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  const isOwner =
    user.role ===
    'OWNER';

  return (
    <section className="mx-auto max-w-3xl">
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
            {isOwner
              ? 'Correct damaged stock'
              : 'Request damage correction'}
          </h2>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            {damage.productName}
          </p>
        </div>

        <div className="grid grid-cols-2 border-b border-[var(--border)]">
          <div className="border-r border-[var(--border)] px-4 py-3 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Recorded damage
            </p>

            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {unitLabel(
                damage.quantityDamaged,
                damage.unit,
              )}
            </p>
          </div>

          <div className="px-4 py-3 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Recorded
            </p>

            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {formatDate(
                damage.damagedAt,
              )}
            </p>
          </div>
        </div>

        {query?.error ? (
          <div className="mx-4 mt-5 rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)] sm:mx-6">
            {query.error}
          </div>
        ) : null}

        {!isOwner &&
        pendingRequest ? (
          <div className="mx-4 mt-5 rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)] sm:mx-6">
            A correction request for
            this damage record is
            already waiting for the
            owner.
          </div>
        ) : null}

        <form
          action={
            submitStockDamageFixAction
          }
          className="space-y-5 px-4 py-5 sm:px-6"
        >
          <input
            type="hidden"
            name="damageId"
            value={
              damage.id
            }
          />

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
                min="0"
                step="1"
                required
                defaultValue={
                  damage.quantityDamaged
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />

              <p className="mt-1.5 text-xs font-bold text-[var(--muted)]">
                Use 0 only if the
                damage was recorded
                by mistake.
              </p>
            </div>

            <div>
              <label
                htmlFor="damageReason"
                className="text-sm font-black text-[var(--text)]"
              >
                Damage reason
              </label>

              <select
                id="damageReason"
                name="damageReason"
                required
                defaultValue={
                  damage.reason
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
              >
                {![
                  'Wilted',
                  'Broken',
                  'Spoiled',
                  'Handling damage',
                  'Other',
                ].includes(
                  damage.reason,
                ) ? (
                  <option
                    value={
                      damage.reason
                    }
                  >
                    {damage.reason}
                  </option>
                ) : null}

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

          <div>
            <label
              htmlFor="notes"
              className="text-sm font-black text-[var(--text)]"
            >
              Damage notes{' '}
              <span className="font-bold text-[var(--muted)]">
                (optional)
              </span>
            </label>

            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={1000}
              defaultValue={
                damage.notes || ''
              }
              placeholder="Anything useful about the damage"
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="correctionReason"
              className="text-sm font-black text-[var(--text)]"
            >
              {isOwner
                ? 'Reason for correction'
                : 'What was entered incorrectly?'}
            </label>

            <textarea
              id="correctionReason"
              name="correctionReason"
              rows={3}
              minLength={3}
              maxLength={1000}
              required
              placeholder="Example: 2 bouquets were entered as damaged instead of 1"
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>

          <div className="grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-[1fr_auto]">
            <Link
              href={`/stock/history/${damage.productId}`}
              prefetch
              className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={
                !isOwner &&
                Boolean(
                  pendingRequest,
                )
              }
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-6 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isOwner
                ? 'Save correction'
                : pendingRequest
                  ? 'Request sent'
                  : 'Send request'}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
