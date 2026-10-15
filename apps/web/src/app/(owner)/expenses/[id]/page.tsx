import { requirePermission } from '@/lib/auth/require-permission';
import Link from 'next/link';
import {
  and,
  eq,
} from 'drizzle-orm';
import {
  ArrowLeft,
} from 'lucide-react';
import {
  notFound,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';
import {
  corrections,
  expenses,
  users,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';


type PageProps = {
  params:
    Promise<{
      id: string;
    }>;

  searchParams?:
    Promise<{
      fixed?: string;
      requestSent?: string;
    }>;
};


function money(
  value:
    | string
    | number,
) {
  return `RWF ${Number(
    value || 0,
  ).toLocaleString(
    'en-US',
  )}`;
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

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  ).format(
    value,
  );
}


export default async function ExpenseDetailPage({
  params,
  searchParams,
}: PageProps) {
  const user =
    await requirePermission('expenses.view');

  const {
    id,
  } =
    await params;

  const query =
    await searchParams;

  const [expense] =
    await db
      .select({
        id:
          expenses.id,

        name:
          expenses.name,

        category:
          expenses.category,

        amount:
          expenses.amount,

        paymentMethod:
          expenses.paymentMethod,

        expenseDate:
          expenses.expenseDate,

        notes:
          expenses.notes,

        recordedByName:
          users.name,
      })
      .from(
        expenses,
      )
      .innerJoin(
        users,
        eq(
          expenses.recordedByUserId,
          users.id,
        ),
      )
      .where(
        eq(
          expenses.id,
          id,
        ),
      )
      .limit(1);

  if (!expense) {
    notFound();
  }

  const [pendingRequest] =
    await db
      .select({
        id:
          corrections.id,

        reason:
          corrections.reason,

        requestedBy:
          users.name,
      })
      .from(
        corrections,
      )
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
            'EXPENSE',
          ),
          eq(
            corrections.targetId,
            expense.id,
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
    <section className="space-y-4">
      {query?.fixed ===
      '1' ? (
        <div className="rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
          Expense fixed.
        </div>
      ) : null}

      {query?.requestSent ===
      '1' ? (
        <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          Request sent to the owner.
        </div>
      ) : null}

      {pendingRequest ? (
        <section className="rounded-xl border border-[var(--primary)] bg-[var(--card)] px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
                Expense fix requested
              </p>

              <p className="mt-2 text-sm font-black text-[var(--text)]">
                {pendingRequest.requestedBy}{' '}
                says
              </p>

              <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                {pendingRequest.reason}
              </p>
            </div>

            {isOwner ? (
              <Link
                href="/requests"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white"
              >
                Review request
              </Link>
            ) : (
              <span className="text-xs font-black text-[var(--primary)]">
                Waiting for owner
              </span>
            )}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <header className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
                Expense
              </p>

              <h2 className="mt-1 font-display text-2xl font-black text-[var(--text)]">
                {expense.name}
              </h2>

              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                {expense.category}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!pendingRequest ? (
                <Link
                  href={`/expenses/${expense.id}/edit`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
                >
                  {isOwner
                    ? 'Fix expense mistake'
                    : 'Ask owner to fix'}
                </Link>
              ) : null}

              <Link
                href="/expenses"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </div>
          </div>
        </header>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Amount
            </p>

            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {money(
                expense.amount,
              )}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Paid from
            </p>

            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {paymentName(
                expense.paymentMethod,
              )}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Date
            </p>

            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {dateTime(
                expense.expenseDate,
              )}
            </p>
          </div>

          {isOwner ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                Recorded by
              </p>

              <p className="mt-1 text-sm font-black text-[var(--text)]">
                {expense.recordedByName}
              </p>
            </div>
          ) : null}
        </div>

        {expense.notes ? (
          <div className="border-t border-[var(--border)] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Notes
            </p>

            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text)]">
              {expense.notes}
            </p>
          </div>
        ) : null}
      </section>
    </section>
  );
}
