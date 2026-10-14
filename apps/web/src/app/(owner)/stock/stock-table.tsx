'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  createPortal,
} from 'react-dom';

import Image from 'next/image';
import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  GripVertical,
  MoreHorizontal,
} from 'lucide-react';

export type StockTableRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  imageKey: string | null;
  unitPrice: number;
  imported: number;
  sold: number;
  remaining: number;
  importedValue: number;
  salesValue: number;
  remainingValue: number;
  damaged: number;
  minQuantity: number;
};

type StockTableProps = {
  rows: StockTableRow[];
};

const ORDER_KEY =
  'bloom-kigali:stock-row-order:v1';

function money(
  value: number,
) {
  return `${new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
}

function quantity(
  value: number,
  unit: string,
) {
  return `${value} ${unit}`;
}

function remainingClass(
  row: StockTableRow,
) {
  if (row.remaining <= 0) {
    return 'text-[var(--danger)]';
  }

  if (
    row.remaining <=
    row.minQuantity
  ) {
    return 'text-[var(--primary)]';
  }

  return 'text-[var(--text)]';
}

function ProductPhoto({
  row,
}: {
  row: StockTableRow;
}) {
  if (!row.imageKey) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-black text-[var(--muted)]">
        {row.name
          .slice(0, 1)
          .toUpperCase()}
      </div>
    );
  }

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <Image
        src={`/api/media/product-image/${row.id}?v=${encodeURIComponent(
          row.imageKey,
        )}`}
        alt=""
        fill
        unoptimized
        sizes="40px"
        className="object-cover"
      />
    </div>
  );
}

function RowActions({
  productId,
  remaining,
}: {
  productId: string;
  remaining: number;
}) {
  const buttonRef =
    useRef<HTMLButtonElement | null>(
      null,
    );

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    position,
    setPosition,
  ] = useState({
    top: 0,
    right: 0,
  });

  function toggleMenu() {
    const button =
      buttonRef.current;

    if (!button) {
      return;
    }

    const rect =
      button.getBoundingClientRect();

    setPosition({
      top:
        rect.bottom + 6,

      right:
        Math.max(
          12,
          window.innerWidth -
            rect.right,
        ),
    });

    setOpen(
      (current) =>
        !current,
    );
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function close() {
      setOpen(false);
    }

    function onKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        'Escape'
      ) {
        close();
      }
    }

    window.addEventListener(
      'resize',
      close,
    );

    window.addEventListener(
      'scroll',
      close,
      true,
    );

    window.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        'resize',
        close,
      );

      window.removeEventListener(
        'scroll',
        close,
        true,
      );

      window.removeEventListener(
        'keydown',
        onKeyDown,
      );
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Stock actions"
        aria-expanded={open}
        onClick={(
          event,
        ) => {
          event.stopPropagation();
          toggleMenu();
        }}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open &&
      typeof document !==
        'undefined'
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close stock actions"
                onClick={(
                  event,
                ) => {
                  event.stopPropagation();
                  setOpen(false);
                }}
                className="fixed inset-0 z-[90] cursor-default bg-transparent"
              />

              <div
                style={{
                  top:
                    position.top,
                  right:
                    position.right,
                }}
                className="fixed z-[100] w-44 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-2xl"
              >
                <Link
                  href={`/stock/receive?product=${productId}`}
                  prefetch
                  onClick={(
                    event,
                  ) => {
                    event.stopPropagation();
                    setOpen(false);
                  }}
                  className="block rounded-md px-3 py-2.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface)]"
                >
                  Receive stock
                </Link>

                {remaining > 0 ? (
                  <Link
                    href={`/stock/damage?product=${productId}`}
                    prefetch
                    onClick={() =>
                      setOpen(false)
                    }
                    className="block rounded-md px-3 py-2.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface)]"
                  >
                    Record damage
                  </Link>
                ) : null}

                <Link
                  href={`/stock/history/${productId}`}
                  prefetch
                  onClick={(
                    event,
                  ) => {
                    event.stopPropagation();
                    setOpen(false);
                  }}
                  className="block rounded-md px-3 py-2.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface)]"
                >
                  Stock history
                </Link>

                <Link
                  href={`/products/${productId}`}
                  prefetch
                  onClick={(
                    event,
                  ) => {
                    event.stopPropagation();
                    setOpen(false);
                  }}
                  className="block rounded-md px-3 py-2.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface)]"
                >
                  View product
                </Link>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

export function StockTable({
  rows,
}: StockTableProps) {
  const router =
    useRouter();

  const [
    orderedIds,
    setOrderedIds,
  ] = useState(
    rows.map(
      (row) => row.id,
    ),
  );

  const [
    draggingId,
    setDraggingId,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const currentIds =
      rows.map(
        (row) => row.id,
      );

    /*
     * Restore the saved order after hydration.
     * Using requestAnimationFrame avoids a
     * synchronous state update inside the effect.
     */
    const frame =
      window.requestAnimationFrame(
        () => {
          try {
            const raw =
              window.localStorage.getItem(
                ORDER_KEY,
              );

            if (!raw) {
              setOrderedIds(
                currentIds,
              );

              return;
            }

            const parsed =
              JSON.parse(raw);

            if (
              !Array.isArray(
                parsed,
              )
            ) {
              setOrderedIds(
                currentIds,
              );

              return;
            }

            const stored =
              parsed.filter(
                (
                  value,
                ): value is string =>
                  typeof value ===
                    'string' &&
                  currentIds.includes(
                    value,
                  ),
              );

            const missing =
              currentIds.filter(
                (id) =>
                  !stored.includes(
                    id,
                  ),
              );

            setOrderedIds([
              ...stored,
              ...missing,
            ]);
          } catch {
            setOrderedIds(
              currentIds,
            );
          }
        },
      );

    return () => {
      window.cancelAnimationFrame(
        frame,
      );
    };
  }, [rows]);

  const orderedRows =
    orderedIds
      .map((id) =>
        rows.find(
          (row) =>
            row.id === id,
        ),
      )
      .filter(
        (
          row,
        ): row is StockTableRow =>
          Boolean(row),
      );

  function moveBefore(
    targetId: string,
  ) {
    if (
      !draggingId ||
      draggingId === targetId
    ) {
      return;
    }

    setOrderedIds(
      (current) => {
        const next =
          current.filter(
            (id) =>
              id !==
              draggingId,
          );

        const targetIndex =
          next.indexOf(
            targetId,
          );

        if (
          targetIndex < 0
        ) {
          next.push(
            draggingId,
          );
        } else {
          next.splice(
            targetIndex,
            0,
            draggingId,
          );
        }

        window.localStorage.setItem(
          ORDER_KEY,
          JSON.stringify(next),
        );

        return next;
      },
    );

    setDraggingId(
      null,
    );
  }

  if (
    orderedRows.length === 0
  ) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 sm:px-6">
        <h2 className="text-base font-black text-[var(--text)]">
          No stock found
        </h2>

        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          Try another search or
          stock filter.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="hidden rounded-xl border border-[var(--border)] bg-[var(--card)] xl:block">
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full border-collapse text-left text-xs [&_th]:border-b [&_th]:border-r [&_th]:border-[var(--border)] [&_td]:border-b [&_td]:border-r [&_td]:border-[var(--border)] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
            <thead className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)] text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              <tr>
                <th className="w-10 px-2 py-3" />

                <th className="min-w-[210px] px-3 py-3">
                  Item
                </th>

                <th className="whitespace-nowrap px-3 py-3">
                  Unit price
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Imported
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Sold
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Remaining
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Imported value
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Sales value
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Remaining value
                </th>

                <th className="whitespace-nowrap px-3 py-3 text-right">
                  Damaged
                </th>

                <th className="w-14 px-3 py-3 text-center">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border)]">
              {orderedRows.map(
                (row) => (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    onClick={() =>
                      router.push(
                        `/stock/history/${row.id}`,
                      )
                    }
                    onKeyDown={(
                      event,
                    ) => {
                      if (
                        event.key ===
                          'Enter' ||
                        event.key ===
                          ' '
                      ) {
                        event.preventDefault();

                        router.push(
                          `/stock/history/${row.id}`,
                        );
                      }
                    }}
                    onDragOver={(
                      event,
                    ) => {
                      event.preventDefault();
                    }}
                    onDrop={() =>
                      moveBefore(
                        row.id,
                      )
                    }
                    className={
                      draggingId ===
                      row.id
                        ? 'cursor-pointer bg-[var(--surface)] opacity-60'
                        : 'cursor-pointer transition hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]'
                    }
                  >
                    <td className="px-2 py-3 align-middle">
                      <button
                        type="button"
                        draggable
                        aria-label={`Move ${row.name}`}
                        onClick={(
                          event,
                        ) =>
                          event.stopPropagation()
                        }
                        onKeyDown={(
                          event,
                        ) =>
                          event.stopPropagation()
                        }
                        onDragStart={() =>
                          setDraggingId(
                            row.id,
                          )
                        }
                        onDragEnd={() =>
                          setDraggingId(
                            null,
                          )
                        }
                        className="flex h-8 w-8 cursor-grab items-center justify-center text-[var(--muted)] active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    </td>

                    <td className="px-3 py-3 align-middle">
                      <Link
                        href={`/stock/history/${row.id}`}
                        prefetch
                        className="flex min-w-0 items-center gap-3 rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      >
                        <ProductPhoto
                          row={
                            row
                          }
                        />

                        <div className="min-w-0">
                          <span className="block truncate text-sm font-black text-[var(--text)] transition hover:text-[var(--primary)]">
                            {
                              row.name
                            }
                          </span>

                          <span className="mt-0.5 block truncate text-[11px] font-bold text-[var(--muted)]">
                            {
                              row.category
                            }
                            {' / '}
                            {
                              row.unit
                            }
                          </span>
                        </div>
                      </Link>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 font-black tabular-nums text-[var(--text)]">
                      {money(
                        row.unitPrice,
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      {
                        row.imported
                      }
                    </td>

                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      {
                        row.sold
                      }
                    </td>

                    <td
                      className={`px-3 py-3 text-right font-black tabular-nums ${remainingClass(
                        row,
                      )}`}
                    >
                      {
                        row.remaining
                      }
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      {money(
                        row.importedValue,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      {money(
                        row.salesValue,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      {money(
                        row.remainingValue,
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      {
                        row.damaged
                      }
                    </td>

                    <td
                      className="px-3 py-3"
                      onClick={(
                        event,
                      ) =>
                        event.stopPropagation()
                      }
                      onKeyDown={(
                        event,
                      ) =>
                        event.stopPropagation()
                      }
                    >
                      <div className="flex justify-center">
                        <RowActions
                          productId={
                            row.id
                          }
                          remaining={
                            row.remaining
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2.5 xl:hidden">
        {orderedRows.map(
          (row) => (
            <article
              key={row.id}
              role="link"
              tabIndex={0}
              onClick={() =>
                router.push(
                  `/stock/history/${row.id}`,
                )
              }
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                    'Enter' ||
                  event.key ===
                    ' '
                ) {
                  event.preventDefault();

                  router.push(
                    `/stock/history/${row.id}`,
                  );
                }
              }}
              onDragOver={(
                event,
              ) => {
                event.preventDefault();
              }}
              onDrop={() =>
                moveBefore(
                  row.id,
                )
              }
              className="cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  draggable
                  aria-label={`Move ${row.name}`}
                  onClick={(
                    event,
                  ) =>
                    event.stopPropagation()
                  }
                  onKeyDown={(
                    event,
                  ) =>
                    event.stopPropagation()
                  }
                  onDragStart={() =>
                    setDraggingId(
                      row.id,
                    )
                  }
                  onDragEnd={() =>
                    setDraggingId(
                      null,
                    )
                  }
                  className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-[var(--muted)] active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>

                <Link
                  href={`/stock/history/${row.id}`}
                  prefetch
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  <ProductPhoto
                    row={row}
                  />

                  <div className="min-w-0">
                    <span className="block truncate text-sm font-black text-[var(--text)]">
                      {row.name}
                    </span>

                    <span className="mt-0.5 block truncate text-xs font-bold text-[var(--muted)]">
                      {row.category}
                      {' / '}
                      {row.unit}
                    </span>
                  </div>
                </Link>

                <RowActions
                  productId={
                    row.id
                  }
                          remaining={
                            row.remaining
                          }
                />
              </div>

              <div className="grid grid-cols-2 border-t border-[var(--border)] sm:grid-cols-4">
                <div className="border-b border-r border-[var(--border)] px-4 py-3 sm:border-b-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                    Unit price
                  </p>

                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                    {money(
                      row.unitPrice,
                    )}
                  </p>
                </div>

                <div className="border-b border-[var(--border)] px-4 py-3 sm:border-b-0 sm:border-r">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                    Remaining
                  </p>

                  <p
                    className={`mt-1 text-sm font-black tabular-nums ${remainingClass(
                      row,
                    )}`}
                  >
                    {quantity(
                      row.remaining,
                      row.unit,
                    )}
                  </p>
                </div>

                <div className="border-r border-[var(--border)] px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                    Imported
                  </p>

                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                    {
                      row.imported
                    }
                  </p>
                </div>

                <div className="px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                    Sold
                  </p>

                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                    {
                      row.sold
                    }
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-[var(--border)]">
                <div className="border-r border-[var(--border)] px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                    Remaining value
                  </p>

                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                    {money(
                      row.remainingValue,
                    )}
                  </p>
                </div>

                <div className="px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                    Damaged
                  </p>

                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                    {
                      row.damaged
                    }
                  </p>
                </div>
              </div>
            </article>
          ),
        )}
      </section>
    </>
  );
}
