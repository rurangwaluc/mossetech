import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  and,
  desc,
  eq,
} from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@mossetech/db/client';
import {
  cashDrawers,
  saleItems,
  salePayments,
  sales,
  users,
} from '@mossetech/db/schema';
import { requireUser } from '@/lib/auth/session';
import { DebtPaymentForm } from './debt-payment-form';

type DebtDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    take?: string;
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

function buildLoadMoreHref(
  saleId: string,
  nextTake: number,
) {
  return `/debts/${saleId}?take=${nextTake}`;
}

export default async function DebtDetailPage({
  params,
  searchParams,
}: DebtDetailPageProps) {
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
    ),
  );

  const [sale] = await db
    .select()
    .from(sales)
    .where(
      eq(sales.id, id),
    )
    .limit(1);

  if (!sale) {
    notFound();
  }

  const [
    items,
    openDrawer,
    payments,
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

    db.query.cashDrawers.findFirst(
      {
        where: eq(
          cashDrawers.status,
          'OPEN',
        ),
      },
    ),

    db
      .select({
        id:
          salePayments.id,
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
            salePayments.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        desc(
          salePayments.paidAt,
        ),
      ),
  ]);

  const visiblePayments =
    payments.slice(
      0,
      take,
    );

  const hasMorePayments =
    payments.length >
    visiblePayments.length;

  const paidAmount =
    Math.max(
      0,
      Number(
        sale.paidAmount,
      ),
    );

  const balanceAmount =
    Math.max(
      0,
      Number(
        sale.balanceAmount,
      ),
    );

  const isCleared =
    balanceAmount <= 0;

  const saleStatus =
    isCleared
      ? 'Cleared sale'
      : paidAmount > 0
        ? 'Part-paid sale'
        : 'Unpaid sale';

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              {saleStatus}
            </p>

            <h2 className="mt-1 font-display text-3xl font-black tracking-tight text-[var(--text)]">
              {sale.customerName ||
                'Customer'}
            </h2>

            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {sale.customerPhone
                ? `${sale.customerPhone} / `
                : ''}
              {dateTime(
                sale.saleDate,
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 sm:justify-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                Paid
              </p>

              <p className="mt-1 text-xl font-black text-[var(--text)]">
                {money(
                  paidAmount,
                )}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                {isCleared
                  ? 'Status'
                  : 'Still unpaid'}
              </p>

              <p
                className={
                  isCleared
                    ? 'mt-1 text-xl font-black text-[#5F8A63] dark:text-[#79C27D]'
                    : 'mt-1 text-xl font-black text-[#F2A71B]'
                }
              >
                {isCleared
                  ? 'Cleared'
                  : money(
                      balanceAmount,
                    )}
              </p>
            </div>

            <Link
              href="/debts"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </div>
      </header>

      <div
        className={
          isCleared
            ? 'space-y-4'
            : 'grid gap-4 xl:grid-cols-[1fr_0.9fr]'
        }
      >
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Sale
              </p>

              <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
                What was bought
              </h3>
            </div>

            <Link
              href={`/sales/${sale.id}`}
              className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              Open sale
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {items.map(
              (item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--text)]">
                      {
                        item.itemName
                      }{' '}
                      x
                      {
                        item.quantity
                      }
                    </p>

                    <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                      {money(
                        item.unitPrice,
                      )}{' '}
                      each
                    </p>
                  </div>

                  <p className="shrink-0 text-sm font-black text-[var(--text)]">
                    {money(
                      item.lineTotal,
                    )}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-[var(--muted)]">
              Sale total
            </span>

            <strong className="font-black text-[var(--text)]">
              {money(
                sale.totalAmount,
              )}
            </strong>
          </div>
        </section>

        {!isCleared ? (
          <aside className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Record payment
            </p>

            <h3 className="mt-1 font-display text-xl font-black text-[var(--text)]">
              Payment received
            </h3>

            <div className="mt-4">
              <DebtPaymentForm
                saleId={sale.id}
                userId={user.id}
                balanceAmount={
                  sale.balanceAmount
                }
                cashDrawerId={
                  openDrawer?.id ??
                  null
                }
              />
            </div>
          </aside>
        ) : null}
      </div>

      {visiblePayments.length > 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Payments
          </p>

          <div className="mt-3 divide-y divide-[var(--border)]">
            {visiblePayments.map(
              (payment) => (
                <div
                  key={
                    payment.id
                  }
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div>
                    <p className="text-xs font-black text-[var(--muted)]">
                      {payment.paymentType ===
                      'LATER_PAYMENT'
                        ? 'Later payment'
                        : 'Paid at sale'}
                    </p>

                    <p className="mt-1 text-sm font-black text-[var(--text)]">
                      {money(
                        payment.amount,
                      )}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                      {paymentName(
                        payment.paymentMethod,
                      )}
                      {payment.receivedByName
                        ? ` / ${payment.receivedByName}`
                        : ''}
                      {' / '}
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

                  <Link
                    href={
                      payment.paymentType ===
                      'LATER_PAYMENT'
                        ? `/sales/${sale.id}/later-payment-fix/${payment.id}`
                        : `/sales/${sale.id}/payment-fix`
                    }
                    className="shrink-0 text-xs font-black text-[var(--primary)] hover:underline"
                  >
                    {user.role ===
                    'OWNER'
                      ? 'Fix payment mistake'
                      : 'Ask owner to fix payment'}
                  </Link>
                </div>
              ),
            )}
          </div>

          {hasMorePayments ? (
            <div className="mt-3 flex justify-center">
              <Link
                href={buildLoadMoreHref(
                  sale.id,
                  take +
                    PAGE_SIZE,
                )}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)]"
              >
                Load more
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
