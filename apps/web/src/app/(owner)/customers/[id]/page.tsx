import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  and,
  desc,
  eq,
  inArray,
} from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';

import { db } from '@mossetech/db/client';
import {
  corrections,
  customers,
  saleItems,
  salePayments,
  sales,
  users,
} from '@mossetech/db/schema';

import { requireUser } from '@/lib/auth/session';

type CustomerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    take?: string;
    paymentTake?: string;
  }>;
};

const PAGE_SIZE = 10;

function money(
  value: string | number,
) {
  return `RWF ${Number(
    value,
  ).toLocaleString('en-US')}`;
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(value);
}

function paymentName(
  value: string,
) {
  const names: Record<
    string,
    string
  > = {
    CASH: 'Cash',
    MOBILE_MONEY:
      'Mobile money',
    BANK: 'Bank',
    CARD: 'Card',
  };

  return names[value] || value;
}

function paymentTypeName(
  value: string,
) {
  return value ===
    'LATER_PAYMENT'
    ? 'Later payment'
    : 'At sale';
}

function buildPurchaseMoreHref(
  customerId: string,
  nextTake: number,
  paymentTake: number,
) {
  const params =
    new URLSearchParams();

  params.set(
    'take',
    String(nextTake),
  );

  if (
    paymentTake >
    PAGE_SIZE
  ) {
    params.set(
      'paymentTake',
      String(paymentTake),
    );
  }

  return `/customers/${customerId}?${params.toString()}`;
}

function buildPaymentMoreHref(
  customerId: string,
  take: number,
  nextPaymentTake: number,
) {
  const params =
    new URLSearchParams();

  if (take > PAGE_SIZE) {
    params.set(
      'take',
      String(take),
    );
  }

  params.set(
    'paymentTake',
    String(
      nextPaymentTake,
    ),
  );

  return `/customers/${customerId}?${params.toString()}`;
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const user =
    await requireUser();

  const { id } =
    await params;

  const query =
    await searchParams;

  const take = Math.max(
    PAGE_SIZE,
    Number(
      query?.take ||
        PAGE_SIZE,
    ) || PAGE_SIZE,
  );

  const paymentTake =
    Math.max(
      PAGE_SIZE,
      Number(
        query?.paymentTake ||
          PAGE_SIZE,
      ) || PAGE_SIZE,
    );

  const [customer] = await db
    .select()
    .from(customers)
    .where(
      eq(
        customers.id,
        id,
      ),
    )
    .limit(1);

  if (
    !customer ||
    customer.status !==
      'ACTIVE'
  ) {
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
            'CUSTOMER',
          ),
          eq(
            corrections.targetId,
            customer.id,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  const saleList = await db
    .select()
    .from(sales)
    .where(
      eq(
        sales.customerId,
        customer.id,
      ),
    )
    .orderBy(
      desc(
        sales.saleDate,
      ),
    );

  const saleIds =
    saleList.map(
      (sale) => sale.id,
    );

  const visibleSales =
    saleList.slice(
      0,
      take,
    );

  const hasMoreSales =
    saleList.length >
    visibleSales.length;

  const visibleSaleIds =
    visibleSales.map(
      (sale) => sale.id,
    );

  const [
    itemList,
    paymentRows,
  ] = await Promise.all([
    visibleSaleIds.length > 0
      ? db
          .select()
          .from(saleItems)
          .where(
            inArray(
              saleItems.saleId,
              visibleSaleIds,
            ),
          )
      : Promise.resolve([]),

    saleIds.length > 0
      ? db
          .select({
            id:
              salePayments.id,
            saleId:
              salePayments.saleId,
            paymentType:
              salePayments.paymentType,
            paymentMethod:
              salePayments.paymentMethod,
            amount:
              salePayments.appliedAmount,
            notes:
              salePayments.notes,
            paidAt:
              salePayments.paidAt,
            receivedByName:
              users.name,
          })
          .from(salePayments)
          .leftJoin(
            users,
            eq(
              salePayments
                .receivedByUserId,
              users.id,
            ),
          )
          .where(
            and(
              inArray(
                salePayments.saleId,
                saleIds,
              ),
              eq(
                salePayments.isActive,
                true,
              ),
            ),
          )
          .orderBy(
            desc(
              salePayments.paidAt,
            ),
          )
          .limit(
            paymentTake + 1,
          )
      : Promise.resolve([]),
  ]);

  const visiblePayments =
    paymentRows.slice(
      0,
      paymentTake,
    );

  const hasMorePayments =
    paymentRows.length >
    paymentTake;

  const totalBought =
    saleList.reduce(
      (sum, sale) =>
        sum +
        Number(
          sale.totalAmount,
        ),
      0,
    );

  const unpaidBalance =
    saleList.reduce(
      (sum, sale) =>
        sum +
        Number(
          sale.balanceAmount,
        ),
      0,
    );

  /*
   * This is the amount currently applied
   * toward the customer's purchases.
   *
   * Keep the summary tied to current sale
   * balances so historical/replaced payment
   * rows can never affect the customer total.
   */
  const totalPaid =
    Math.max(
      0,
      totalBought -
        unpaidBalance,
    );

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Customer
            </p>

            <h2 className="mt-1 font-display text-3xl font-black tracking-tight text-[var(--text)]">
              {customer.name}
            </h2>

            {customer.phone ? (
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                {customer.phone}
              </p>
            ) : null}

            {customer.notes ? (
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--muted)]">
                {customer.notes}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-5 xl:items-end">
            <div className="grid grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  Total bought
                </p>

                <p className="mt-1 text-xl font-black text-[var(--text)]">
                  {money(
                    totalBought,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  Total paid
                </p>

                <p className="mt-1 text-xl font-black text-[var(--text)]">
                  {money(
                    totalPaid,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  {unpaidBalance >
                  0
                    ? 'Still owed'
                    : 'Status'}
                </p>

                {unpaidBalance >
                0 ? (
                  <p className="mt-1 text-xl font-black text-[#F2A71B]">
                    {money(
                      unpaidBalance,
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-xl font-black text-[#5F8A63] dark:text-[#79C27D]">
                    Clear
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {pendingRequest ? (
                user.role ===
                'OWNER' ? (
                  <Link
                    href="/requests"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--primary)] px-4 text-sm font-black text-[var(--primary)]"
                  >
                    Review request
                  </Link>
                ) : (
                  <span className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--primary)] px-4 text-sm font-black text-[var(--primary)]">
                    Fix requested
                  </span>
                )
              ) : (
                <Link
                  href={`/customers/${customer.id}/edit`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                >
                  {user.role ===
                  'OWNER'
                    ? 'Fix customer details'
                    : 'Ask owner to fix'}
                </Link>
              )}

              <Link
                href="/customers"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Purchases
            </p>

            <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
              What this customer bought
            </h3>
          </div>

          {saleList.length >
          0 ? (
            <p className="text-xs font-bold text-[var(--muted)]">
              {saleList.length}{' '}
              {saleList.length ===
              1
                ? 'sale'
                : 'sales'}
            </p>
          ) : null}
        </div>

        {visibleSales.length ===
        0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--muted)]">
              No purchases yet.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <div className="grid grid-cols-[1fr_1.7fr_0.8fr_0.65fr_auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                <div>Date</div>
                <div>Items</div>
                <div>Total</div>
                <div>Status</div>
                <div />
              </div>

              <div className="divide-y divide-[var(--border)]">
                {visibleSales.map(
                  (sale) => {
                    const items =
                      itemList.filter(
                        (item) =>
                          item.saleId ===
                          sale.id,
                      );

                    const names =
                      items
                        .map(
                          (item) =>
                            `${item.itemName} x${item.quantity}`,
                        )
                        .join(
                          ', ',
                        );

                    const paid =
                      Number(
                        sale.paidAmount,
                      );

                    const unpaid =
                      Number(
                        sale.balanceAmount,
                      ) > 0;

                    const paymentStatus =
                      unpaid
                        ? paid > 0
                          ? 'Part paid'
                          : 'Unpaid'
                        : 'Paid';

                    return (
                      <div
                        key={
                          sale.id
                        }
                        className="grid grid-cols-[1fr_1.7fr_0.8fr_0.65fr_auto] items-center gap-4 px-5 py-3"
                      >
                        <p className="text-sm font-bold text-[var(--text)]">
                          {dateTime(
                            sale.saleDate,
                          )}
                        </p>

                        <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
                          {names ||
                            'Sale'}
                        </p>

                        <p className="text-sm font-black text-[var(--text)]">
                          {money(
                            sale.totalAmount,
                          )}
                        </p>

                        <p
                          className={
                            unpaid
                              ? 'text-sm font-black text-[#F2A71B]'
                              : 'text-sm font-black text-[#5F8A63] dark:text-[#79C27D]'
                          }
                        >
                          {paymentStatus}
                        </p>

                        <div className="flex items-center gap-2">
                          {unpaid ? (
                            <Link
                              href={`/debts/${sale.id}`}
                              className="inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-3 text-xs font-black text-white transition hover:bg-[var(--primary-action-hover)]"
                            >
                              Collect payment
                            </Link>
                          ) : null}

                          <Link
                            href={`/sales/${sale.id}`}
                            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            <div className="divide-y divide-[var(--border)] lg:hidden">
              {visibleSales.map(
                (sale) => {
                  const items =
                    itemList.filter(
                      (item) =>
                        item.saleId ===
                        sale.id,
                    );

                  const names =
                    items
                      .map(
                        (item) =>
                          `${item.itemName} x${item.quantity}`,
                      )
                      .join(
                        ', ',
                      );

                  const paid =
                    Number(
                      sale.paidAmount,
                    );

                  const unpaid =
                    Number(
                      sale.balanceAmount,
                    ) > 0;

                  const paymentStatus =
                    unpaid
                      ? paid > 0
                        ? 'Part paid'
                        : 'Unpaid'
                      : 'Paid';

                  return (
                    <div
                      key={
                        sale.id
                      }
                      className="p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-black text-[var(--text)]">
                            {money(
                              sale.totalAmount,
                            )}
                          </p>

                          <p className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">
                            {names ||
                              'Sale'}
                          </p>

                          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                            {dateTime(
                              sale.saleDate,
                            )}
                          </p>
                        </div>

                        <p
                          className={
                            unpaid
                              ? 'shrink-0 text-xs font-black text-[#F2A71B]'
                              : 'shrink-0 text-xs font-black text-[#5F8A63] dark:text-[#79C27D]'
                          }
                        >
                          {paymentStatus}
                        </p>
                      </div>

                      <div className="mt-3 flex gap-2">
                        {unpaid ? (
                          <Link
                            href={`/debts/${sale.id}`}
                            className="inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-3 text-xs font-black text-white"
                          >
                            Collect payment
                          </Link>
                        ) : null}

                        <Link
                          href={`/sales/${sale.id}`}
                          className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)]"
                        >
                          Open sale
                        </Link>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </>
        )}

        {hasMoreSales ? (
          <div className="flex justify-center border-t border-[var(--border)] p-4">
            <Link
              href={buildPurchaseMoreHref(
                customer.id,
                take +
                  PAGE_SIZE,
                paymentTake,
              )}
              className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              Load more purchases
            </Link>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Payments
            </p>

            <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
              Money received
            </h3>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Payments recorded for this customer&apos;s purchases.
            </p>
          </div>
        </div>

        {visiblePayments.length ===
        0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--muted)]">
              No payments recorded yet.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <div className="grid grid-cols-[1fr_0.85fr_0.85fr_0.8fr_1fr_auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                <div>Date</div>
                <div>Payment</div>
                <div>Method</div>
                <div>Amount</div>
                <div>Received by</div>
                <div />
              </div>

              <div className="divide-y divide-[var(--border)]">
                {visiblePayments.map(
                  (payment) => (
                    <div
                      key={
                        payment.id
                      }
                      className="grid grid-cols-[1fr_0.85fr_0.85fr_0.8fr_1fr_auto] items-center gap-4 px-5 py-3"
                    >
                      <p className="text-sm font-bold text-[var(--text)]">
                        {dateTime(
                          payment.paidAt,
                        )}
                      </p>

                      <p className="text-sm font-semibold text-[var(--text)]">
                        {paymentTypeName(
                          payment.paymentType,
                        )}
                      </p>

                      <p className="text-sm font-semibold text-[var(--text)]">
                        {paymentName(
                          payment.paymentMethod,
                        )}
                      </p>

                      <p className="text-sm font-black text-[var(--text)]">
                        {money(
                          payment.amount,
                        )}
                      </p>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">
                          {payment
                            .receivedByName ||
                            'Not recorded'}
                        </p>

                        {payment.notes ? (
                          <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">
                            {
                              payment.notes
                            }
                          </p>
                        ) : null}
                      </div>

                      <Link
                        href={`/sales/${payment.saleId}`}
                        className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                      >
                        Open sale
                      </Link>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="divide-y divide-[var(--border)] lg:hidden">
              {visiblePayments.map(
                (payment) => (
                  <div
                    key={
                      payment.id
                    }
                    className="p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-black text-[var(--text)]">
                          {money(
                            payment.amount,
                          )}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                          {paymentTypeName(
                            payment.paymentType,
                          )}
                          {' / '}
                          {paymentName(
                            payment.paymentMethod,
                          )}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                          {dateTime(
                            payment.paidAt,
                          )}
                        </p>
                      </div>

                      <p className="max-w-[45%] truncate text-right text-xs font-black text-[var(--text)]">
                        {payment
                          .receivedByName ||
                          'Not recorded'}
                      </p>
                    </div>

                    {payment.notes ? (
                      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted)]">
                        {payment.notes}
                      </p>
                    ) : null}

                    <div className="mt-3">
                      <Link
                        href={`/sales/${payment.saleId}`}
                        className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)]"
                      >
                        Open sale
                      </Link>
                    </div>
                  </div>
                ),
              )}
            </div>
          </>
        )}

        {hasMorePayments ? (
          <div className="flex justify-center border-t border-[var(--border)] p-4">
            <Link
              href={buildPaymentMoreHref(
                customer.id,
                take,
                paymentTake +
                  PAGE_SIZE,
              )}
              className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              Load more payments
            </Link>
          </div>
        ) : null}
      </section>
    </section>
  );
}
