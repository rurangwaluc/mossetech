import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';

import {
  and,
  desc,
  eq,
  inArray,
  or,
} from 'drizzle-orm';

import {
  Plus,
} from 'lucide-react';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  saleItems,
  sales,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';


type PendingSaleRequest = {
  targetType: string;

  beforeValues:
    Record<
      string,
      unknown
    >;

  afterValues:
    Record<
      string,
      unknown
    >;

  reason: string;
};


function money(
  value:
    | string
    | number,
) {
  return new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits:
        0,
    },
  ).format(
    Number(value || 0),
  );
}


function paymentName(
  value: string,
) {
  const names:
    Record<
      string,
      string
    > = {
      CASH:
        'Cash',

      MOBILE_MONEY:
        'Mobile money',

      BANK:
        'Bank',

      CARD:
        'Card',
    };

  return (
    names[value] ||
    value
  );
}


function pendingSaleHint(
  request:
    | PendingSaleRequest
    | undefined,
) {
  if (!request) {
    return null;
  }

  if (
    request.targetType !==
    'SALE_PAYMENT'
  ) {
    return {
      label:
        'Sale fix requested',

      detail:
        request.reason,
    };
  }

  const before =
    request.beforeValues;

  const after =
    request.afterValues;

  const details:
    string[] = [];

  if (
    String(
      before.paymentMethod ||
        '',
    ) !==
    String(
      after.paymentMethod ||
        '',
    )
  ) {
    details.push(
      `${paymentName(
        String(
          before.paymentMethod ||
            '',
        ),
      )} → ${paymentName(
        String(
          after.paymentMethod ||
            '',
        ),
      )}`,
    );
  }

  if (
    Number(
      before.receivedAmount ||
        0,
    ) !==
    Number(
      after.receivedAmount ||
        0,
    )
  ) {
    details.push(
      `Received ${money(
        Number(
          before.receivedAmount ||
            0,
        ),
      )} → ${money(
        Number(
          after.receivedAmount ||
            0,
        ),
      )}`,
    );
  }

  if (
    Number(
      before.returnedAmount ||
        0,
    ) !==
    Number(
      after.returnedAmount ||
        0,
    )
  ) {
    details.push(
      `Returned ${money(
        Number(
          before.returnedAmount ||
            0,
        ),
      )} → ${money(
        Number(
          after.returnedAmount ||
            0,
        ),
      )}`,
    );
  }

  if (
    Number(
      before.extraKeptAmount ||
        0,
    ) !==
    Number(
      after.extraKeptAmount ||
        0,
    )
  ) {
    details.push(
      `Extra kept ${money(
        Number(
          before.extraKeptAmount ||
            0,
        ),
      )} → ${money(
        Number(
          after.extraKeptAmount ||
            0,
        ),
      )}`,
    );
  }

  return {
    label:
      'Payment fix requested',

    detail:
      details.join(
        ' / ',
      ) ||
      request.reason,
  };
}


function dateTime(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        'Africa/Kigali',

      month:
        'short',

      day:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  ).format(value);
}


function kigaliDayKey(
  value: Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'Africa/Kigali',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      },
    ).formatToParts(
      value,
    );

  const get = (
    type: string,
  ) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value || '';

  return `${get(
    'year',
  )}-${get(
    'month',
  )}-${get(
    'day',
  )}`;
}


function saleStatus(
  paid: number,
  balance: number,
) {
  if (
    balance <= 0
  ) {
    return 'Paid';
  }

  if (
    paid > 0
  ) {
    return 'Part paid';
  }

  return 'Unpaid';
}


function statusClass(
  paid: number,
  balance: number,
) {
  if (
    balance <= 0
  ) {
    return 'text-[#5F8A63] dark:text-[#79C27D]';
  }

  if (
    paid > 0
  ) {
    return 'text-[#C88C18] dark:text-[#E8B449]';
  }

  return 'text-[#D36A5D] dark:text-[#E88A7D]';
}


export default async function SalesPage() {
  const user =
    await requirePermission('sales.view');

  const isOwner =
    user.role ===
    'OWNER';

  const saleList =
    await db
      .select()
      .from(sales)
      .orderBy(
        desc(
          sales.saleDate,
        ),
      );

  const saleIds =
    saleList.map(
      (sale) =>
        sale.id,
    );

  const [
    itemList,
    pendingRequests,
  ] =
    await Promise.all([
      saleIds.length > 0
        ? db
            .select({
              saleId:
                saleItems.saleId,

              itemName:
                saleItems.itemName,

              quantity:
                saleItems.quantity,
            })
            .from(
              saleItems,
            )
            .where(
              inArray(
                saleItems.saleId,
                saleIds,
              ),
            )
        : Promise.resolve(
            [],
          ),

      saleIds.length > 0
        ? db
            .select({
              targetId:
                corrections.targetId,

              targetType:
                corrections.targetType,

              beforeValues:
                corrections.beforeValues,

              afterValues:
                corrections.afterValues,

              reason:
                corrections.reason,
            })
            .from(
              corrections,
            )
            .where(
              and(
                eq(
                  corrections.status,
                  'PENDING',
                ),

                inArray(
                  corrections.targetId,
                  saleIds,
                ),

                or(
                  eq(
                    corrections.targetType,
                    'SALE',
                  ),

                  eq(
                    corrections.targetType,
                    'SALE_PAYMENT',
                  ),
                ),
              ),
            )
        : Promise.resolve(
            [],
          ),
    ]);

  const pendingRequestBySaleId =
    new Map(
      pendingRequests.map(
        (request) => [
          request.targetId,
          request,
        ],
      ),
    );

  const itemsBySaleId =
    new Map<
      string,
      typeof itemList
    >();

  for (
    const item of
    itemList
  ) {
    const current =
      itemsBySaleId.get(
        item.saleId,
      ) || [];

    current.push(
      item,
    );

    itemsBySaleId.set(
      item.saleId,
      current,
    );
  }

  const todayKey =
    kigaliDayKey(
      new Date(),
    );

  const todaySales =
    saleList.filter(
      (sale) =>
        kigaliDayKey(
          sale.saleDate,
        ) ===
        todayKey,
    );

  const totalToday =
    todaySales.reduce(
      (
        sum,
        sale,
      ) =>
        sum +
        Number(
          sale.totalAmount,
        ),
      0,
    );

  const unpaidToday =
    todaySales.reduce(
      (
        sum,
        sale,
      ) =>
        sum +
        Number(
          sale.balanceAmount,
        ),
      0,
    );

  return (
    <section className="space-y-4">

      {/* TODAY */}
      {isOwner ? (
        <section className="grid overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3 sm:gap-px">
          <div className="bg-[var(--card)] px-5 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Sales today
            </p>

            <p className="mt-1 text-xl font-black tabular-nums text-[var(--text)]">
              {
                todaySales.length
              }
            </p>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-4 sm:border-0 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Sales value today
            </p>

            <p className="mt-1 text-xl font-black tabular-nums text-[var(--text)]">
              {money(
                totalToday,
              )}
            </p>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-4 sm:border-0 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Unpaid today
            </p>

            <p
              className={
                unpaidToday > 0
                  ? 'mt-1 text-xl font-black tabular-nums text-[#C88C18] dark:text-[#E8B449]'
                  : 'mt-1 text-xl font-black tabular-nums text-[#5F8A63] dark:text-[#79C27D]'
              }
            >
              {money(
                unpaidToday,
              )}
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
            Sales today
          </p>

          <p className="mt-1 text-xl font-black text-[var(--text)]">
            {
              todaySales.length
            }{' '}
            {todaySales.length ===
            1
              ? 'sale'
              : 'sales'}
          </p>
        </section>
      )}

      {/* LIST */}
      {saleList.length ===
      0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center">
          <h2 className="font-display text-xl font-black text-[var(--text)]">
            No sales yet
          </h2>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            Record the first
            sale when a customer
            buys something.
          </p>

          <Link
            href="/sales/new"
            prefetch
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
          >
            <Plus className="h-4 w-4" />
            New sale
          </Link>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <header className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-display text-xl font-black text-[var(--text)]">
                Sales history
              </h2>

              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {
                  saleList.length
                }{' '}
                {saleList.length ===
                1
                  ? 'sale'
                  : 'sales'}
              </p>
            </div>

            <Link
              href="/sales/new"
              prefetch
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
            >
              <Plus className="h-4 w-4" />
              New sale
            </Link>
          </header>

          {/* DESKTOP TABLE */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface)]">
                  <th className="w-[145px] border-b border-r border-[var(--border)] px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Date
                  </th>

                  <th className="w-[180px] border-b border-r border-[var(--border)] px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Customer
                  </th>

                  <th className="border-b border-r border-[var(--border)] px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Items
                  </th>

                  <th className="w-[120px] border-b border-r border-[var(--border)] px-4 py-3 text-right text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Total
                  </th>

                  <th className="w-[120px] border-b border-r border-[var(--border)] px-4 py-3 text-right text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Paid
                  </th>

                  <th className="w-[120px] border-b border-r border-[var(--border)] px-4 py-3 text-right text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Balance
                  </th>

                  <th className="w-[105px] border-b border-r border-[var(--border)] px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Status
                  </th>

                  <th className="w-[86px] border-b border-[var(--border)] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {saleList.map(
                  (sale) => {
                    const items =
                      itemsBySaleId.get(
                        sale.id,
                      ) || [];

                    const names =
                      items
                        .map(
                          (item) =>
                            `${item.itemName} ×${item.quantity}`,
                        )
                        .join(
                          ', ',
                        );

                    const total =
                      Number(
                        sale.totalAmount,
                      );

                    const paid =
                      Number(
                        sale.paidAmount,
                      );

                    const balance =
                      Number(
                        sale.balanceAmount,
                      );

                    const hint =
                      pendingSaleHint(
                        pendingRequestBySaleId.get(
                          sale.id,
                        ),
                      );

                    const href =
                      `/sales/${sale.id}`;

                    return (
                      <tr
                        key={
                          sale.id
                        }
                        className="group transition hover:bg-[var(--surface)]"
                      >
                        <td className="border-b border-r border-[var(--border)] p-0 align-top">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className="block px-4 py-4"
                          >
                            <span className="text-sm font-black tabular-nums text-[var(--text)]">
                              {dateTime(
                                sale.saleDate,
                              )}
                            </span>
                          </Link>
                        </td>

                        <td className="border-b border-r border-[var(--border)] p-0 align-top">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className="block px-4 py-4"
                          >
                            <span className="block truncate text-sm font-black text-[var(--text)]">
                              {sale.customerName ||
                                'Walk-in customer'}
                            </span>

                            {sale.customerPhone ? (
                              <span className="mt-1 block truncate text-xs font-semibold text-[var(--muted)]">
                                {
                                  sale.customerPhone
                                }
                              </span>
                            ) : null}
                          </Link>
                        </td>

                        <td className="border-b border-r border-[var(--border)] p-0 align-top">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className="block min-w-0 px-4 py-4"
                          >
                            <span className="block truncate text-sm font-bold text-[var(--text)]">
                              {names ||
                                'Sale'}
                            </span>

                            {hint ? (
                              <span className="mt-1.5 block">
                                <span className="block text-[11px] font-black text-[var(--primary)]">
                                  {
                                    hint.label
                                  }
                                </span>

                                <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted)]">
                                  {
                                    hint.detail
                                  }
                                </span>
                              </span>
                            ) : null}
                          </Link>
                        </td>

                        <td className="border-b border-r border-[var(--border)] p-0 align-top text-right">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className="block px-4 py-4 text-sm font-black tabular-nums text-[var(--text)]"
                          >
                            {money(
                              total,
                            )}
                          </Link>
                        </td>

                        <td className="border-b border-r border-[var(--border)] p-0 align-top text-right">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className="block px-4 py-4 text-sm font-black tabular-nums text-[var(--text)]"
                          >
                            {money(
                              paid,
                            )}
                          </Link>
                        </td>

                        <td className="border-b border-r border-[var(--border)] p-0 align-top text-right">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className={
                              balance > 0
                                ? 'block px-4 py-4 text-sm font-black tabular-nums text-[#C88C18] dark:text-[#E8B449]'
                                : 'block px-4 py-4 text-sm font-black tabular-nums text-[var(--muted)]'
                            }
                          >
                            {money(
                              balance,
                            )}
                          </Link>
                        </td>

                        <td className="border-b border-r border-[var(--border)] p-0 align-top">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className={`block px-4 py-4 text-sm font-black ${statusClass(
                              paid,
                              balance,
                            )}`}
                          >
                            {saleStatus(
                              paid,
                              balance,
                            )}
                          </Link>
                        </td>

                        <td className="border-b border-[var(--border)] px-3 py-3 text-center align-top">
                          <Link
                            href={
                              href
                            }
                            prefetch
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET */}
          <div className="divide-y divide-[var(--border)] xl:hidden">
            {saleList.map(
              (sale) => {
                const items =
                  itemsBySaleId.get(
                    sale.id,
                  ) || [];

                const names =
                  items
                    .map(
                      (item) =>
                        `${item.itemName} ×${item.quantity}`,
                    )
                    .join(
                      ', ',
                    );

                const total =
                  Number(
                    sale.totalAmount,
                  );

                const paid =
                  Number(
                    sale.paidAmount,
                  );

                const balance =
                  Number(
                    sale.balanceAmount,
                  );

                const hint =
                  pendingSaleHint(
                    pendingRequestBySaleId.get(
                      sale.id,
                    ),
                  );

                return (
                  <Link
                    key={
                      sale.id
                    }
                    href={`/sales/${sale.id}`}
                    prefetch
                    className="block p-4 transition hover:bg-[var(--surface)] sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--text)]">
                          {sale.customerName ||
                            'Walk-in customer'}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                          {dateTime(
                            sale.saleDate,
                          )}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black tabular-nums text-[var(--text)]">
                          {money(
                            total,
                          )}
                        </p>

                        <p
                          className={`mt-1 text-xs font-black ${statusClass(
                            paid,
                            balance,
                          )}`}
                        >
                          {saleStatus(
                            paid,
                            balance,
                          )}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 truncate text-xs font-semibold text-[var(--muted)]">
                      {names ||
                        'Sale'}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-x-5 border-t border-[var(--border)] pt-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                          Paid
                        </p>

                        <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                          {money(
                            paid,
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                          Balance
                        </p>

                        <p
                          className={
                            balance > 0
                              ? 'mt-1 text-sm font-black tabular-nums text-[#C88C18] dark:text-[#E8B449]'
                              : 'mt-1 text-sm font-black tabular-nums text-[var(--muted)]'
                          }
                        >
                          {money(
                            balance,
                          )}
                        </p>
                      </div>
                    </div>

                    {hint ? (
                      <div className="mt-3 border-l-2 border-[var(--primary)] pl-2">
                        <p className="text-[11px] font-black text-[var(--primary)]">
                          {
                            hint.label
                          }
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                          {
                            hint.detail
                          }
                        </p>
                      </div>
                    ) : null}
                  </Link>
                );
              },
            )}
          </div>
        </section>
      )}
    </section>
  );
}
