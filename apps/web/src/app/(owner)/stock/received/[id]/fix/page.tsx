import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';

import {
  notFound,
} from 'next/navigation';

import {
  and,
  eq,
  or,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  products,
  stockArrivals,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import {
  submitStockFixAction,
} from '@/lib/stock/fixes';

type FixStockPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams?: Promise<{
    error?: string;
  }>;
};

function money(
  value: string,
) {
  return `RWF ${new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits:
        0,
    },
  ).format(
    Number(value || 0),
  )}`;
}

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
      bouquet:
        'bouquets',
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

export default async function FixStockPage({
  params,
  searchParams,
}: FixStockPageProps) {
  const user =
    await requirePermission('stock.correct');

  const {
    id,
  } = await params;

  const query =
    await searchParams;

  const [receipt] =
    await db
      .select({
        id:
          stockArrivals.id,

        productId:
          stockArrivals.productId,

        productName:
          stockArrivals.productName,

        quantityReceived:
          stockArrivals.quantityReceived,

        sellingPriceSnapshot:
          stockArrivals.sellingPriceSnapshot,

        supplierName:
          stockArrivals.supplierName,

        reference:
          stockArrivals.reference,

        notes:
          stockArrivals.notes,

        arrivedAt:
          stockArrivals.arrivedAt,

        unit:
          products.unit,
      })
      .from(stockArrivals)
      .innerJoin(
        products,
        eq(
          stockArrivals.productId,
          products.id,
        ),
      )
      .where(
        eq(
          stockArrivals.id,
          id,
        ),
      )
      .limit(1);

  if (!receipt) {
    notFound();
  }

  const correctionProducts =
    await db
      .select({
        id:
          products.id,

        name:
          products.name,

        category:
          products.category,

        unit:
          products.unit,
      })
      .from(products)
      .where(
        and(
          eq(
            products.itemType,
            'PRODUCT',
          ),

          or(
            eq(
              products.status,
              'ACTIVE',
            ),

            eq(
              products.id,
              receipt.productId,
            ),
          ),
        ),
      )
      .orderBy(
        products.name,
      );

  const [
    pendingRequest,
  ] =
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
            'STOCK_RECEIPT',
          ),

          eq(
            corrections.targetId,
            receipt.id,
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

  const importedValue =
    receipt.quantityReceived *
    Number(
      receipt.sellingPriceSnapshot,
    );

  return (
    <section className="mx-auto max-w-3xl">
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
            {isOwner
              ? 'Correct stock receipt'
              : 'Request receipt correction'}
          </h2>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            {receipt.productName}
          </p>
        </div>

        <section className="grid grid-cols-2 border-b border-[var(--border)] sm:grid-cols-3">
          <div className="border-b border-r border-[var(--border)] px-4 py-3 sm:border-b-0">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Recorded
            </p>

            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {unitLabel(
                receipt.quantityReceived,
                receipt.unit,
              )}
            </p>
          </div>

          <div className="border-b border-[var(--border)] px-4 py-3 sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Selling price then
            </p>

            <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
              {money(
                receipt.sellingPriceSnapshot,
              )}
            </p>
          </div>

          <div className="col-span-2 px-4 py-3 sm:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Imported value
            </p>

            <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
              {money(
                String(
                  importedValue,
                ),
              )}
            </p>
          </div>
        </section>

        {query?.error ? (
          <div className="mx-4 mt-5 rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)] sm:mx-6">
            {query.error}
          </div>
        ) : null}

        {!isOwner &&
        pendingRequest ? (
          <div className="mx-4 mt-5 rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)] sm:mx-6">
            A correction request for
            this receipt is already
            waiting for the owner.
          </div>
        ) : null}

        <form
          action={
            submitStockFixAction
          }
          className="space-y-5 px-4 py-5 sm:px-6"
        >
          <input
            type="hidden"
            name="receiptId"
            value={
              receipt.id
            }
          />

          <div>
            <label
              htmlFor="productId"
              className="text-sm font-black text-[var(--text)]"
            >
              Product
            </label>

            <select
              id="productId"
              name="productId"
              required
              defaultValue={
                receipt.productId
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
            >
              {correctionProducts.map(
                (product) => (
                  <option
                    key={
                      product.id
                    }
                    value={
                      product.id
                    }
                  >
                    {product.name}
                    {' — '}
                    {product.category}
                    {' / '}
                    {product.unit}
                  </option>
                ),
              )}
            </select>

            <p className="mt-1.5 text-xs font-bold leading-5 text-[var(--muted)]">
              Change this only if
              the receipt was entered
              under the wrong
              product. Both stock
              balances will be
              recalculated when the
              correction is applied.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="quantityReceived"
                className="text-sm font-black text-[var(--text)]"
              >
                Quantity received
              </label>

              <input
                id="quantityReceived"
                name="quantityReceived"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={
                  receipt.quantityReceived
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />

              <p className="mt-1.5 text-xs font-bold text-[var(--muted)]">
                Use 0 only if this
                receipt was entered
                by mistake.
              </p>
            </div>

            <div>
              <label
                htmlFor="supplierName"
                className="text-sm font-black text-[var(--text)]"
              >
                Supplier{' '}
                <span className="font-bold text-[var(--muted)]">
                  (optional)
                </span>
              </label>

              <input
                id="supplierName"
                name="supplierName"
                maxLength={160}
                defaultValue={
                  receipt.supplierName ||
                  ''
                }
                placeholder="Supplier name"
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reference"
              className="text-sm font-black text-[var(--text)]"
            >
              Reference{' '}
              <span className="font-bold text-[var(--muted)]">
                (optional)
              </span>
            </label>

            <input
              id="reference"
              name="reference"
              maxLength={120}
              defaultValue={
                receipt.reference ||
                ''
              }
              placeholder="Delivery or receipt reference"
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="notes"
              className="text-sm font-black text-[var(--text)]"
            >
              Receipt notes{' '}
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
                receipt.notes ||
                ''
              }
              placeholder="Anything useful about this delivery"
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="text-sm font-black text-[var(--text)]"
            >
              {isOwner
                ? 'Reason for correction'
                : 'What was entered incorrectly?'}
            </label>

            <textarea
              id="reason"
              name="reason"
              rows={3}
              minLength={3}
              maxLength={1000}
              required
              placeholder="Example: I entered 9 chargers instead of 8"
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>

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
                !isOwner &&
                Boolean(
                  pendingRequest,
                )
              }
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary-action)] px-6 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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
