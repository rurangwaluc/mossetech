import Link from 'next/link';
import {
  desc,
  eq,
} from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  cashDrawers,
} from '@mossetech/db/schema';
import { requireUser } from '@/lib/auth/session';
import {
  addDrawerCashAction,
  closeCashDrawerAction,
  depositDrawerCashAction,
  openCashDrawerAction,
  recordDrawerCashExpenseAction,
  removeDrawerCashAction,
} from '@/lib/cash-drawer/actions';
import {
  getDrawerCashIn,
  getDrawerCashOut,
  getExpectedDrawerCash,
} from '@/lib/cash-drawer/calculations';

import {
  getMoneyBalances,
  paymentName,
} from '@/lib/money/balance';

import {
  addExternalMoneyAction,
  reverseExternalMoneyAdditionAction,
  reverseMoneyTransferAction,
} from '@/lib/money/actions';

type MoneyPageProps = {
  searchParams?: Promise<{
    action?: string;
    accountAction?: string;
    error?: string;
    externalAdded?: string;
    moneyReversed?: string;
    drawerOpened?: string;
    drawerClosed?: string;
    cashAdded?: string;
    cashRemoved?: string;
    cashDeposited?: string;
    cashExpense?: string;
  }>;
};

type MovementType =
  | 'OPENING_CASH'
  | 'CASH_SALE'
  | 'CUSTOMER_EXTRA_KEPT'
  | 'CASH_ADDED'
  | 'CASH_REMOVED'
  | 'CASH_DEPOSIT'
  | 'CASH_DEPOSIT_REVERSAL'
  | 'CASH_EXPENSE'
  | 'EXPENSE_CORRECTION'
  | 'CASH_DEBT_PAYMENT'
  | 'PAYMENT_CORRECTION'
  | 'CLOSING_COUNT'
  | 'CASH_DIFFERENCE';

const fieldClass =
  'h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]';

const textareaClass =
  'min-h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]';

function money(
  value: string | number,
) {
  return `RWF ${Number(
    value,
  ).toLocaleString('en-RW', {
    maximumFractionDigits: 0,
  })}`;
}

function dateTime(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        'Africa/Kigali',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(value);
}

function movementName(
  value: MovementType | string,
) {
  const names: Record<
    string,
    string
  > = {
    OPENING_CASH:
      'Opening cash',
    CASH_SALE:
      'Cash sale',
    CUSTOMER_EXTRA_KEPT:
      'Customer extra kept',
    CASH_ADDED:
      'Cash added',
    CASH_REMOVED:
      'Cash removed',
    CASH_DEPOSIT:
      'Cash deposited',

    CASH_DEPOSIT_REVERSAL:
      'Deposit reversed',

    CASH_EXPENSE:
      'Cash expense',

    EXPENSE_CORRECTION:
      'Expense fix',

    CASH_DEBT_PAYMENT:
      'Credit payment',

    PAYMENT_CORRECTION:

      'Payment fix',
    CLOSING_COUNT:
      'Closing count',
    CASH_DIFFERENCE:
      'Cash difference',
  };

  return names[value] || value;
}

function successMessage(
  params: Awaited<
    MoneyPageProps['searchParams']
  >,
) {
  if (
    params?.externalAdded ===
    '1'
  ) {
    return 'External money added.';
  }

  if (
    params?.moneyReversed ===
    '1'
  ) {
    return 'Money entry reversed.';
  }

  if (
    params?.drawerOpened ===
    '1'
  ) {
    return 'Cash drawer opened.';
  }

  if (
    params?.drawerClosed ===
    '1'
  ) {
    return 'Cash drawer closed.';
  }

  if (
    params?.cashAdded === '1'
  ) {
    return 'Cash added.';
  }

  if (
    params?.cashRemoved ===
    '1'
  ) {
    return 'Cash removed.';
  }

  if (
    params?.cashDeposited ===
    '1'
  ) {
    return 'Cash deposit recorded.';
  }

  if (
    params?.cashExpense ===
    '1'
  ) {
    return 'Cash expense recorded.';
  }

  return '';
}

function actionHref(
  action: string,
) {
  return `/money?action=${action}`;
}

export default async function MoneyPage({
  searchParams,
}: MoneyPageProps) {
  const user =
    await requireUser();

  const isOwner =
    user.role === 'OWNER';

  const params =
    await searchParams;

  const selectedAction =
    params?.action || '';

  const selectedAccountAction =
    params?.accountAction || '';

  const error =
    params?.error || '';

  const success =
    successMessage(params);

  const [
    currentDrawer,
    lastClosedDrawer,
    accountBalances,
    moneyAdditionHistory,
    moneyTransferHistory,
  ] = await Promise.all([
    db.query.cashDrawers.findFirst(
      {
        where: eq(
          cashDrawers.status,
          'OPEN',
        ),
        orderBy: desc(
          cashDrawers.openedAt,
        ),
      },
    ),

    db.query.cashDrawers.findFirst(
      {
        where: eq(
          cashDrawers.status,
          'CLOSED',
        ),
        with: {
          openedBy: true,
          closedBy: true,
        },
        orderBy: desc(
          cashDrawers.closedAt,
        ),
      },
    ),

    isOwner
      ? getMoneyBalances()
      : Promise.resolve([]),

    isOwner
      ? db.query.moneyAdditions.findMany({
          with: {
            addedBy: true,
            reversedBy: true,
          },
          orderBy: (
            moneyAdditions,
            { desc },
          ) => [
            desc(
              moneyAdditions.addedAt,
            ),
          ],
          limit: 25,
        })
      : Promise.resolve([]),

    isOwner
      ? db.query.moneyTransfers.findMany({
          with: {
            movedBy: true,
            reversedBy: true,
          },
          orderBy: (
            moneyTransfers,
            { desc },
          ) => [
            desc(
              moneyTransfers.movedAt,
            ),
          ],
          limit: 25,
        })
      : Promise.resolve([]),
  ]);

  const movements =
    currentDrawer
      ? await db.query.cashDrawerMovements.findMany(
          {
            where: eq(
              cashDrawerMovements.drawerId,
              currentDrawer.id,
            ),
            with: {
              createdBy: true,
            },
            orderBy: desc(
              cashDrawerMovements.createdAt,
            ),
          },
        )
      : [];

  const currentDrawerDepositIds =
    new Set(
      movements
        .filter(
          (movement) =>
            movement.movementType ===
              'CASH_DEPOSIT' &&
            movement.moneyTransferId,
        )
        .map(
          (movement) =>
            movement.moneyTransferId as string,
        ),
    );

  const moneyHistory =
    isOwner
      ? [
          ...moneyAdditionHistory.map(
            (addition) => ({
              id:
                `addition-${addition.id}`,

              sourceType:
                'ADDITION' as const,

              sourceId:
                addition.id,

              kind:
                addition.paymentMethod ===
                'CASH'
                  ? 'Cash added'
                  : 'External money added',

              route:
                addition.paymentMethod ===
                'CASH'
                  ? paymentName(
                      addition.paymentMethod,
                    )
                  : `External → ${paymentName(
                      addition.paymentMethod,
                    )}`,

              amount:
                Number(
                  addition.amount,
                ),

              direction: 'IN' as const,

              reason:
                addition.notes ||
                'No reason',

              actor:
                addition.addedBy.name,

              happenedAt:
                addition.addedAt,

              reversedAt:
                addition.reversedAt,

              reversalReason:
                addition.reversalReason,

              reversedBy:
                addition.reversedBy
                  ?.name || null,

              canReverse:
                !addition.reversedAt &&
                addition.paymentMethod !==
                  'CASH',
            }),
          ),

          ...moneyTransferHistory.map(
            (transfer) => ({
              id:
                `transfer-${transfer.id}`,

              sourceType:
                'TRANSFER' as const,

              sourceId:
                transfer.id,

              kind:
                'Money transferred',

              route:
                `${paymentName(
                  transfer.fromPaymentMethod,
                )} → ${paymentName(
                  transfer.toPaymentMethod,
                )}`,

              amount:
                Number(
                  transfer.amount,
                ),

              direction:
                'TRANSFER' as const,

              reason:
                transfer.notes ||
                'No reason',

              actor:
                transfer.movedBy.name,

              happenedAt:
                transfer.movedAt,

              reversedAt:
                transfer.reversedAt,

              reversalReason:
                transfer.reversalReason,

              reversedBy:
                transfer.reversedBy
                  ?.name || null,

              canReverse:
                !transfer.reversedAt &&
                transfer.fromPaymentMethod ===
                  'CASH' &&
                currentDrawerDepositIds.has(
                  transfer.id,
                ),
            }),
          ),
        ]
          .sort(
            (a, b) =>
              b.happenedAt.getTime() -
              a.happenedAt.getTime(),
          )
          .slice(0, 25)
      : [];

  const expectedCash =
    currentDrawer
      ? getExpectedDrawerCash(
          currentDrawer,
          movements,
        )
      : 0;

  const cashIn =
    currentDrawer
      ? getDrawerCashIn(
          movements,
        )
      : 0;

  const cashOut =
    currentDrawer
      ? getDrawerCashOut(
          movements,
        )
      : 0;

  const visibleMovements =
    movements.filter(
      (movement) =>
        movement.movementType !==
          'CLOSING_COUNT' &&
        movement.movementType !==
          'CASH_DIFFERENCE' &&
        !(
          movement.movementType ===
            'OPENING_CASH' &&
          Number(
            movement.amount,
          ) === 0
        ),
    );

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
          {success}
        </div>
      ) : null}

      {isOwner ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
                Money
              </p>

              <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--text)]">
                Account balances
              </h2>

              <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                Business money by payment method.
              </p>
            </div>

            {selectedAccountAction ===
            'external' ? (
              <Link
                href="/money"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)]"
              >
                Cancel
              </Link>
            ) : (
              <Link
                href="/money?accountAction=external"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]"
              >
                Add external money
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4">
            {accountBalances.map(
              (account, index) => (
                <div
                  key={account.method}
                  className={
                    [
                      'border-b border-r border-[var(--border)] px-4 py-4 sm:border-b-0 sm:px-6',
                      'border-b border-[var(--border)] px-4 py-4 sm:border-r sm:border-b-0 sm:px-6',
                      'border-r border-[var(--border)] px-4 py-4 sm:px-6',
                      'px-4 py-4 sm:px-6',
                    ][index]
                  }
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                    {account.name}
                  </p>

                  <p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">
                    {money(
                      account.balance,
                    )}
                  </p>

                  {account.method ===
                  'CASH' ? (
                    <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                      Accounting balance
                    </p>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      {isOwner &&
      selectedAccountAction ===
        'external' ? (
        <form
          action={
            addExternalMoneyAction
          }
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
        >
          <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <h3 className="text-lg font-black text-[var(--text)]">
              Add external money
            </h3>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              Record money added from outside Bloom Kigali. Cash must be added through the physical drawer.
            </p>
          </div>

          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3 sm:px-6">
            <div>
              <label
                htmlFor="paymentMethod"
                className="text-sm font-black text-[var(--text)]"
              >
                Account
              </label>

              <select
                id="paymentMethod"
                name="paymentMethod"
                required
                defaultValue="MOBILE_MONEY"
                className={`${fieldClass} mt-2`}
              >
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
            </div>

            <div>
              <label
                htmlFor="externalAmount"
                className="text-sm font-black text-[var(--text)]"
              >
                Amount
              </label>

              <input
                id="externalAmount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="Amount"
                className={`${fieldClass} mt-2`}
              />
            </div>

            <div>
              <label
                htmlFor="externalReason"
                className="text-sm font-black text-[var(--text)]"
              >
                Reason
              </label>

              <input
                id="externalReason"
                name="reason"
                required
                placeholder="Why was this money added?"
                className={`${fieldClass} mt-2`}
              />
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
            <button className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]">
              Add money
            </button>
          </div>
        </form>
      ) : null}

      {isOwner ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Money
              </p>

              <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                Money history
              </h3>

              <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                Owner additions and account transfers.
              </p>
            </div>

            <p className="shrink-0 text-xs font-black text-[var(--muted)]">
              {moneyHistory.length}{' '}
              record
              {moneyHistory.length === 1
                ? ''
                : 's'}
            </p>
          </div>

          {moneyHistory.length === 0 ? (
            <p className="px-5 py-5 text-sm font-bold text-[var(--muted)] sm:px-6">
              No money activity yet.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {moneyHistory.map(
                (entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-4 px-5 py-3 sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[var(--text)]">
                        {entry.kind}
                      </p>

                      <p className="mt-0.5 text-xs font-black text-[var(--text)]">
                        {entry.route}
                      </p>

                      <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
                        {entry.reason}
                        {' / '}
                        {entry.actor}
                        {' / '}
                        {dateTime(
                          entry.happenedAt,
                        )}
                      </p>

                      {entry.reversedAt ? (
                        <p className="mt-1 text-xs font-black leading-5 text-[var(--danger)]">
                          Reversed
                          {entry.reversedBy
                            ? ` by ${entry.reversedBy}`
                            : ''}
                          {' / '}
                          {entry.reversalReason ||
                            'No reason'}
                          {' / '}
                          {dateTime(
                            entry.reversedAt,
                          )}
                        </p>
                      ) : null}

                      {entry.canReverse ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-black text-[var(--danger)]">
                            Reverse entry
                          </summary>

                          <form
                            action={
                              entry.sourceType ===
                              'ADDITION'
                                ? reverseExternalMoneyAdditionAction
                                : reverseMoneyTransferAction
                            }
                            className="mt-2 flex max-w-xl flex-col gap-2 sm:flex-row"
                          >
                            <input
                              type="hidden"
                              name={
                                entry.sourceType ===
                                'ADDITION'
                                  ? 'additionId'
                                  : 'transferId'
                              }
                              value={
                                entry.sourceId
                              }
                            />

                            <input
                              name="reason"
                              required
                              maxLength={1000}
                              placeholder="Why is this entry being reversed?"
                              className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                            />

                            <button
                              type="submit"
                              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--danger)] px-4 text-xs font-black text-[var(--danger)]"
                            >
                              Confirm reversal
                            </button>
                          </form>
                        </details>
                      ) : null}
                    </div>

                    <p
                      className={
                        entry.reversedAt
                          ? 'shrink-0 text-sm font-black tabular-nums text-[var(--muted)] line-through'
                          : entry.direction ===
                              'IN'
                            ? 'shrink-0 text-sm font-black tabular-nums text-[var(--success)]'
                            : 'shrink-0 text-sm font-black tabular-nums text-[var(--text)]'
                      }
                    >
                      {entry.direction ===
                      'IN'
                        ? '+'
                        : ''}
                      {money(
                        entry.amount,
                      )}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Cash
            </p>

            <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--text)]">
              Cash drawer
            </h2>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              Physical cash used for cash sales.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              Status
            </p>

            <p
              className={
                currentDrawer
                  ? 'mt-1 text-sm font-black text-[var(--success)]'
                  : 'mt-1 text-sm font-black text-[var(--text)]'
              }
            >
              {currentDrawer
                ? 'Open'
                : 'Closed'}
            </p>
          </div>
        </div>

        {currentDrawer ? (
          <div className="grid grid-cols-3 border-t border-[var(--border)]">
            <div className="border-r border-[var(--border)] px-4 py-3 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Expected cash
              </p>

              <p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">
                {money(
                  expectedCash,
                )}
              </p>
            </div>

            <div className="border-r border-[var(--border)] px-4 py-3 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Cash in
              </p>

              <p className="mt-1 text-lg font-black tabular-nums text-[var(--success)]">
                {money(cashIn)}
              </p>
            </div>

            <div className="px-4 py-3 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Cash out
              </p>

              <p className="mt-1 text-lg font-black tabular-nums text-[var(--danger)]">
                {money(cashOut)}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {!currentDrawer ? (
        <section
          className={
            lastClosedDrawer
              ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]'
              : 'grid gap-4'
          }
        >
          <form
            action={
              openCashDrawerAction
            }
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Start work
              </p>

              <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                Open cash drawer
              </h3>

              <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                {lastClosedDrawer
                  ? `The previous drawer closed with ${money(
                      lastClosedDrawer.countedCash,
                    )}. Count the physical cash before opening again.`
                  : 'Count the physical cash before taking cash payments.'}
              </p>
            </div>

            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6">
              <div>
                <label
                  htmlFor="openingCash"
                  className="text-sm font-black text-[var(--text)]"
                >
                  {lastClosedDrawer
                    ? 'Counted cash'
                    : 'Starting cash'}
                </label>

                <input
                  id="openingCash"
                  name="openingCash"
                  inputMode="decimal"
                  required
                  placeholder={
                    lastClosedDrawer
                      ? `Expected ${money(
                          lastClosedDrawer.countedCash,
                        )}`
                      : 'Example: 0'
                  }
                  className={`${fieldClass} mt-2`}
                />
              </div>

              <div>
                <label
                  htmlFor="openingNote"
                  className="text-sm font-black text-[var(--text)]"
                >
                  {lastClosedDrawer
                    ? 'Reason if different'
                    : 'Source if starting with cash'}
                </label>

                <input
                  id="openingNote"
                  name="openingNote"
                  placeholder={
                    lastClosedDrawer
                      ? 'Required only if the amount is different'
                      : 'Required only when starting above RWF 0'
                  }
                  className={`${fieldClass} mt-2`}
                />
              </div>
            </div>

            <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
              <button className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-action-hover)]">
                Open drawer
              </button>
            </div>
          </form>

          {lastClosedDrawer ? (
            <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                  Last drawer
                </p>

                <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                  Previous close
                </h3>
              </div>

              <div className="space-y-3 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-[var(--muted)]">
                    Closed
                  </span>

                  <span className="text-sm font-black text-[var(--text)]">
                    {lastClosedDrawer.closedAt
                      ? dateTime(
                          lastClosedDrawer.closedAt,
                        )
                      : '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-[var(--muted)]">
                    Expected
                  </span>

                  <span className="text-sm font-black text-[var(--text)]">
                    {money(
                      lastClosedDrawer.expectedCashAtClose,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-[var(--muted)]">
                    Counted
                  </span>

                  <span className="text-sm font-black text-[var(--text)]">
                    {money(
                      lastClosedDrawer.countedCash,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-[var(--muted)]">
                    Difference
                  </span>

                  <span
                    className={
                      lastClosedDrawer.differenceType ===
                      'NONE'
                        ? 'text-sm font-black text-[var(--success)]'
                        : 'text-sm font-black text-[var(--danger)]'
                    }
                  >
                    {lastClosedDrawer.differenceType ===
                    'NONE'
                      ? 'Correct'
                      : `${lastClosedDrawer.differenceType === 'EXTRA' ? 'Extra' : 'Missing'} ${money(
                          lastClosedDrawer.differenceAmount,
                        )}`}
                  </span>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                  Current drawer
                </p>

                <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                  Open since{' '}
                  {dateTime(
                    currentDrawer.openedAt,
                  )}
                </h3>

                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  Started with{' '}
                  {money(
                    currentDrawer.openingCash,
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 py-3 sm:px-6">
              {isOwner ? (
                <>
                  <Link
                    href={actionHref(
                      'add',
                    )}
                    className={
                      selectedAction ===
                      'add'
                        ? 'inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-4 text-xs font-black text-white'
                        : 'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-xs font-black text-[var(--text)] hover:border-[var(--primary)]'
                    }
                  >
                    Add cash
                  </Link>

                  <Link
                    href={actionHref(
                      'remove',
                    )}
                    className={
                      selectedAction ===
                      'remove'
                        ? 'inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-4 text-xs font-black text-white'
                        : 'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-xs font-black text-[var(--text)] hover:border-[var(--primary)]'
                    }
                  >
                    Remove cash
                  </Link>

                  <Link
                    href={actionHref(
                      'deposit',
                    )}
                    className={
                      selectedAction ===
                      'deposit'
                        ? 'inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-4 text-xs font-black text-white'
                        : 'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-xs font-black text-[var(--text)] hover:border-[var(--primary)]'
                    }
                  >
                    Deposit cash
                  </Link>
                </>
              ) : null}

              <Link
                href={actionHref(
                  'expense',
                )}
                className={
                  selectedAction ===
                  'expense'
                    ? 'inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-4 text-xs font-black text-white'
                    : 'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-xs font-black text-[var(--text)] hover:border-[var(--primary)]'
                }
              >
                Cash expense
              </Link>

              <Link
                href={actionHref(
                  'close',
                )}
                className={
                  selectedAction ===
                  'close'
                    ? 'inline-flex h-9 items-center rounded-lg bg-[var(--primary-action)] px-4 text-xs font-black text-white'
                    : 'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-4 text-xs font-black text-[var(--text)] hover:border-[var(--primary)]'
                }
              >
                Close drawer
              </Link>

              {selectedAction ? (
                <Link
                  href="/money"
                  className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-black text-[var(--muted)]"
                >
                  Cancel
                </Link>
              ) : null}
            </div>
          </section>

          {selectedAction ===
            'add' &&
          isOwner ? (
            <form
              action={
                addDrawerCashAction
              }
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
                <h3 className="text-lg font-black text-[var(--text)]">
                  Add cash
                </h3>

                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  Use when the owner physically puts cash into the drawer.
                </p>
              </div>

              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6">
                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Amount
                  </label>

                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="Amount"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Reason
                  </label>

                  <input
                    name="reason"
                    required
                    placeholder="Why is cash being added?"
                    className={`${fieldClass} mt-2`}
                  />
                </div>
              </div>

              <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
                <button className="h-10 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white">
                  Add cash
                </button>
              </div>
            </form>
          ) : null}

          {selectedAction ===
            'remove' &&
          isOwner ? (
            <form
              action={
                removeDrawerCashAction
              }
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
                <h3 className="text-lg font-black text-[var(--text)]">
                  Remove cash
                </h3>

                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  Use only when cash physically leaves the drawer and it is not an expense or deposit.
                </p>
              </div>

              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6">
                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Amount
                  </label>

                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="Amount"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Reason
                  </label>

                  <input
                    name="reason"
                    required
                    placeholder="Why is cash being removed?"
                    className={`${fieldClass} mt-2`}
                  />
                </div>
              </div>

              <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
                <button className="h-10 rounded-lg border border-[var(--danger)] px-5 text-sm font-black text-[var(--danger)]">
                  Remove cash
                </button>
              </div>
            </form>
          ) : null}

          {selectedAction ===
            'deposit' &&
          isOwner ? (
            <form
              action={
                depositDrawerCashAction
              }
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
                <h3 className="text-lg font-black text-[var(--text)]">
                  Deposit cash
                </h3>

                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  Record physical cash moved from the drawer to another account.
                </p>
              </div>

              <div className="grid gap-4 px-5 py-4 sm:grid-cols-3 sm:px-6">
                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Deposit to
                  </label>

                  <select
                    name="toPaymentMethod"
                    defaultValue="BANK"
                    className={`${fieldClass} mt-2`}
                  >
                    <option value="BANK">
                      Bank
                    </option>

                    <option value="MOBILE_MONEY">
                      Mobile money
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Amount
                  </label>

                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="Amount"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Reason
                  </label>

                  <input
                    name="reason"
                    required
                    placeholder="Example: Bank deposit"
                    className={`${fieldClass} mt-2`}
                  />
                </div>
              </div>

              <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
                <button className="h-10 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white">
                  Record deposit
                </button>
              </div>
            </form>
          ) : null}

          {selectedAction ===
          'expense' ? (
            <form
              action={
                recordDrawerCashExpenseAction
              }
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
                <h3 className="text-lg font-black text-[var(--text)]">
                  Cash expense
                </h3>

                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  Record an expense paid directly from the drawer.
                </p>
              </div>

              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6">
                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Expense
                  </label>

                  <input
                    name="name"
                    required
                    placeholder="Expense name"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Category
                  </label>

                  <input
                    name="category"
                    required
                    placeholder="Category"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Amount
                  </label>

                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="Amount"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-[var(--text)]">
                    Why was it spent?
                  </label>

                  <input
                    name="notes"
                    required
                    placeholder="Reason"
                    className={`${fieldClass} mt-2`}
                  />
                </div>
              </div>

              <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
                <button className="h-10 rounded-lg border border-[var(--danger)] px-5 text-sm font-black text-[var(--danger)]">
                  Record expense
                </button>
              </div>
            </form>
          ) : null}

          {selectedAction ===
          'close' ? (
            <form
              action={
                closeCashDrawerAction
              }
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                  End work
                </p>

                <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                  Close cash drawer
                </h3>

                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  Expected cash is{' '}
                  {money(
                    expectedCash,
                  )}
                  . Count the physical cash in the drawer.
                </p>
              </div>

              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6">
                <div>
                  <label
                    htmlFor="countedCash"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Counted cash
                  </label>

                  <input
                    id="countedCash"
                    name="countedCash"
                    inputMode="decimal"
                    required
                    placeholder="Amount counted"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="differenceReason"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Reason if extra or missing
                  </label>

                  <input
                    id="differenceReason"
                    name="differenceReason"
                    placeholder="Required only if amounts do not match"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="closingNote"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Note
                  </label>

                  <textarea
                    id="closingNote"
                    name="closingNote"
                    rows={3}
                    placeholder="Optional"
                    className={`${textareaClass} mt-2`}
                  />
                </div>
              </div>

              <div className="border-t border-[var(--border)] px-5 py-3 sm:px-6">
                <button className="h-10 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-black text-white">
                  Close drawer
                </button>
              </div>
            </form>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                  Cash movements
                </p>

                <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                  Current drawer
                </h3>
              </div>

              <p className="text-xs font-black text-[var(--muted)]">
                {
                  visibleMovements.length
                }{' '}
                record
                {visibleMovements.length ===
                1
                  ? ''
                  : 's'}
              </p>
            </div>

            {visibleMovements.length ===
            0 ? (
              <p className="px-5 py-5 text-sm font-bold text-[var(--muted)] sm:px-6">
                No cash movements yet.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {visibleMovements.map(
                  (movement) => (
                    <div
                      key={
                        movement.id
                      }
                      className="flex items-start justify-between gap-4 px-5 py-3 sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[var(--text)]">
                          {movementName(
                            movement.movementType,
                          )}
                        </p>

                        <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
                          {movement.reason ||
                            'No reason'}{' '}
                          /{' '}
                          {
                            movement
                              .createdBy
                              .name
                          }{' '}
                          /{' '}
                          {dateTime(
                            movement.createdAt,
                          )}
                        </p>
                      </div>

                      <p
                        className={
                          movement.direction ===
                          'OUT'
                            ? 'shrink-0 text-sm font-black tabular-nums text-[var(--danger)]'
                            : movement.direction ===
                                'IN'
                              ? 'shrink-0 text-sm font-black tabular-nums text-[var(--success)]'
                              : 'shrink-0 text-sm font-black tabular-nums text-[var(--muted)]'
                        }
                      >
                        {movement.direction ===
                        'OUT'
                          ? '-'
                          : movement.direction ===
                              'IN'
                            ? '+'
                            : ''}
                        {money(
                          movement.amount,
                        )}
                      </p>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
