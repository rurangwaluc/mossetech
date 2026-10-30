'use server';

import {
  and,
  eq,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  revalidatePath,
} from 'next/cache';

import {
  redirect,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';

import {
  cashDrawerMovements,
  corrections,
  expenses,
  externalCustomerPayments,
  externalSupplierSettlements,
  moneyAdditions,
  moneyTransfers,
  salePayments,
} from '@mossetech/db/schema';

import {
  externalMoneyAdditionSchema,
  moneyReversalSchema,
} from '@mossetech/validators/money';

import {
  requireOwner,
} from '@/lib/auth/session';

import {
  getLockedCurrentDrawerState,
} from '@/lib/cash-drawer/locking';

import type {
  DbTransaction,
} from '@/lib/cash-drawer/locking';

import {
  paymentName,
} from '@/lib/money/balance';

import type {
  PaymentMethod,
} from '@/lib/money/balance';

class MoneyActionError extends Error {}

function moneyErrorHref(
  message: string,
) {
  return (
    '/money?error=' +
    encodeURIComponent(
      message,
    )
  );
}

function revalidateMoneyPaths() {
  revalidatePath('/money');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
}

async function getPaymentMethodBalanceInTransaction(
  tx: DbTransaction,
  method: PaymentMethod,
) {
  /*
   * Do not call the global getMoneyBalances()
   * from inside a transaction.
   *
   * The local database pool intentionally uses
   * max=1, so every balance read needed by a
   * transaction must use that same transaction.
   */
  const paymentList =
    await tx
      .select()
      .from(salePayments)
      .where(
        eq(
          salePayments.isActive,
          true,
        ),
      );

  const expenseList =
    await tx
      .select()
      .from(expenses);

  const transferList =
    await tx
      .select()
      .from(moneyTransfers)
      .where(
        isNull(
          moneyTransfers.reversedAt,
        ),
      );

  const additionList =
    await tx
      .select()
      .from(moneyAdditions)
      .where(
        isNull(
          moneyAdditions.reversedAt,
        ),
      );

  const externalCustomerList =
    await tx
      .select()
      .from(externalCustomerPayments);

  const externalSupplierList =
    await tx
      .select()
      .from(externalSupplierSettlements);

  const customerIn =
    paymentList
      .filter(
        (payment) =>
          payment.paymentMethod ===
          method,
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.receivedAmount,
          ),
        0,
      );

  const customerReturnsOut =
    paymentList
      .filter(
        (payment) =>
          payment.returnMethod ===
          method,
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.returnedAmount,
          ),
        0,
      );

  const addedMoney =
    additionList
      .filter(
        (addition) =>
          addition.paymentMethod ===
          method,
      )
      .reduce(
        (sum, addition) =>
          sum +
          Number(
            addition.amount,
          ),
        0,
      );

  const expensesOut =
    expenseList
      .filter(
        (expense) =>
          expense.paymentMethod ===
          method,
      )
      .reduce(
        (sum, expense) =>
          sum +
          Number(
            expense.amount,
          ),
        0,
      );

  const transferIn =
    transferList
      .filter(
        (transfer) =>
          transfer.toPaymentMethod ===
          method,
      )
      .reduce(
        (sum, transfer) =>
          sum +
          Number(
            transfer.amount,
          ),
        0,
      );

  const transferOut =
    transferList
      .filter(
        (transfer) =>
          transfer.fromPaymentMethod ===
          method,
      )
      .reduce(
        (sum, transfer) =>
          sum +
          Number(
            transfer.amount,
          ),
        0,
      );

  const externalCustomerIn =
    externalCustomerList
      .filter(
        (payment) =>
          payment.paymentMethod === method,
      )
      .reduce(
        (sum, payment) =>
          sum + Number(payment.amount),
        0,
      );

  const externalSupplierOut =
    externalSupplierList
      .filter(
        (payment) =>
          payment.paymentMethod === method,
      )
      .reduce(
        (sum, payment) =>
          sum + Number(payment.amount),
        0,
      );

  return (
    addedMoney +
    customerIn +
    externalCustomerIn +
    transferIn -
    customerReturnsOut -
    expensesOut -
    externalSupplierOut -
    transferOut
  );
}

export async function addExternalMoneyAction(
  formData: FormData,
) {
  const user =
    await requireOwner();

  const parsed =
    externalMoneyAdditionSchema.safeParse(
      {
        paymentMethod:
          formData.get(
            'paymentMethod',
          ),

        amount:
          formData.get(
            'amount',
          ) || '0',

        reason:
          formData.get(
            'reason',
          ) || '',
      },
    );

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the external money form.';

    redirect(
      moneyErrorHref(
        message,
      ),
    );
  }

  const amount =
    Number(
      parsed.data.amount,
    );

  if (amount <= 0) {
    redirect(
      moneyErrorHref(
        'Amount must be above zero.',
      ),
    );
  }

  await db
    .insert(
      moneyAdditions,
    )
    .values({
      addedByUserId:
        user.id,

      paymentMethod:
        parsed.data
          .paymentMethod,

      amount:
        parsed.data.amount,

      notes:
        parsed.data.reason,
    });

  revalidateMoneyPaths();

  redirect(
    '/money?externalAdded=1',
  );
}

export async function reverseExternalMoneyAdditionAction(
  formData: FormData,
) {
  const user =
    await requireOwner();

  const parsed =
    moneyReversalSchema.safeParse({
      targetId:
        formData.get(
          'additionId',
        ),

      reason:
        formData.get(
          'reason',
        ) || '',
  });

  if (!parsed.success) {
    redirect(
      moneyErrorHref(
        parsed.error.issues[0]
          ?.message ||
          'Check the reversal.',
      ),
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        /*
         * Lock the exact ledger row so two reversal
         * attempts cannot both pass the checks.
         */
        await tx.execute(sql`
          SELECT id
          FROM money_additions
          WHERE id = ${parsed.data.targetId}
          FOR UPDATE
        `);

        const [addition] =
          await tx
            .select()
            .from(
              moneyAdditions,
            )
            .where(
              eq(
                moneyAdditions.id,
                parsed.data.targetId,
              ),
            )
            .limit(1);

        if (!addition) {
          throw new MoneyActionError(
            'Money addition was not found.',
          );
        }

        if (
          addition.paymentMethod ===
          'CASH'
        ) {
          throw new MoneyActionError(
            'Cash added through the drawer cannot be reversed from account history.',
          );
        }

        if (addition.reversedAt) {
          throw new MoneyActionError(
            'This money addition has already been reversed.',
          );
        }

        const amount =
          Number(
            addition.amount,
          );

        const available =
          await getPaymentMethodBalanceInTransaction(
            tx,
            addition.paymentMethod,
          );

        if (
          amount >
          available + 0.005
        ) {
          throw new MoneyActionError(
            `Not enough money remains in ${paymentName(
              addition.paymentMethod,
            )} to reverse this addition.`,
          );
        }

        const now =
          new Date();

        const reversed =
          await tx
            .update(
              moneyAdditions,
            )
            .set({
              reversedByUserId:
                user.id,

              reversedAt:
                now,

              reversalReason:
                parsed.data.reason,
            })
            .where(
              and(
                eq(
                  moneyAdditions.id,
                  addition.id,
                ),
                isNull(
                  moneyAdditions.reversedAt,
                ),
              ),
            )
            .returning({
              id:
                moneyAdditions.id,
            });

        if (
          reversed.length !== 1
        ) {
          throw new MoneyActionError(
            'This money addition has already been reversed.',
          );
        }

        const beforeValues = {
          kind:
            'MONEY_ADDITION_V1',

          additionId:
            addition.id,

          paymentMethod:
            addition.paymentMethod,

          amount,

          notes:
            addition.notes,

          addedByUserId:
            addition.addedByUserId,

          addedAt:
            addition.addedAt
              .toISOString(),

          reversedAt:
            null,
        };

        const afterValues = {
          ...beforeValues,

          reversedAt:
            now.toISOString(),

          reversedByUserId:
            user.id,

          reversalReason:
            parsed.data.reason,
        };

        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'MONEY_ADDITION',

            targetId:
              addition.id,

            targetLabel:
              `External money / ${paymentName(
                addition.paymentMethod,
              )}`,

            requestedByUserId:
              user.id,

            reviewedByUserId:
              user.id,

            status:
              'APPLIED',

            beforeValues,
            afterValues,

            reason:
              parsed.data.reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      MoneyActionError
    ) {
      redirect(
        moneyErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateMoneyPaths();

  redirect(
    '/money?moneyReversed=1',
  );
}

export async function reverseMoneyTransferAction(
  formData: FormData,
) {
  const user =
    await requireOwner();

  const parsed =
    moneyReversalSchema.safeParse({
      targetId:
        formData.get(
          'transferId',
        ),

      reason:
        formData.get(
          'reason',
        ) || '',
    });

  if (!parsed.success) {
    redirect(
      moneyErrorHref(
        parsed.error.issues[0]
          ?.message ||
          'Check the reversal.',
      ),
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        /*
         * Deposit reversal changes physical cash,
         * so lock the currently-open drawer first.
         */
        const drawerState =
          await getLockedCurrentDrawerState(
            tx,
          );

        if (!drawerState) {
          throw new MoneyActionError(
            'The original cash deposit can only be reversed while its drawer is still open.',
          );
        }

        await tx.execute(sql`
          SELECT id
          FROM money_transfers
          WHERE id = ${parsed.data.targetId}
          FOR UPDATE
        `);

        const [transfer] =
          await tx
            .select()
            .from(
              moneyTransfers,
            )
            .where(
              eq(
                moneyTransfers.id,
                parsed.data.targetId,
              ),
            )
            .limit(1);

        if (!transfer) {
          throw new MoneyActionError(
            'Money transfer was not found.',
          );
        }

        if (transfer.reversedAt) {
          throw new MoneyActionError(
            'This money transfer has already been reversed.',
          );
        }

        if (
          transfer.fromPaymentMethod !==
          'CASH'
        ) {
          throw new MoneyActionError(
            'Only cash deposits can be reversed here.',
          );
        }

        const originalMovement =
          drawerState.movements.find(
            (movement) =>
              movement.moneyTransferId ===
                transfer.id &&
              movement.movementType ===
                'CASH_DEPOSIT',
          );

        if (!originalMovement) {
          throw new MoneyActionError(
            'This deposit belongs to a closed or different cash drawer and cannot be reversed automatically.',
          );
        }

        const amount =
          Number(
            transfer.amount,
          );

        const destinationBalance =
          await getPaymentMethodBalanceInTransaction(
            tx,
            transfer.toPaymentMethod,
          );

        if (
          amount >
          destinationBalance + 0.005
        ) {
          throw new MoneyActionError(
            `Not enough money remains in ${paymentName(
              transfer.toPaymentMethod,
            )} to reverse this deposit.`,
          );
        }

        const now =
          new Date();

        const reversed =
          await tx
            .update(
              moneyTransfers,
            )
            .set({
              reversedByUserId:
                user.id,

              reversedAt:
                now,

              reversalReason:
                parsed.data.reason,
            })
            .where(
              and(
                eq(
                  moneyTransfers.id,
                  transfer.id,
                ),
                isNull(
                  moneyTransfers.reversedAt,
                ),
              ),
            )
            .returning({
              id:
                moneyTransfers.id,
            });

        if (
          reversed.length !== 1
        ) {
          throw new MoneyActionError(
            'This money transfer has already been reversed.',
          );
        }

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              drawerState.drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'CASH_DEPOSIT_REVERSAL',

            direction:
              'IN',

            amount:
              transfer.amount,

            reason:
              `Deposit reversal / ${parsed.data.reason}`,

            moneyTransferId:
              transfer.id,
          });

        const beforeValues = {
          kind:
            'MONEY_TRANSFER_V1',

          transferId:
            transfer.id,

          fromPaymentMethod:
            transfer.fromPaymentMethod,

          toPaymentMethod:
            transfer.toPaymentMethod,

          amount,

          notes:
            transfer.notes,

          movedByUserId:
            transfer.movedByUserId,

          movedAt:
            transfer.movedAt
              .toISOString(),

          reversedAt:
            null,
        };

        const afterValues = {
          ...beforeValues,

          reversedAt:
            now.toISOString(),

          reversedByUserId:
            user.id,

          reversalReason:
            parsed.data.reason,
        };

        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'MONEY_TRANSFER',

            targetId:
              transfer.id,

            targetLabel:
              `${paymentName(
                transfer.fromPaymentMethod,
              )} → ${paymentName(
                transfer.toPaymentMethod,
              )}`,

            requestedByUserId:
              user.id,

            reviewedByUserId:
              user.id,

            status:
              'APPLIED',

            beforeValues,
            afterValues,

            reason:
              parsed.data.reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      MoneyActionError
    ) {
      redirect(
        moneyErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateMoneyPaths();

  redirect(
    '/money?moneyReversed=1',
  );
}
