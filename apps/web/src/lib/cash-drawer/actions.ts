'use server';

import {
  desc,
  eq,
} from 'drizzle-orm';
import {
  revalidatePath,
} from 'next/cache';
import {
  redirect,
} from 'next/navigation';

import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  cashDrawers,
  expenses,
  moneyAdditions,
  moneyTransfers,
} from '@mossetech/db/schema';

import {
  cashDrawerCashInSchema,
  cashDrawerCashOutSchema,
  cashDrawerDepositSchema,
  cashDrawerExpenseSchema,
  closeCashDrawerSchema,
  openCashDrawerSchema,
} from '@mossetech/validators/cash-drawer';

import {
  requireOwner,
  requireUser,
} from '@/lib/auth/session';

import {
  getDifferenceType,
  toMoney,
} from './calculations';

import {
  getLockedCurrentDrawerState,
  lockCurrentOpenDrawer,
} from './locking';

class CashDrawerActionError extends Error {}

function cleanOptional(
  value: string | undefined,
) {
  const cleaned =
    value?.trim();

  return cleaned
    ? cleaned
    : null;
}

async function getOpenDrawer() {
  return db.query.cashDrawers.findFirst({
    where: eq(
      cashDrawers.status,
      'OPEN',
    ),
    orderBy: desc(
      cashDrawers.openedAt,
    ),
  });
}

export async function openCashDrawerAction(
  formData: FormData,
) {
  const user =
    await requireUser();

  const parsed =
    openCashDrawerSchema.safeParse({
      openingCash:
        formData.get(
          'openingCash',
        ) || '0',

      openingNote:
        formData.get(
          'openingNote',
        ) || undefined,
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the opening cash.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const openingCash =
    Number(
      parsed.data.openingCash,
    );

  if (openingCash < 0) {
    redirect(
      '/money?error=Opening cash cannot be below zero.',
    );
  }

  const existingDrawer =
    await getOpenDrawer();

  if (existingDrawer) {
    redirect(
      '/money?error=A cash drawer is already open.',
    );
  }

  const openingNote =
    cleanOptional(
      parsed.data.openingNote,
    );

  const previousDrawer =
    await db.query.cashDrawers.findFirst({
      where: eq(
        cashDrawers.status,
        'CLOSED',
      ),
      orderBy: desc(
        cashDrawers.closedAt,
      ),
    });

  const expectedOpeningCash =
    previousDrawer
      ? Number(
          previousDrawer.countedCash,
        )
      : 0;

  const openingDifference =
    openingCash -
    expectedOpeningCash;

  const openingDifferenceType =
    getDifferenceType(
      openingDifference,
    );

  if (
    openingDifferenceType !==
      'NONE' &&
    !openingNote
  ) {
    const message =
      previousDrawer
        ? openingDifferenceType ===
            'EXTRA'
          ? `Opening cash is RWF ${Math.abs(
              openingDifference,
            ).toLocaleString(
              'en-US',
            )} more than the previous closing count. Explain why.`
          : `Opening cash is RWF ${Math.abs(
              openingDifference,
            ).toLocaleString(
              'en-US',
            )} less than the previous closing count. Explain why.`
        : 'Explain where the starting cash came from.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const [drawer] =
          await tx
            .insert(
              cashDrawers,
            )
            .values({
              openedByUserId:
                user.id,

              openingCash:
                parsed.data
                  .openingCash,

              openingNote,
            })
            .returning({
              id:
                cashDrawers.id,
            });

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'OPENING_CASH',

            direction:
              'IN',

            amount:
              parsed.data
                .openingCash,

            reason:
              openingNote ||
              'Opening cash',
          });
      },
    );
  } catch (error) {
    /*
     * Migration 0029 enforces one OPEN drawer at the
     * database level. A concurrent second opener can
     * therefore reach this constraint even after the
     * friendly pre-check above.
     */
    if (
      error &&
      typeof error ===
        'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      redirect(
        '/money?error=A cash drawer is already open.',
      );
    }

    throw error;
  }

  revalidatePath('/money');
  revalidatePath('/dashboard');

  redirect(
    '/money?drawerOpened=1',
  );
}

export async function addDrawerCashAction(
  formData: FormData,
) {
  const user =
    await requireOwner();

  const parsed =
    cashDrawerCashInSchema.safeParse({
      amount:
        formData.get('amount') ||
        '0',

      reason:
        formData.get('reason') ||
        undefined,
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the cash added form.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const amount =
    Number(parsed.data.amount);

  if (amount <= 0) {
    redirect(
      '/money?error=Amount must be above zero.',
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const drawer =
          await lockCurrentOpenDrawer(
            tx,
          );

        if (!drawer) {
          throw new CashDrawerActionError(
            'Open the cash drawer first.',
          );
        }

        await tx
          .insert(
            moneyAdditions,
          )
          .values({
              addedByUserId:
                user.id,

            paymentMethod:
              'CASH',

            amount:
              parsed.data.amount,

            notes:
              parsed.data.reason,
          });

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'CASH_ADDED',

            direction:
              'IN',

            amount:
              parsed.data.amount,

            reason:
              parsed.data.reason,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      CashDrawerActionError
    ) {
      redirect(
        `/money?error=${encodeURIComponent(
          error.message,
        )}`,
      );
    }

    throw error;
  }

  revalidatePath('/money');
  revalidatePath('/dashboard');

  redirect(
    '/money?cashAdded=1',
  );
}

export async function removeDrawerCashAction(
  formData: FormData,
) {
  const user =
    await requireOwner();

  const parsed =
    cashDrawerCashOutSchema.safeParse({
      amount:
        formData.get('amount') ||
        '0',

      reason:
        formData.get('reason') ||
        undefined,
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the cash removed form.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const amount =
    Number(parsed.data.amount);

  if (amount <= 0) {
    redirect(
      '/money?error=Amount must be above zero.',
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const state =
          await getLockedCurrentDrawerState(
            tx,
          );

        if (!state) {
          throw new CashDrawerActionError(
            'Open the cash drawer first.',
          );
        }

        if (
          amount >
          state.expectedCash
        ) {
          throw new CashDrawerActionError(
            `Not enough drawer cash. Expected cash is RWF ${state.expectedCash.toLocaleString(
              'en-US',
            )}.`,
          );
        }

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              state.drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'CASH_REMOVED',

            direction:
              'OUT',

            amount:
              parsed.data.amount,

            reason:
              parsed.data.reason,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      CashDrawerActionError
    ) {
      redirect(
        `/money?error=${encodeURIComponent(
          error.message,
        )}`,
      );
    }

    throw error;
  }

  revalidatePath('/money');
  revalidatePath('/dashboard');

  redirect(
    '/money?cashRemoved=1',
  );
}

export async function depositDrawerCashAction(
  formData: FormData,
) {
  const user =
    await requireOwner();

  const parsed =
    cashDrawerDepositSchema.safeParse({
      toPaymentMethod:
        formData.get(
          'toPaymentMethod',
        ),

      amount:
        formData.get('amount') ||
        '0',

      reason:
        formData.get('reason') ||
        undefined,
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the deposit form.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const amount =
    Number(parsed.data.amount);

  if (amount <= 0) {
    redirect(
      '/money?error=Amount must be above zero.',
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const state =
          await getLockedCurrentDrawerState(
            tx,
          );

        if (!state) {
          throw new CashDrawerActionError(
            'Open the cash drawer first.',
          );
        }

        if (
          amount >
          state.expectedCash
        ) {
          throw new CashDrawerActionError(
            `Not enough drawer cash. Expected cash is RWF ${state.expectedCash.toLocaleString(
              'en-US',
            )}.`,
          );
        }

        const [transfer] =
          await tx
            .insert(
              moneyTransfers,
            )
            .values({
              movedByUserId:
                user.id,


              fromPaymentMethod:
                'CASH',

              toPaymentMethod:
                parsed.data
                  .toPaymentMethod,

              amount:
                parsed.data.amount,

              notes:
                parsed.data.reason,
            })
            .returning({
              id:
                moneyTransfers.id,
            });

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              state.drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'CASH_DEPOSIT',

            direction:
              'OUT',

            amount:
              parsed.data.amount,

            reason:
              parsed.data.reason,

            moneyTransferId:
              transfer.id,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      CashDrawerActionError
    ) {
      redirect(
        `/money?error=${encodeURIComponent(
          error.message,
        )}`,
      );
    }

    throw error;
  }

  revalidatePath('/money');
  revalidatePath('/dashboard');

  redirect(
    '/money?cashDeposited=1',
  );
}

export async function recordDrawerCashExpenseAction(
  formData: FormData,
) {
  const user =
    await requireUser();

  const parsed =
    cashDrawerExpenseSchema.safeParse({
      name:
        formData.get('name') ||
        undefined,

      category:
        formData.get(
          'category',
        ) || undefined,

      amount:
        formData.get('amount') ||
        '0',

      notes:
        formData.get('notes') ||
        undefined,
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the cash expense form.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const amount =
    Number(parsed.data.amount);

  if (amount <= 0) {
    redirect(
      '/money?error=Amount must be above zero.',
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const state =
          await getLockedCurrentDrawerState(
            tx,
          );

        if (!state) {
          throw new CashDrawerActionError(
            'Open the cash drawer first.',
          );
        }

        if (
          amount >
          state.expectedCash
        ) {
          throw new CashDrawerActionError(
            `Not enough drawer cash. Expected cash is RWF ${state.expectedCash.toLocaleString(
              'en-US',
            )}.`,
          );
        }

        const [expense] =
          await tx
            .insert(
              expenses,
            )
            .values({
              recordedByUserId:
                user.id,

              name:
                parsed.data.name,

              category:
                parsed.data
                  .category,

              amount:
                parsed.data.amount,

              paymentMethod:
                'CASH',

              notes:
                parsed.data.notes,
            })
            .returning({
              id:
                expenses.id,
            });

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              state.drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'CASH_EXPENSE',

            direction:
              'OUT',

            amount:
              parsed.data.amount,

            reason:
              `${parsed.data.name} / ${parsed.data.notes}`,

            expenseId:
              expense.id,
          });
      },
    );
  } catch (error) {
    if (
      error instanceof
      CashDrawerActionError
    ) {
      redirect(
        `/money?error=${encodeURIComponent(
          error.message,
        )}`,
      );
    }

    throw error;
  }

  revalidatePath('/money');
  revalidatePath('/expenses');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  redirect(
    '/money?cashExpense=1',
  );
}

export async function closeCashDrawerAction(
  formData: FormData,
) {
  const user =
    await requireUser();

  const parsed =
    closeCashDrawerSchema.safeParse({
      countedCash:
        formData.get(
          'countedCash',
        ) || '0',

      differenceReason:
        formData.get(
          'differenceReason',
        ) || undefined,

      closingNote:
        formData.get(
          'closingNote',
        ) || undefined,
    });

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]
        ?.message ||
      'Check the closing form.';

    redirect(
      `/money?error=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const countedCash =
    Number(
      parsed.data.countedCash,
    );

  if (countedCash < 0) {
    redirect(
      '/money?error=Counted cash cannot be below zero.',
    );
  }

  try {
    await db.transaction(
      async (tx) => {
        const state =
          await getLockedCurrentDrawerState(
            tx,
          );

        if (!state) {
          throw new CashDrawerActionError(
            'Open the cash drawer first.',
          );
        }

        const difference =
          countedCash -
          state.expectedCash;

        const differenceType =
          getDifferenceType(
            difference,
          );

        const differenceReason =
          cleanOptional(
            parsed.data
              .differenceReason,
          );

        if (
          differenceType !==
            'NONE' &&
          !differenceReason
        ) {
          throw new CashDrawerActionError(
            differenceType ===
              'EXTRA'
              ? 'Explain why counted cash is more than expected.'
              : 'Explain why counted cash is less than expected.',
          );
        }

        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              state.drawer.id,

            createdByUserId:
              user.id,

            movementType:
              'CLOSING_COUNT',

            direction:
              'NONE',

            amount:
              parsed.data
                .countedCash,

            reason:
              cleanOptional(
                parsed.data
                  .closingNote,
              ) ||
              'Closing count',
          });

        if (
          differenceType !==
          'NONE'
        ) {
          await tx
            .insert(
              cashDrawerMovements,
            )
            .values({
              drawerId:
                state.drawer.id,

              createdByUserId:
                user.id,

              movementType:
                'CASH_DIFFERENCE',

              direction:
                'NONE',

              amount:
                toMoney(
                  Math.abs(
                    difference,
                  ),
                ),

              reason:
                differenceReason,
            });
        }

        await tx
          .update(
            cashDrawers,
          )
          .set({
            closedByUserId:
              user.id,

            status:
              'CLOSED',

            expectedCashAtClose:
              toMoney(
                state.expectedCash,
              ),

            countedCash:
              parsed.data
                .countedCash,

            differenceAmount:
              toMoney(
                Math.abs(
                  difference,
                ),
              ),

            differenceType,
            differenceReason,

            closingNote:
              cleanOptional(
                parsed.data
                  .closingNote,
              ),

            closedAt:
              new Date(),

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              cashDrawers.id,
              state.drawer.id,
            ),
          );
      },
    );
  } catch (error) {
    if (
      error instanceof
      CashDrawerActionError
    ) {
      redirect(
        `/money?error=${encodeURIComponent(
          error.message,
        )}`,
      );
    }

    throw error;
  }

  revalidatePath('/money');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  redirect(
    '/money?drawerClosed=1',
  );
}
