'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@mossetech/db/client';
import { cashDrawerMovements, expenses } from '@mossetech/db/schema';
import { expenseFormSchema } from '@mossetech/validators/expense';
import { requireUser } from '@/lib/auth/session';
import { getPaymentMethodBalance, paymentName } from '@/lib/money/balance';
import { getLockedCurrentDrawerState } from '@/lib/cash-drawer/locking';

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function kigaliDateKey() {
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
      new Date(),
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

export async function createExpenseAction(formData: FormData) {
  const user = await requireUser();

  const parsed = expenseFormSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    amount: formData.get('amount') || '0',
    paymentMethod: formData.get('paymentMethod'),
    expenseDate: formData.get('expenseDate') || undefined,
    notes: formData.get('notes') || undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Check the expense form.';
    redirect(`/expenses?error=${encodeURIComponent(message)}`);
  }

  if (
    parsed.data.paymentMethod ===
      'CASH' &&
    parsed.data.expenseDate &&
    parsed.data.expenseDate !==
      kigaliDateKey()
  ) {
    redirect(
      '/expenses?error=Cash expenses must be recorded for today because they come from the current cash drawer.',
    );
  }

  const expenseAmount = Number(parsed.data.amount);

  if (expenseAmount <= 0) {
    redirect('/expenses?error=Amount must be above zero.');
  }

  const expenseDate =
    user.role === 'EMPLOYEE'
      ? new Date()
      : parsed.data.expenseDate
        ? new Date(`${parsed.data.expenseDate}T12:00:00`)
        : new Date();

  if (parsed.data.paymentMethod === 'CASH') {
    let cashError:
      | string
      | null =
      null;

    await db.transaction(async (tx) => {
      const state =
        await getLockedCurrentDrawerState(
          tx,
        );

      if (!state) {
        cashError =
          'Open the cash drawer before saving a cash expense.';
        return;
      }

      if (
        expenseAmount >
        state.expectedCash
      ) {
        cashError =
          `Not enough drawer cash. Expected cash is RWF ${state.expectedCash.toLocaleString(
            'en-US',
          )}.`;
        return;
      }

      const [expense] =
        await tx
          .insert(expenses)
          .values({
            recordedByUserId:
              user.id,

            name:
              parsed.data.name,

            category:
              parsed.data.category,

            amount:
              parsed.data.amount,

            paymentMethod:
              'CASH',

            expenseDate,

            notes:
              cleanOptional(
                parsed.data.notes,
              ),
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
            cleanOptional(
              parsed.data.notes,
            )
              ? `${parsed.data.name} / ${parsed.data.notes}`
              : parsed.data.name,

          expenseId:
            expense.id,
        });
    });

    if (cashError) {
      redirect(
        `/expenses?error=${encodeURIComponent(
          cashError,
        )}`,
      );
    }
  } else {
    const availableMoney = await getPaymentMethodBalance(parsed.data.paymentMethod);

    if (expenseAmount > availableMoney) {
      redirect(
        `/expenses?error=${encodeURIComponent(
          `Not enough money in ${paymentName(parsed.data.paymentMethod)}. ${paymentName(
            parsed.data.paymentMethod,
          )} has RWF ${availableMoney.toLocaleString('en-US')}.`,
        )}`,
      );
    }

    await db.insert(expenses).values({
      recordedByUserId:
        user.id,

      name:
        parsed.data.name,

      category:
        parsed.data.category,

      amount:
        parsed.data.amount,

      paymentMethod:
        parsed.data.paymentMethod,
      expenseDate,
      notes: cleanOptional(parsed.data.notes),
    });
  }

  revalidatePath('/expenses');
  revalidatePath('/money');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  redirect('/expenses?added=1');
}
