import Link from 'next/link';
import {
  and,
  eq,
} from 'drizzle-orm';
import {
  notFound,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';
import {
  corrections,
  expenses,
} from '@mossetech/db/schema';

import {
  requireUser,
} from '@/lib/auth/session';
import {
  submitExpenseFixAction,
} from '@/lib/expenses/fixes';


type PageProps = {
  params:
    Promise<{
      id: string;
    }>;

  searchParams?:
    Promise<{
      error?: string;
    }>;
};


function dateInput(
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

  const year =
    parts.find(
      (part) =>
        part.type ===
        'year',
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        'month',
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        'day',
    )?.value;

  return `${year}-${month}-${day}`;
}


export default async function ExpenseFixPage({
  params,
  searchParams,
}: PageProps) {
  const user =
    await requireUser();

  const {
    id,
  } =
    await params;

  const query =
    await searchParams;

  const [expense] =
    await db
      .select()
      .from(
        expenses,
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
      })
      .from(
        corrections,
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
      <form
        action={
          submitExpenseFixAction
        }
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
      >
        <input
          type="hidden"
          name="expenseId"
          value={
            expense.id
          }
        />

        <header className="border-b border-[var(--border)] px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
            Expense
          </p>

          <h2 className="mt-1 text-xl font-black text-[var(--text)]">
            {isOwner
              ? 'Fix expense mistake'
              : 'Ask owner to fix'}
          </h2>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            Correct what was entered incorrectly.
          </p>
        </header>

        <div className="space-y-5 px-5 py-5">
          {query?.error ? (
            <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
              {query.error}
            </div>
          ) : null}

          {pendingRequest ? (
            <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
              A fix request for this expense is already waiting for the owner.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-black text-[var(--text)]">
                Expense name
              </span>

              <input
                name="name"
                required
                disabled={
                  Boolean(
                    pendingRequest,
                  )
                }
                defaultValue={
                  expense.name
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="text-sm font-black text-[var(--text)]">
                Category
              </span>

              <input
                name="category"
                required
                disabled={
                  Boolean(
                    pendingRequest,
                  )
                }
                defaultValue={
                  expense.category
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="text-sm font-black text-[var(--text)]">
                Amount
              </span>

              <input
                name="amount"
                inputMode="decimal"
                required
                disabled={
                  Boolean(
                    pendingRequest,
                  )
                }
                defaultValue={
                  Number(
                    expense.amount,
                  )
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="text-sm font-black text-[var(--text)]">
                Paid from
              </span>

              <select
                name="paymentMethod"
                disabled={
                  Boolean(
                    pendingRequest,
                  )
                }
                defaultValue={
                  expense.paymentMethod
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-black text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
              >
                <option value="CASH">
                  Cash
                </option>

                <option value="MOBILE_MONEY">
                  Mobile money
                </option>

                <option value="BANK">
                  Bank
                </option>

                <option value="CARD">
                  Card
                </option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-black text-[var(--text)]">
                Date
              </span>

              <input
                name="expenseDate"
                type="date"
                required
                disabled={
                  Boolean(
                    pendingRequest,
                  )
                }
                defaultValue={
                  dateInput(
                    expense.expenseDate,
                  )
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-black text-[var(--text)]">
                Notes
              </span>

              <span className="ml-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Optional
              </span>

              <textarea
                name="notes"
                rows={3}
                disabled={
                  Boolean(
                    pendingRequest,
                  )
                }
                defaultValue={
                  expense.notes ||
                  ''
                }
                className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:opacity-60"
              />
            </label>
          </div>

          {!pendingRequest ? (
            <label className="block border-t border-[var(--border)] pt-5">
              <span className="text-sm font-black text-[var(--text)]">
                What was entered wrong?
              </span>

              <textarea
                name="reason"
                required
                rows={3}
                placeholder="Explain what needs correcting"
                className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              />
            </label>
          ) : null}

          <p className="text-xs font-semibold text-[var(--muted)]">
            This corrects the saved expense. Cash is adjusted automatically when the expense belongs to the current drawer.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link
              href={`/expenses/${expense.id}`}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)]"
            >
              Back
            </Link>

            {!pendingRequest ? (
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white"
              >
                {isOwner
                  ? 'Save fix'
                  : 'Send request'}
              </button>
            ) : isOwner ? (
              <Link
                href="/requests"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white"
              >
                Review request
              </Link>
            ) : null}
          </div>
        </div>
      </form>
    </section>
  );
}
