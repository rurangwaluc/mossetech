import { requirePermission } from '@/lib/auth/require-permission';
import { saveStockReceiptCostAction } from '@/lib/stock/receipt-cost-actions';
import Image from 'next/image';
import Link from 'next/link';

import {
  asc,
  eq,
} from 'drizzle-orm';

import {
  notFound,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
  saleItems,
  sales,
  stockArrivals,
  stockDamages,
  users,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

type StockHistoryPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type HistoryEntry =
  | {
      type: 'RECEIVED';
      id: string;
      date: Date;
      quantity: number;
      value: number;
      person: string | null;
      supplier: string | null;
      reference: string | null;
      notes: string | null;
    }
  | {
      type: 'SOLD';
      id: string;
      date: Date;
      quantity: number;
      value: number;
      saleId: string;
    }
  | {
      type: 'DAMAGED';
      id: string;
      date: Date;
      quantity: number;
      person: string | null;
      reason: string;
      notes: string | null;
    };

function money(
  value: number,
) {
  return `RWF ${new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
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

export default async function StockHistoryPage({
  params,
}: StockHistoryPageProps) {
  const user = await requirePermission('stock.view');

  const {
    id,
  } = await params;

  const [product] =
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

        imageKey:
          products.imageKey,

        sellingPrice:
          products.sellingPrice,

        status:
          products.status,

        itemType:
          products.itemType,
      })
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
    product.itemType !==
      'PRODUCT'
  ) {
    notFound();
  }

  const [
    receipts,
    soldRows,
    damages,
  ] = await Promise.all([
    db
      .select({
        id:
          stockArrivals.id,

        quantity:
          stockArrivals.quantityReceived,

        sellingPrice:
          stockArrivals.sellingPriceSnapshot,

        supplier:
          stockArrivals.supplierName,

        reference:
          stockArrivals.reference,

        notes:
          stockArrivals.notes,

        date:
          stockArrivals.arrivedAt,

        person:
          users.name,
      })
      .from(stockArrivals)
      .innerJoin(
        users,
        eq(
          stockArrivals.receivedByUserId,
          users.id,
        ),
      )
      .where(
        eq(
          stockArrivals.productId,
          product.id,
        ),
      )
      .orderBy(
        asc(
          stockArrivals.arrivedAt,
        ),
      ),

    db
      .select({
        id:
          saleItems.id,

        saleId:
          saleItems.saleId,

        quantity:
          saleItems.quantity,

        lineTotal:
          saleItems.lineTotal,

        date:
          sales.saleDate,
      })
      .from(saleItems)
      .innerJoin(
        sales,
        eq(
          saleItems.saleId,
          sales.id,
        ),
      )
      .where(
        eq(
          saleItems.productId,
          product.id,
        ),
      )
      .orderBy(
        asc(
          sales.saleDate,
        ),
      ),

    db
      .select({
        id:
          stockDamages.id,

        quantity:
          stockDamages.quantityDamaged,

        reason:
          stockDamages.reason,

        notes:
          stockDamages.notes,

        date:
          stockDamages.damagedAt,

        person:
          users.name,
      })
      .from(stockDamages)
      .innerJoin(
        users,
        eq(
          stockDamages.recordedByUserId,
          users.id,
        ),
      )
      .where(
        eq(
          stockDamages.productId,
          product.id,
        ),
      )
      .orderBy(
        asc(
          stockDamages.damagedAt,
        ),
      ),
  ]);

  /*
   * Private acquisition costs are queried separately.
   * Employee requests never select or receive these values.
   */
  const ownerReceiptCosts =
    user.role === 'OWNER'
      ? await db
          .select({
            id: stockArrivals.id,
            buyingPrice: stockArrivals.buyingPrice,
          })
          .from(stockArrivals)
          .where(eq(stockArrivals.productId, product.id))
      : [];

  const costByReceiptId = new Map(
    ownerReceiptCosts.map((receipt) => [
      receipt.id,
      Number(receipt.buyingPrice),
    ]),
  );

  const imported =
    receipts.reduce(
      (
        total,
        receipt,
      ) =>
        total +
        receipt.quantity,
      0,
    );

  const sold =
    soldRows.reduce(
      (
        total,
        sale,
      ) =>
        total +
        sale.quantity,
      0,
    );

  const damaged =
    damages.reduce(
      (
        total,
        damage,
      ) =>
        total +
        damage.quantity,
      0,
    );

  const remaining =
    imported -
    sold -
    damaged;

  const importedValue =
    receipts.reduce(
      (
        total,
        receipt,
      ) =>
        total +
        receipt.quantity *
          Number(
            receipt.sellingPrice,
          ),
      0,
    );

  const salesValue =
    soldRows.reduce(
      (
        total,
        sale,
      ) =>
        total +
        Number(
          sale.lineTotal,
        ),
      0,
    );

  const remainingValue =
    remaining *
    Number(
      product.sellingPrice,
    );

  const history:
    HistoryEntry[] = [
      ...receipts.map(
        (
          receipt,
        ): HistoryEntry => ({
          type:
            'RECEIVED',

          id:
            receipt.id,

          date:
            receipt.date,

          quantity:
            receipt.quantity,

          value:
            receipt.quantity *
            Number(
              receipt.sellingPrice,
            ),

          person:
            receipt.person,

          supplier:
            receipt.supplier,

          reference:
            receipt.reference,

          notes:
            receipt.notes,
        }),
      ),

      ...soldRows.map(
        (
          sale,
        ): HistoryEntry => ({
          type:
            'SOLD',

          id:
            sale.id,

          date:
            sale.date,

          quantity:
            sale.quantity,

          value:
            Number(
              sale.lineTotal,
            ),

          saleId:
            sale.saleId,
        }),
      ),

      ...damages.map(
        (
          damage,
        ): HistoryEntry => ({
          type:
            'DAMAGED',

          id:
            damage.id,

          date:
            damage.date,

          quantity:
            damage.quantity,

          person:
            damage.person,

          reason:
            damage.reason,

          notes:
            damage.notes,
        }),
      ),
    ].sort(
      (first, second) =>
        second.date.getTime() -
        first.date.getTime(),
    );

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            href={`/products/${product.id}`}
            prefetch
            className="flex min-w-0 flex-1 items-center gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {product.imageKey ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
                <Image
                  src={`/api/media/product-image/${product.id}?v=${encodeURIComponent(
                    product.imageKey,
                  )}`}
                  alt=""
                  fill
                  unoptimized
                  sizes="56px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-lg font-black text-[var(--muted)]">
                {product.name
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-[var(--text)] transition hover:text-[var(--primary)]">
                {product.name}
              </h2>

              <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                {product.category}
                {' / '}
                {product.unit}
              </p>
            </div>
          </Link>

          <Link
            href={`/stock/receive?product=${product.id}`}
            prefetch
            className="hidden h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-xs font-black text-white sm:inline-flex"
          >
            Receive stock
          </Link>
        </div>

        <div className="grid grid-cols-2 border-t border-[var(--border)] lg:grid-cols-4">
          <div className="border-b border-r border-[var(--border)] px-4 py-3 lg:border-b-0">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Imported
            </p>

            <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
              {unitLabel(
                imported,
                product.unit,
              )}
            </p>

            <p className="mt-1 text-xs font-bold tabular-nums text-[var(--muted)]">
              {money(
                importedValue,
              )}
            </p>
          </div>

          <div className="border-b border-[var(--border)] px-4 py-3 lg:border-b-0 lg:border-r">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Sold
            </p>

            <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
              {unitLabel(
                sold,
                product.unit,
              )}
            </p>

            <p className="mt-1 text-xs font-bold tabular-nums text-[var(--muted)]">
              {money(
                salesValue,
              )}
            </p>
          </div>

          <div className="border-r border-[var(--border)] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Damaged
            </p>

            <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
              {unitLabel(
                damaged,
                product.unit,
              )}
            </p>
          </div>

          <div className="px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              Remaining
            </p>

            <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
              {unitLabel(
                remaining,
                product.unit,
              )}
            </p>

            <p className="mt-1 text-xs font-bold tabular-nums text-[var(--muted)]">
              {money(
                remainingValue,
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-black text-[var(--text)]">
              Stock history
            </h3>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              Receipts, sales and
              damaged stock in
              chronological order.
            </p>
          </div>

          <Link
            href="/stock"
            prefetch
            className="text-xs font-black text-[var(--primary)]"
          >
            Back to stock
          </Link>
        </div>

        {history.length ===
        0 ? (
          <div className="px-4 py-8 sm:px-6">
            <p className="text-sm font-black text-[var(--text)]">
              No stock activity yet.
            </p>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              The first receipt,
              sale or damage record
              will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {history.map(
              (entry) => {
                if (
                  entry.type ===
                  'RECEIVED'
                ) {
                  return (
                    <article
                      key={`received-${entry.id}`}
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    >
                      <div>
                        <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                          Received
                        </p>

                        <p className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                          {formatDate(
                            entry.date,
                          )}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-black text-[var(--text)]">
                          +
                          {unitLabel(
                            entry.quantity,
                            product.unit,
                          )}
                        </p>

                        <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                          {money(
                            entry.value,
                          )}
                          {entry.person
                            ? ` / ${entry.person}`
                            : ''}
                        </p>

                        {entry.supplier ||
                        entry.reference ? (
                          <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                            {entry.supplier ||
                              'No supplier'}
                            {entry.reference
                              ? ` / ${entry.reference}`
                              : ''}
                          </p>
                        ) : null}

                        {entry.notes ? (
                          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                            {
                              entry.notes
                            }
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2">
                        {user.role === 'OWNER' ? (
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                            {Number(costByReceiptId.get(entry.id) ?? 0) > 0 ? (
                              <p className="text-xs font-bold text-[var(--text)]">
                                Acquisition cost per unit: {money(
                                  Number(costByReceiptId.get(entry.id)),
                                )}
                              </p>
                            ) : (
                              <>
                                <p className="text-xs font-bold text-[var(--muted)]">
                                  Cost pending
                                </p>
                                <form
                                  action={saveStockReceiptCostAction}
                                  className="mt-2 flex flex-wrap items-end gap-2"
                                >
                                  <input
                                    type="hidden"
                                    name="receiptId"
                                    value={entry.id}
                                  />
                                  <label className="min-w-0 flex-1 text-xs font-bold text-[var(--text)]">
                                    Unit acquisition cost (RWF)
                                    <input
                                      type="number"
                                      name="buyingPrice"
                                      min="0.01"
                                      max="9999999999.99"
                                      step="0.01"
                                      required
                                      placeholder="Actual cost"
                                      className="mt-1 h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)]"
                                    />
                                  </label>
                                  <button
                                    type="submit"
                                    className="h-10 rounded-lg bg-[var(--primary-action)] px-3 text-xs font-bold text-white"
                                  >
                                    Save cost
                                  </button>
                                </form>
                              </>
                            )}
                          </div>
                        ) : null}
                        <Link
                        href={`/stock/received/${entry.id}/fix`}
                        prefetch
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                      >
                        Correct receipt
                        </Link>
                      </div>
                    </article>
                  );
                }

                if (
                  entry.type ===
                  'SOLD'
                ) {
                  return (
                    <article
                      key={`sold-${entry.id}`}
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    >
                      <div>
                        <p className="text-xs font-black text-[var(--text)]">
                          Sold
                        </p>

                        <p className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                          {formatDate(
                            entry.date,
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-black text-[var(--text)]">
                          -
                          {unitLabel(
                            entry.quantity,
                            product.unit,
                          )}
                        </p>

                        <p className="mt-1 text-xs font-bold tabular-nums text-[var(--muted)]">
                          {money(
                            entry.value,
                          )}
                        </p>
                      </div>

                      <Link
                        href={`/sales/${entry.saleId}`}
                        prefetch
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                      >
                        View sale
                      </Link>
                    </article>
                  );
                }

                return (
                  <article
                    key={`damaged-${entry.id}`}
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                  >
                    <div>
                      <p className="text-xs font-black text-[var(--danger)]">
                        Damaged
                      </p>

                      <p className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                        {formatDate(
                          entry.date,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-black text-[var(--text)]">
                        -
                        {unitLabel(
                          entry.quantity,
                          product.unit,
                        )}
                      </p>

                      <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                        {entry.reason}
                        {entry.person
                          ? ` / ${entry.person}`
                          : ''}
                      </p>

                      {entry.notes ? (
                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                          {
                            entry.notes
                          }
                        </p>
                      ) : null}
                    </div>

                    <Link
                      href={`/stock/damaged/${entry.id}/fix`}
                      prefetch
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                    >
                      Correct damage
                    </Link>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>
    </section>
  );
}
