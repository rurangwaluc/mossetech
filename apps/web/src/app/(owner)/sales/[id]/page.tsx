import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';
import {
  and,
  asc,
  eq,
  inArray,
} from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import { db } from '@mossetech/db/client';
import {
  corrections,
  salePayments,
  saleItems,
  sales,
  users,
} from '@mossetech/db/schema';

type SaleDetailPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams?: Promise<{
    fixed?: string;
    request?: string;
    paymentFixed?: string;
    paymentRequest?: string;
  }>;
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
    Number(
      value || 0,
    ),
  );
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

function paymentFixChanges(
  before:
    Record<string, unknown>,
  after:
    Record<string, unknown>,
) {
  const rows:
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
    rows.push(
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
    rows.push(
      `Amount received ${money(
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
    rows.push(
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
    rows.push(
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

  return rows;
}


export default async function SaleDetailPage({
  params,
  searchParams,
}: SaleDetailPageProps) {
  const user =
    await requirePermission('sales.view');

  const { id } =
    await params;

  const query =
    await searchParams;

  const [sale] = await db
    .select()
    .from(sales)
    .where(
      eq(
        sales.id,
        id,
      ),
    )
    .limit(1);

  if (!sale) {
    notFound();
  }

  const [pendingSaleRequest] =
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
            'SALE',
          ),
          eq(
            corrections.targetId,
            sale.id,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  const pendingPaymentRequests =
    await db
      .select({
        id:
          corrections.id,
        reason:
          corrections.reason,
        beforeValues:
          corrections.beforeValues,
        afterValues:
          corrections.afterValues,
        requestedByName:
          users.name,
      })
      .from(corrections)
      .innerJoin(
        users,
        eq(
          corrections.requestedByUserId,
          users.id,
        ),
      )
      .where(
        and(
          eq(
            corrections.targetType,
            'SALE_PAYMENT',
          ),
          eq(
            corrections.targetId,
            sale.id,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      );

  const [
    items,
    laterPayments,
  ] = await Promise.all([
    db
      .select()
      .from(saleItems)
      .where(
        eq(
          saleItems.saleId,
          sale.id,
        ),
      ),

    db
      .select({
        id:
          salePayments.id,
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
      .innerJoin(
        users,
        eq(
          salePayments.receivedByUserId,
          users.id,
        ),
      )
      .where(
        and(
          eq(
            salePayments.saleId,
            sale.id,
          ),
          eq(
            salePayments.paymentType,
            'LATER_PAYMENT',
          ),
          eq(
            salePayments.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(
          salePayments.paidAt,
        ),
      ),
  ]);

  const isOwner =
    user.role === 'OWNER';

  const priceChangeUserIds = [
    ...new Set(
      items
        .map(
          (item) =>
            item.priceAdjustedByUserId,
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(
              value,
            ),
        ),
    ),
  ];

  const priceChangeUsers =
    isOwner &&
    priceChangeUserIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
          })
          .from(users)
          .where(
            inArray(
              users.id,
              priceChangeUserIds,
            ),
          )
      : [];

  const priceChangeUserNameById =
    new Map(
      priceChangeUsers.map(
        (changedBy) => [
          changedBy.id,
          changedBy.name,
        ],
      ),
    );

  const discountAmount =
    Number(
      sale.discountAmount,
    );

  const hasDiscount =
    discountAmount > 0;

  const [discountGiver] =
    isOwner &&
    hasDiscount &&
    sale.discountGivenByUserId
      ? await db
          .select({
            name: users.name,
          })
          .from(users)
          .where(
            eq(
              users.id,
              sale.discountGivenByUserId,
            ),
          )
          .limit(1)
      : [];

  const laterPaymentsTotal =
    laterPayments.reduce(
      (sum, payment) =>
        sum +
        Number(
          payment.amount,
        ),
      0,
    );

  const paidAtSale =
    Math.max(
      0,
      Number(
        sale.paidAmount,
      ) -
        laterPaymentsTotal,
    );

  const unpaid =
    Number(
      sale.balanceAmount,
    );

  const isPaid =
    unpaid <= 0;

  const paidTotal =
    Number(
      sale.paidAmount,
    );

  const paymentStatus =
    isPaid
      ? 'Paid'
      : paidTotal > 0
        ? 'Part paid'
        : 'Unpaid';

  const changeReturned =
    Number(
      sale.changeReturned,
    );

  const extraKept =
    Number(
      sale.extraKept,
    );

  const amountReceived =
    Number(
      sale.amountReceived,
    );

  const showPaymentDetails =
    amountReceived > 0 &&
    (
      amountReceived !==
        paidAtSale ||
      changeReturned > 0 ||
      extraKept > 0
    );

  const pendingPaymentRequest =
    pendingPaymentRequests[0] ||
    null;

  const pendingPaymentType =
    pendingPaymentRequest
      ?.beforeValues
      .paymentType ===
    'LATER_PAYMENT'
      ? 'LATER_PAYMENT'
      : pendingPaymentRequest
          ?.beforeValues
          .paymentType ===
        'AT_SALE'
        ? 'AT_SALE'
        : null;

  const pendingAtSalePaymentRequest =
    pendingPaymentRequests.find(
      (request) =>
        request.beforeValues
          .paymentType ===
        'AT_SALE',
    ) || null;

  const pendingLaterPaymentIds =
    new Set(
      pendingPaymentRequests
        .filter(
          (request) =>
            request.beforeValues
              .paymentType ===
            'LATER_PAYMENT',
        )
        .map(
          (request) =>
            String(
              request.beforeValues
                .paymentId ||
              '',
            ),
        )
        .filter(Boolean),
    );

  const pendingPaymentChanges =
    pendingPaymentRequest
      ? paymentFixChanges(
          pendingPaymentRequest.beforeValues,
          pendingPaymentRequest.afterValues,
        )
      : [];

  return (
    <section className="space-y-4">
      {query?.fixed === '1' ? (
        <div className="rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
          Sale fixed.
        </div>
      ) : null}

      {query?.request === '1' ? (
        <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          Request sent to the owner.
        </div>
      ) : null}

      {query?.paymentFixed === '1' ? (
        <div className="rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
          Payment fixed.
        </div>
      ) : null}

      {query?.paymentRequest === '1' ? (
        <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          Payment fix request sent to the owner.
        </div>
      ) : null}

      {pendingPaymentRequest ? (
        <section className="rounded-xl border border-[var(--primary)] bg-[var(--card)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                {pendingPaymentType ===
                'LATER_PAYMENT'
                  ? 'Later payment fix requested'
                  : 'Payment fix requested'}
              </p>

              <p className="mt-2 text-sm font-black text-[var(--text)]">
                {pendingPaymentRequest.requestedByName} says
              </p>

              <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text)]">
                {pendingPaymentRequest.reason}
              </p>

              {pendingPaymentType ===
              'LATER_PAYMENT' ? (
                <p className="mt-2 text-xs font-black text-[var(--muted)]">
                  Later payment
                  {' / '}
                  {money(
                    Number(
                      pendingPaymentRequest
                        .beforeValues
                        .appliedAmount ||
                      0,
                    ),
                  )}
                  {' / '}
                  {dateTime(
                    new Date(
                      String(
                        pendingPaymentRequest
                          .beforeValues
                          .paidAt,
                      ),
                    ),
                  )}
                </p>
              ) : null}

              {pendingPaymentChanges.length > 0 ? (
                <div className="mt-3 space-y-1">
                  {pendingPaymentChanges.map(
                    (change) => (
                      <p
                        key={change}
                        className="text-sm font-black text-[var(--primary)]"
                      >
                        {change}
                      </p>
                    ),
                  )}
                </div>
              ) : null}
            </div>

            {isOwner ? (
              <Link
                href="/requests"
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
              >
                Review request
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <header className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Customer
            </p>

            <h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
              {sale.customerName ||
                'Walk-in customer'}
            </h2>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {dateTime(
                sale.saleDate,
              )}
              {sale.customerPhone
                ? ` / ${sale.customerPhone}`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {pendingSaleRequest ? (
              isOwner ? (
                <Link
                  href="/requests"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
                >
                  Review request
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center justify-center border-l-2 border-[var(--primary)] pl-3 text-sm font-black text-[var(--primary)]">
                  Request sent
                </span>
              )
            ) : (
              <Link
                href={`/sales/${sale.id}/fix`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
              >
                {isOwner
                  ? 'Fix mistake'
                  : 'Ask owner to fix'}
              </Link>
            )}

            <Link
              href="/sales"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </div>

        <div className="grid border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-4 sm:gap-px">
          <div className="bg-[var(--card)] px-5 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Total
            </p>

            <p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">
              {money(
                sale.totalAmount,
              )}
            </p>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-4 sm:border-0 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Paid
            </p>

            <p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">
              {money(
                paidTotal,
              )}
            </p>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-4 sm:border-0 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Balance
            </p>

            <p
              className={
                unpaid > 0
                  ? 'mt-1 text-lg font-black tabular-nums text-[#C88C18] dark:text-[#E8B449]'
                  : 'mt-1 text-lg font-black tabular-nums text-[var(--muted)]'
              }
            >
              {money(
                unpaid,
              )}
            </p>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-4 sm:border-0 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Status
            </p>

            <p
              className={
                paymentStatus ===
                'Paid'
                  ? 'mt-1 text-lg font-black text-[#5F8A63] dark:text-[#79C27D]'
                  : paymentStatus ===
                      'Part paid'
                    ? 'mt-1 text-lg font-black text-[#C88C18] dark:text-[#E8B449]'
                    : 'mt-1 text-lg font-black text-[#D36A5D] dark:text-[#E88A7D]'
              }
            >
              {
                paymentStatus
              }
            </p>
          </div>
        </div>

        {hasDiscount ? (
          <div className="border-t border-[var(--border)] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <p>
                  <span className="font-bold text-[var(--muted)]">
                    Subtotal
                  </span>{' '}
                  <strong className="font-black text-[var(--text)]">
                    {money(
                      sale.subtotalAmount,
                    )}
                  </strong>
                </p>

                <p>
                  <span className="font-bold text-[var(--muted)]">
                    Discount
                  </span>{' '}
                  <strong className="font-black text-[var(--primary)]">
                    -{money(
                      discountAmount,
                    )}
                  </strong>
                </p>
              </div>

              {sale.discountReason ? (
                <p className="max-w-2xl font-semibold text-[var(--text)] sm:text-right">
                  <span className="font-bold text-[var(--muted)]">
                    Reason
                  </span>{' '}
                  {sale.discountReason}

                  {isOwner &&
                  discountGiver ? (
                    <>
                      {' / '}
                      <span className="font-bold text-[var(--muted)]">
                        Given by
                      </span>{' '}
                      {
                        discountGiver.name
                      }
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Items
            </p>

            <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
              What was sold
            </h3>
          </div>

          <p className="text-xs font-bold text-[var(--muted)]">
            {items.length}{' '}
            {items.length === 1
              ? 'item'
              : 'items'}
          </p>
        </div>

        <div className="divide-y divide-[var(--border)] px-5">
          {items.map(
            (item) => {
              const normalPrice =
                Number(
                  item.baseUnitPrice,
                );

              const sellingPrice =
                Number(
                  item.unitPrice,
                );

              const priceWasRaised =
                sellingPrice >
                normalPrice;

              const changedByName =
                item.priceAdjustedByUserId
                  ? priceChangeUserNameById.get(
                      item.priceAdjustedByUserId,
                    )
                  : null;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-black text-[var(--text)]">
                      {
                        item.itemName
                      }{' '}
                      ×{
                        item.quantity
                      }
                    </p>

                    {priceWasRaised ? (
                      <>
                        <p className="mt-1 text-xs font-semibold text-[var(--text)]">
                          Selling price{' '}
                          {money(
                            item.unitPrice,
                          )}{' '}
                          each
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                          Normal{' '}
                          {money(
                            item.baseUnitPrice,
                          )}
                          {isOwner &&
                          changedByName ? (
                            <>
                              {' / '}
                              Changed by{' '}
                              {
                                changedByName
                              }
                            </>
                          ) : null}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        {money(
                          item.unitPrice,
                        )}{' '}
                        each
                      </p>
                    )}
                  </div>

                  <p className="shrink-0 text-sm font-black text-[var(--text)]">
                    {money(
                      item.lineTotal,
                    )}
                  </p>
                </div>
              );
            },
          )}
        </div>

      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Payments
          </p>

          {paidAtSale > 0 ? (
            pendingAtSalePaymentRequest ? (
              <span className="inline-flex h-9 items-center justify-center border-l-2 border-[var(--primary)] pl-3 text-xs font-black text-[var(--primary)]">
                Payment fix requested
              </span>
            ) : (
              <Link
                href={`/sales/${sale.id}/payment-fix`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
              >
                {isOwner
                  ? 'Fix payment mistake'
                  : 'Ask owner to fix payment'}
              </Link>
            )
          ) : null}
        </div>

        <div className="mt-3 divide-y divide-[var(--border)]">
          {paidAtSale > 0 ? (
            <div className="flex items-start justify-between gap-5 py-3">
              <div>
                <p className="text-sm font-black text-[var(--text)]">
                  Paid at sale
                </p>

                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  {paymentName(
                    sale.paymentMethod,
                  )}{' '}
                  /{' '}
                  {dateTime(
                    sale.saleDate,
                  )}
                </p>

                {showPaymentDetails ? (
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    {paymentName(
                      sale.paymentMethod,
                    )}{' '}
                    received{' '}
                    {money(
                      sale.amountReceived,
                    )}
                    {changeReturned >
                    0
                      ? ` / ${
                          sale.paymentMethod ===
                          'CASH'
                            ? 'Change'
                            : 'Refunded'
                        } ${money(
                          changeReturned,
                        )}`
                      : ''}
                    {extraKept > 0
                      ? ` / Extra kept ${money(
                          extraKept,
                        )}`
                      : ''}
                  </p>
                ) : null}

                {extraKept > 0 &&
                sale.extraReason ? (
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    {
                      sale.extraReason
                    }
                  </p>
                ) : null}
              </div>

              <p className="shrink-0 text-sm font-black text-[var(--text)]">
                {money(
                  paidAtSale,
                )}
              </p>
            </div>
          ) : null}

          {laterPayments.map(
            (payment) => (
              <div
                key={
                  payment.id
                }
                className="flex items-start justify-between gap-5 py-3"
              >
                <div>
                  <p className="text-sm font-black text-[var(--text)]">
                    Later payment
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    {paymentName(
                      payment.paymentMethod,
                    )}{' '}
                    /{' '}
                    {
                      payment.receivedByName
                    }{' '}
                    /{' '}
                    {dateTime(
                      payment.paidAt,
                    )}
                  </p>

                  {payment.notes ? (
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                      {
                        payment.notes
                      }
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-[var(--text)]">
                    {money(
                      payment.amount,
                    )}
                  </p>

                  {pendingLaterPaymentIds.has(
                    payment.id,
                  ) ? (
                    <span className="mt-2 inline-flex text-xs font-black text-[var(--primary)]">
                      Fix requested
                    </span>
                  ) : (
                    <Link
                      href={`/sales/${sale.id}/later-payment-fix/${payment.id}`}
                      className="mt-2 inline-flex text-xs font-black text-[var(--primary)] hover:underline"
                    >
                      {isOwner
                        ? 'Fix payment mistake'
                        : 'Ask owner to fix payment'}
                    </Link>
                  )}
                </div>
              </div>
            ),
          )}

          {paidAtSale <= 0 &&
          laterPayments.length ===
            0 ? (
            <p className="py-3 text-sm font-semibold text-[var(--muted)]">
              No payment received
              yet.
            </p>
          ) : null}
        </div>

        {!isPaid ? (
          <div className="mt-3 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--muted)]">
                Still unpaid
              </p>

              <p className="mt-1 text-lg font-black text-[#F2A71B]">
                {money(
                  unpaid,
                )}
              </p>
            </div>

            {sale.customerId ? (
              <Link
                href={`/debts/${sale.id}`}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
              >
                Collect payment
              </Link>
            ) : null}
          </div>
        ) : null}

        {sale.notes ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-bold text-[var(--muted)]">
              Note
            </p>

            <p className="mt-1 text-sm font-semibold text-[var(--text)]">
              {sale.notes}
            </p>
          </div>
        ) : null}
      </section>
    </section>
  );
}
