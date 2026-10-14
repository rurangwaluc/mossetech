'use client';

import {
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  Search,
} from 'lucide-react';

import {
  receiveStockAction,
} from '@/lib/stock/actions';

import {
  enqueueOfflineOperation,
} from '@/lib/offline/outbox';

import {
  runOutboxSync,
} from '@/lib/offline/sync';

type ProductOption = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  sellingPrice: string;
};

type ReceiveStockFormProps = {
  userId: string;
  products: ProductOption[];
  initialProductId?: string;
  error?: string;
};

const inputClass =
  'h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]';

function money(
  value: string,
) {
  return `RWF ${new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits: 0,
    },
  ).format(
    Number(value || 0),
  )}`;
}

function quantityLabel(
  quantity: number,
  unit: string,
) {
  return `${quantity} ${unit}`;
}

export function ReceiveStockForm({
  userId,
  products,
  initialProductId = '',
  error,
}: ReceiveStockFormProps) {
  const router =
    useRouter();

  const initialProduct =
    products.find(
      (product) =>
        product.id ===
        initialProductId,
    );

  const [
    productSearch,
    setProductSearch,
  ] = useState(
    initialProduct?.name || '',
  );

  const [
    selectedProductId,
    setSelectedProductId,
  ] = useState(
    initialProductId,
  );

  const [
    isProductSearchOpen,
    setIsProductSearchOpen,
  ] = useState(false);

  const [
    quantityReceived,
    setQuantityReceived,
  ] = useState('');

  const [
    savingLocally,
    setSavingLocally,
  ] = useState(false);

  const [
    queuedLocally,
    setQueuedLocally,
  ] = useState(false);

  const [
    clientError,
    setClientError,
  ] = useState<string | null>(
    null,
  );

  const selectedProduct =
    useMemo(
      () =>
        products.find(
          (product) =>
            product.id ===
            selectedProductId,
        ),
      [
        products,
        selectedProductId,
      ],
    );

  const filteredProducts =
    useMemo(() => {
      const search =
        productSearch
          .trim()
          .toLowerCase();

      if (!search) {
        return products.slice(
          0,
          8,
        );
      }

      return products
        .filter(
          (product) => {
            const target = [
              product.name,
              product.category,
              product.unit,
            ]
              .join(' ')
              .toLowerCase();

            return target.includes(
              search,
            );
          },
        )
        .slice(
          0,
          8,
        );
    }, [
      productSearch,
      products,
    ]);

  const receivedQuantity =
    Number(
      quantityReceived,
    );

  const validReceivedQuantity =
    Number.isInteger(
      receivedQuantity,
    ) &&
    receivedQuantity > 0
      ? receivedQuantity
      : 0;

  const projectedQuantity =
    selectedProduct
      ? selectedProduct.quantity +
        validReceivedQuantity
      : 0;

  async function receiveStockLocally(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      savingLocally ||
      queuedLocally
    ) {
      return;
    }

    const form =
      event.currentTarget;

    if (!form.reportValidity()) {
      return;
    }

    if (!selectedProduct) {
      setClientError(
        'Choose the product that arrived.',
      );

      return;
    }

    if (
      validReceivedQuantity <
      1
    ) {
      setClientError(
        'Quantity must be at least 1.',
      );

      return;
    }

    const data =
      new FormData(form);

    const supplierName =
      String(
        data.get(
          'supplierName',
        ) || '',
      ).trim();

    const reference =
      String(
        data.get(
          'reference',
        ) || '',
      ).trim();

    const notes =
      String(
        data.get(
          'notes',
        ) || '',
      ).trim();

    if (
      supplierName.length >
      160
    ) {
      setClientError(
        'Supplier name is too long.',
      );

      return;
    }

    if (
      reference.length >
      120
    ) {
      setClientError(
        'Reference is too long.',
      );

      return;
    }

    if (
      notes.length >
      1000
    ) {
      setClientError(
        'Notes are too long.',
      );

      return;
    }

    setClientError(
      null,
    );

    setSavingLocally(
      true,
    );

    try {
      await enqueueOfflineOperation({
        userId,

        kind:
          'STOCK_RECEIVE',

        payload: {
          productId:
            selectedProduct.id,

          quantityReceived:
            validReceivedQuantity,

          /*
           * Preserve the selling value visible
           * when this receipt was recorded.
           */
          sellingPriceSnapshot:
            selectedProduct.sellingPrice,

          supplierName:
            supplierName ||
            null,

          reference:
            reference ||
            null,

          notes:
            notes ||
            null,
        },
      });
    } catch (saveError) {
      setSavingLocally(
        false,
      );

      setClientError(
        saveError instanceof
          Error
          ? saveError.message
          : 'Stock receipt could not be saved on this device.',
      );

      return;
    }

    /*
     * Do not wait for Supabase before
     * letting the user continue.
     */
    void runOutboxSync(
      userId,
    );

    if (navigator.onLine) {
      router.replace(
        '/stock?received=1',
      );

      return;
    }

    setQueuedLocally(
      true,
    );

    setSavingLocally(
      false,
    );
  }

  return (
    <form
      action={
        receiveStockAction
      }
      onSubmit={
        receiveStockLocally
      }
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
    >
      <input
        type="hidden"
        name="productId"
        value={
          selectedProductId
        }
      />

      <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
          Receive stock
        </h2>

        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          Record flowers that
          have arrived.
        </p>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div>
          <label
            htmlFor="productSearch"
            className="text-sm font-black text-[var(--text)]"
          >
            Product
          </label>

          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

            <input
              id="productSearch"
              value={
                productSearch
              }
              onChange={(
                event,
              ) => {
                setProductSearch(
                  event.target
                    .value,
                );

                setSelectedProductId(
                  '',
                );

                setIsProductSearchOpen(
                  true,
                );
              }}
              onFocus={() =>
                setIsProductSearchOpen(
                  true,
                )
              }
              placeholder="Search products"
              autoComplete="off"
              className={`${inputClass} pl-10`}
            />

            {isProductSearchOpen ? (
              <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg">
                {filteredProducts.length ===
                0 ? (
                  <p className="px-3 py-4 text-sm font-bold text-[var(--muted)]">
                    No product
                    found.
                  </p>
                ) : (
                  filteredProducts.map(
                    (
                      product,
                    ) => (
                      <button
                        key={
                          product.id
                        }
                        type="button"
                        onClick={() => {
                          setSelectedProductId(
                            product.id,
                          );

                          setProductSearch(
                            product.name,
                          );

                          setIsProductSearchOpen(
                            false,
                          );
                        }}
                        className="w-full rounded-md px-3 py-3 text-left transition hover:bg-[var(--surface)]"
                      >
                        <span className="block text-sm font-black text-[var(--text)]">
                          {
                            product.name
                          }
                        </span>

                        <span className="mt-1 block text-xs font-bold text-[var(--muted)]">
                          {
                            product.category
                          }
                          {' / '}
                          {
                            product.unit
                          }
                        </span>

                        <span className="mt-1 block text-xs font-bold text-[var(--muted)]">
                          {
                            money(
                              product.sellingPrice,
                            )
                          }
                          {' / '}
                          Stock:{' '}
                          {quantityLabel(
                            product.quantity,
                            product.unit,
                          )}
                        </span>
                      </button>
                    ),
                  )
                )}
              </div>
            ) : null}
          </div>

          {!selectedProduct ? (
            <p className="mt-2 text-xs font-bold text-[var(--muted)]">
              Search and select
              the product that
              arrived.
            </p>
          ) : null}
        </div>

        {selectedProduct ? (
          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--text)]">
                  {
                    selectedProduct.name
                  }
                </p>

                <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                  {
                    selectedProduct.category
                  }
                  {' / '}
                  {
                    selectedProduct.unit
                  }
                </p>
              </div>

              <p className="shrink-0 text-sm font-black tabular-nums text-[var(--text)]">
                {money(
                  selectedProduct.sellingPrice,
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 border-t border-[var(--border)]">
              <div className="border-r border-[var(--border)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  Current stock
                </p>

                <p className="mt-1 text-sm font-black text-[var(--text)]">
                  {quantityLabel(
                    selectedProduct.quantity,
                    selectedProduct.unit,
                  )}
                </p>
              </div>

              <div className="px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  After receive
                </p>

                <p className="mt-1 text-sm font-black text-[var(--text)]">
                  {validReceivedQuantity >
                  0
                    ? quantityLabel(
                        projectedQuantity,
                        selectedProduct.unit,
                      )
                    : '—'}
                </p>
              </div>
            </div>
          </section>
        ) : null}

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
            min="1"
            step="1"
            required
            value={
              quantityReceived
            }
            onChange={(
              event,
            ) =>
              setQuantityReceived(
                event.target.value,
              )
            }
            placeholder="Example: 20"
            className={`${inputClass} mt-2`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
              placeholder="Supplier name"
              className={`${inputClass} mt-2`}
            />
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
              placeholder="Delivery or receipt reference"
              className={`${inputClass} mt-2`}
            />
          </div>
        </div>

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
            placeholder="Anything useful about this delivery"
            className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
          />
        </div>

        {queuedLocally ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            Stock receipt saved on this device. It will sync automatically when you are online.
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
            Back
          </Link>

          <button
            type="submit"
            disabled={
              !selectedProductId ||
              validReceivedQuantity <
                1 ||
              savingLocally ||
              queuedLocally
            }
            className="h-11 rounded-lg bg-[var(--primary)] px-6 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingLocally
              ? 'Saving...'
              : queuedLocally
                ? 'Saved on device'
                : 'Receive stock'}
          </button>
        </div>
      </div>
    </form>
  );
}
