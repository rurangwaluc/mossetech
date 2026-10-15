'use server';

import { requirePermission } from '@/lib/auth/require-permission';

import {
  and,
  eq,
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
} from '@mossetech/db/schema';

import {
  requireOwner,
} from '@/lib/auth/session';
import {
  getLockedCurrentDrawerState,
} from '@/lib/cash-drawer/locking';
import {
  getPaymentMethodBalance,
  paymentName,
} from '@/lib/money/balance';


type PaymentMethod =
  | 'CASH'
  | 'MOBILE_MONEY'
  | 'BANK'
  | 'CARD';


type ExpenseSnapshot = {
  kind: 'EXPENSE_V1';
  expenseId: string;
  version: string;
  recordedByUserId: string;
  name: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  notes: string | null;
};


class ExpenseFixError extends Error {}


function cleanText(
  value:
    | FormDataEntryValue
    | null,
) {
  return String(
    value || '',
  ).trim();
}


function cleanOptional(
  value:
    | FormDataEntryValue
    | null,
) {
  const text =
    cleanText(
      value,
    );

  return text || null;
}


function expenseErrorHref(
  expenseId: string,
  message: string,
) {
  return (
    `/expenses/${expenseId}/edit?error=` +
    encodeURIComponent(
      message,
    )
  );
}


function requestsErrorHref(
  message: string,
) {
  return (
    '/requests?error=' +
    encodeURIComponent(
      message,
    )
  );
}


function revalidateExpensePaths(
  expenseId: string,
) {
  revalidatePath(
    '/expenses',
  );

  revalidatePath(
    `/expenses/${expenseId}`,
  );

  revalidatePath(
    `/expenses/${expenseId}/edit`,
  );

  revalidatePath(
    '/money',
  );

  revalidatePath(
    '/dashboard',
  );

  revalidatePath(
    '/reports',
  );

  revalidatePath(
    '/requests',
  );
}


function kigaliDateKey(
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


function parsePaymentMethod(
  value:
    | FormDataEntryValue
    | null,
): PaymentMethod {
  const text =
    cleanText(
      value,
    );

  if (
    text !== 'CASH' &&
    text !== 'MOBILE_MONEY' &&
    text !== 'BANK' &&
    text !== 'CARD'
  ) {
    throw new ExpenseFixError(
      'Choose how this expense was paid.',
    );
  }

  return text;
}


function parseAmount(
  value:
    | FormDataEntryValue
    | null,
) {
  const amount =
    Number(
      cleanText(
        value,
      ),
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new ExpenseFixError(
      'Amount must be above zero.',
    );
  }

  return amount;
}


function parseExpenseDate(
  value:
    | FormDataEntryValue
    | null,
  currentIso: string,
) {
  const text =
    cleanText(
      value,
    );

  if (!text) {
    return currentIso;
  }

  const current =
    new Date(
      currentIso,
    );

  if (
    text ===
    kigaliDateKey(
      current,
    )
  ) {
    /*
     * Preserve the original exact time when
     * only the date field was left unchanged.
     */
    return currentIso;
  }

  const date =
    new Date(
      `${text}T12:00:00+02:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new ExpenseFixError(
      'Choose a valid expense date.',
    );
  }

  return date.toISOString();
}


function snapshotFromExpense(
  expense: {
    id: string;
    recordedByUserId: string;
    name: string;
    category: string;
    amount: string;
    paymentMethod: PaymentMethod;
    expenseDate: Date;
    notes: string | null;
    updatedAt: Date;
  },
): ExpenseSnapshot {
  return {
    kind:
      'EXPENSE_V1',

    expenseId:
      expense.id,

    version:
      expense.updatedAt
        .toISOString(),

    recordedByUserId:
      expense.recordedByUserId,

    name:
      expense.name,

    category:
      expense.category,

    amount:
      Number(
        expense.amount,
      ),

    paymentMethod:
      expense.paymentMethod,

    expenseDate:
      expense.expenseDate
        .toISOString(),

    notes:
      expense.notes,
  };
}


function snapshotValues(
  value: Record<
    string,
    unknown
  >,
): ExpenseSnapshot {
  const paymentMethod =
    String(
      value.paymentMethod ||
      '',
    );

  if (
    value.kind !==
      'EXPENSE_V1' ||
    typeof value.expenseId !==
      'string' ||
    !value.expenseId ||
    typeof value.version !==
      'string' ||
    typeof value.recordedByUserId !==
      'string' ||
    typeof value.name !==
      'string' ||
    typeof value.category !==
      'string' ||
    (
      paymentMethod !==
        'CASH' &&
      paymentMethod !==
        'MOBILE_MONEY' &&
      paymentMethod !==
        'BANK' &&
      paymentMethod !==
        'CARD'
    )
  ) {
    throw new ExpenseFixError(
      'This expense request is no longer valid.',
    );
  }

  const amount =
    Number(
      value.amount,
    );

  const expenseDate =
    String(
      value.expenseDate ||
      '',
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0 ||
    Number.isNaN(
      new Date(
        expenseDate,
      ).getTime(),
    )
  ) {
    throw new ExpenseFixError(
      'This expense request is no longer valid.',
    );
  }

  return {
    kind:
      'EXPENSE_V1',

    expenseId:
      value.expenseId,

    version:
      value.version,

    recordedByUserId:
      value.recordedByUserId,

    name:
      value.name.trim(),

    category:
      value.category.trim(),

    amount,

    paymentMethod:
      paymentMethod as
        PaymentMethod,

    expenseDate,

    notes:
      typeof value.notes ===
        'string' &&
      value.notes.trim()
        ? value.notes.trim()
        : null,
  };
}


function sameSnapshot(
  left: ExpenseSnapshot,
  right: ExpenseSnapshot,
) {
  return (
    left.expenseId ===
      right.expenseId &&
    left.version ===
      right.version &&
    left.recordedByUserId ===
      right.recordedByUserId &&
    left.name ===
      right.name &&
    left.category ===
      right.category &&
    left.amount ===
      right.amount &&
    left.paymentMethod ===
      right.paymentMethod &&
    left.expenseDate ===
      right.expenseDate &&
    left.notes ===
      right.notes
  );
}


function sameEditableValues(
  left: ExpenseSnapshot,
  right: ExpenseSnapshot,
) {
  return (
    left.name ===
      right.name &&
    left.category ===
      right.category &&
    left.amount ===
      right.amount &&
    left.paymentMethod ===
      right.paymentMethod &&
    left.expenseDate ===
      right.expenseDate &&
    left.notes ===
      right.notes
  );
}


function validateAfter(
  after: ExpenseSnapshot,
) {
  if (!after.name) {
    throw new ExpenseFixError(
      'Enter the expense name.',
    );
  }

  if (!after.category) {
    throw new ExpenseFixError(
      'Enter the expense category.',
    );
  }

  if (
    after.name.length >
    180
  ) {
    throw new ExpenseFixError(
      'Expense name is too long.',
    );
  }

  if (
    after.category.length >
    120
  ) {
    throw new ExpenseFixError(
      'Expense category is too long.',
    );
  }

  if (
    !Number.isFinite(
      after.amount,
    ) ||
    after.amount <= 0
  ) {
    throw new ExpenseFixError(
      'Amount must be above zero.',
    );
  }

  if (
    Number.isNaN(
      new Date(
        after.expenseDate,
      ).getTime(),
    )
  ) {
    throw new ExpenseFixError(
      'Choose a valid expense date.',
    );
  }
}


async function applyExpenseFix(
  expenseId: string,
  before: ExpenseSnapshot,
  after: ExpenseSnapshot,
  actorId: string,
  reason: string,
  pendingCorrectionId:
    | string
    | null,
) {
  validateAfter(
    after,
  );

  /*
   * The overall payment-method balance reads
   * directly from expenses.
   *
   * When the corrected expense remains in the same
   * non-cash method, add its old amount back before
   * checking whether the corrected amount can fit.
   */
  if (
    after.paymentMethod !==
    'CASH'
  ) {
    const available =
      await getPaymentMethodBalance(
        after.paymentMethod,
      );

    const oldAmountRestored =
      before.paymentMethod ===
      after.paymentMethod
        ? before.amount
        : 0;

    if (
      after.amount >
      available +
        oldAmountRestored
    ) {
      throw new ExpenseFixError(
        `Not enough money in ${paymentName(
          after.paymentMethod,
        )}.`,
      );
    }
  }

  await db.transaction(
    async (tx) => {
      const [currentExpense] =
        await tx
          .select()
          .from(
            expenses,
          )
          .where(
            eq(
              expenses.id,
              expenseId,
            ),
          )
          .limit(1);

      if (!currentExpense) {
        throw new ExpenseFixError(
          'Expense was not found.',
        );
      }

      const current =
        snapshotFromExpense(
          currentExpense,
        );

      if (
        !sameSnapshot(
          current,
          before,
        )
      ) {
        throw new ExpenseFixError(
          'This expense has changed since the request was created. Review it again before applying the fix.',
        );
      }

      const drawerState =
        await getLockedCurrentDrawerState(
          tx,
        );

      const openDrawer =
        drawerState?.drawer;

      let belongsToOpenDrawer =
        false;

      if (openDrawer) {
        const [originalCurrentCashMovement] =
          await tx
            .select()
            .from(
              cashDrawerMovements,
            )
            .where(
              and(
                eq(
                  cashDrawerMovements.drawerId,
                  openDrawer.id,
                ),
                eq(
                  cashDrawerMovements.expenseId,
                  expenseId,
                ),
                eq(
                  cashDrawerMovements.movementType,
                  'CASH_EXPENSE',
                ),
              ),
            )
            .limit(1);

        if (
          originalCurrentCashMovement
        ) {
          belongsToOpenDrawer =
            true;

          if (
            after.paymentMethod ===
              'CASH' &&
            kigaliDateKey(
              new Date(
                after.expenseDate,
              ),
            ) !==
              kigaliDateKey(
                originalCurrentCashMovement.createdAt,
              )
          ) {
            throw new ExpenseFixError(
              'A cash expense must stay on the same day that cash left the drawer.',
            );
          }
        } else if (
          before.paymentMethod !==
            'CASH' &&
          currentExpense.createdAt >=
            openDrawer.openedAt &&
          after.paymentMethod ===
            'CASH' &&
          kigaliDateKey(
            new Date(
              after.expenseDate,
            ),
          ) ===
            kigaliDateKey(
              new Date(),
            )
        ) {
          /*
           * A non-cash expense entered during the
           * current open session can be corrected to
           * Cash today.
           */
          belongsToOpenDrawer =
            true;
        }
      }

      if (
        openDrawer &&
        belongsToOpenDrawer
      ) {
        const beforeCash =
          before.paymentMethod ===
          'CASH'
            ? before.amount
            : 0;

        const afterCash =
          after.paymentMethod ===
          'CASH'
            ? after.amount
            : 0;

        const cashDelta =
          afterCash -
          beforeCash;

        if (
          Math.abs(
            cashDelta,
          ) >= 0.005
        ) {
          const expectedCash =
            drawerState.expectedCash;

          if (
            cashDelta > 0 &&
            cashDelta >
              expectedCash
          ) {
            throw new ExpenseFixError(
              `Not enough drawer cash. Expected cash is RWF ${expectedCash.toLocaleString(
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
                openDrawer.id,

              createdByUserId:
                actorId,

              movementType:
                'EXPENSE_CORRECTION',

              direction:
                cashDelta > 0
                  ? 'OUT'
                  : 'IN',

              amount:
                Math.abs(
                  cashDelta,
                ).toFixed(
                  2,
                ),

              reason:
                `Expense fix / ${reason}`,

              expenseId,
            });
        }
      }

      const now =
        new Date();

      await tx
        .update(
          expenses,
        )
        .set({
          name:
            after.name,

          category:
            after.category,

          amount:
            after.amount.toFixed(
              2,
            ),

          paymentMethod:
            after.paymentMethod,

          expenseDate:
            new Date(
              after.expenseDate,
            ),

          notes:
            after.notes,

          updatedAt:
            now,
        })
        .where(
          eq(
            expenses.id,
            expenseId,
          ),
        );

      const appliedAfter:
        ExpenseSnapshot = {
        ...after,

        version:
          now.toISOString(),
      };

      if (
        pendingCorrectionId
      ) {
        const applied =
          await tx
            .update(
              corrections,
            )
            .set({
              status:
                'APPLIED',

              reviewedByUserId:
                actorId,

              beforeValues:
                before,

              afterValues:
                appliedAfter,

              reviewedAt:
                now,

              appliedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  corrections.id,
                  pendingCorrectionId,
                ),
                eq(
                  corrections.targetType,
                  'EXPENSE',
                ),
                eq(
                  corrections.status,
                  'PENDING',
                ),
              ),
            )
            .returning({
              id:
                corrections.id,
            });

        if (
          applied.length !==
          1
        ) {
          throw new ExpenseFixError(
            'This request is no longer waiting for approval.',
          );
        }
      } else {
        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'EXPENSE',

            targetId:
              expenseId,

            targetLabel:
              `Expense / ${before.name}`,

            requestedByUserId:
              actorId,

            reviewedByUserId:
              actorId,

            status:
              'APPLIED',

            beforeValues:
              before,

            afterValues:
              appliedAfter,

            reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      }
    },
  );
}


export async function submitExpenseFixAction(
  formData: FormData,
) {
  const user =
    await requirePermission('expenses.edit');

  const expenseId =
    cleanText(
      formData.get(
        'expenseId',
      ),
    );

  if (!expenseId) {
    redirect(
      '/expenses',
    );
  }

  const reason =
    cleanText(
      formData.get(
        'reason',
      ),
    );

  if (!reason) {
    redirect(
      expenseErrorHref(
        expenseId,
        'Explain what was entered wrong.',
      ),
    );
  }

  try {
    const [expense] =
      await db
        .select()
        .from(
          expenses,
        )
        .where(
          eq(
            expenses.id,
            expenseId,
          ),
        )
        .limit(1);

    if (!expense) {
      throw new ExpenseFixError(
        'Expense was not found.',
      );
    }

    const before =
      snapshotFromExpense(
        expense,
      );

    const after:
      ExpenseSnapshot = {
      ...before,

      name:
        cleanText(
          formData.get(
            'name',
          ),
        ),

      category:
        cleanText(
          formData.get(
            'category',
          ),
        ),

      amount:
        parseAmount(
          formData.get(
            'amount',
          ),
        ),

      paymentMethod:
        parsePaymentMethod(
          formData.get(
            'paymentMethod',
          ),
        ),

      expenseDate:
        parseExpenseDate(
          formData.get(
            'expenseDate',
          ),
          before.expenseDate,
        ),

      notes:
        cleanOptional(
          formData.get(
            'notes',
          ),
        ),
    };

    validateAfter(
      after,
    );

    if (
      sameEditableValues(
        before,
        after,
      )
    ) {
      throw new ExpenseFixError(
        'Nothing was changed.',
      );
    }

    if (
      user.role ===
      'EMPLOYEE'
    ) {
      const [pending] =
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
                expenseId,
              ),
              eq(
                corrections.status,
                'PENDING',
              ),
            ),
          )
          .limit(1);

      if (pending) {
        throw new ExpenseFixError(
          'A fix request for this expense is already waiting for the owner.',
        );
      }

      await db
        .insert(
          corrections,
        )
        .values({
          targetType:
            'EXPENSE',

          targetId:
            expenseId,

          targetLabel:
            `Expense / ${before.name}`,

          requestedByUserId:
            user.id,

          status:
            'PENDING',

          beforeValues:
            before,

          afterValues:
            after,

          reason,
        });

      revalidateExpensePaths(
        expenseId,
      );

      redirect(
        `/expenses/${expenseId}?requestSent=1`,
      );
    }

    await applyExpenseFix(
      expenseId,
      before,
      after,
      user.id,
      reason,
      null,
    );
  } catch (error) {
    if (
      error instanceof
      ExpenseFixError
    ) {
      redirect(
        expenseErrorHref(
          expenseId,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateExpensePaths(
    expenseId,
  );

  redirect(
    `/expenses/${expenseId}?fixed=1`,
  );
}


export async function approveExpenseFixRequestAction(
  formData: FormData,
) {
  const owner =
    await requireOwner();

  const correctionId =
    cleanText(
      formData.get(
        'correctionId',
      ),
    );

  if (!correctionId) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  const [request] =
    await db
      .select()
      .from(
        corrections,
      )
      .where(
        and(
          eq(
            corrections.id,
            correctionId,
          ),
          eq(
            corrections.targetType,
            'EXPENSE',
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  if (!request) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  try {
    const before =
      snapshotValues(
        request.beforeValues,
      );

    const after =
      snapshotValues(
        request.afterValues,
      );

    await applyExpenseFix(
      request.targetId,
      before,
      after,
      owner.id,
      request.reason,
      request.id,
    );
  } catch (error) {
    if (
      error instanceof
      ExpenseFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateExpensePaths(
    request.targetId,
  );

  redirect(
    '/requests?approved=1',
  );
}
