'use server';

import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  debtPayments,
  salePayments,
  sales,
} from '@mossetech/db/schema';
import { debtPaymentSchema } from '@mossetech/validators/debt';
import { requireUser } from '@/lib/auth/session';
import { lockCurrentOpenDrawer } from '@/lib/cash-drawer/locking';

export type DebtPaymentState = {
  error?: string;
  success?: string;
};

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function toMoney(value: number) {
  return value.toFixed(2);
}

export async function recordDebtPaymentAction(
  _previousState: DebtPaymentState,
  formData: FormData,
): Promise<DebtPaymentState> {
  const user = await requireUser();

  const parsed = debtPaymentSchema.safeParse({
    saleId: formData.get('saleId'),
    paymentMethod: formData.get('paymentMethod'),
    amount: formData.get('amount') || '0',
    notes: formData.get('notes') || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Check the payment form.',
    };
  }

  const amount = Number(parsed.data.amount);

  if (amount <= 0) {
    return {
      error: 'Payment amount must be above zero.',
    };
  }

  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, parsed.data.saleId))
    .limit(1);

  if (!sale) {
    return {
      error: 'Debt was not found.',
    };
  }

  const currentBalance = Number(
    sale.balanceAmount,
  );

  if (currentBalance <= 0) {
    return {
      error: 'This debt is already cleared.',
    };
  }

  if (amount > currentBalance) {
    return {
      error: 'Payment cannot be higher than the unpaid amount.',
    };
  }

  const customerName =
    sale.customerName ||
    'Walk-in customer';

  try {
    await db.transaction(async (tx) => {
      /*
       * Update the balance atomically.
       *
       * PostgreSQL will re-check this condition
       * if another payment changes the same sale
       * while this transaction is waiting.
       */
      const [updatedSale] = await tx
        .update(sales)
        .set({
          paidAmount: sql`${sales.paidAmount} + ${toMoney(amount)}`,
          balanceAmount: sql`${sales.balanceAmount} - ${toMoney(amount)}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sales.id,
              sale.id,
            ),
            gte(
              sales.balanceAmount,
              toMoney(amount),
            ),
          ),
        )
        .returning({
          id: sales.id,
        });

      if (!updatedSale) {
        throw new Error(
          'The unpaid amount changed. Refresh and check the remaining balance.',
        );
      }

      let openDrawer:
        | Awaited<
            ReturnType<
              typeof lockCurrentOpenDrawer
            >
          >
        | undefined;

      if (
        parsed.data.paymentMethod ===
        'CASH'
      ) {
        const drawer =
          await lockCurrentOpenDrawer(
            tx,
          );

        if (!drawer) {
          throw new Error(
            'Open the cash drawer before saving a cash payment.',
          );
        }

        openDrawer = drawer;
      }

      const [debtPayment] =
        await tx
          .insert(
            debtPayments,
          )
          .values({
            saleId:
              sale.id,
            receivedByUserId:
              user.id,
            paymentMethod:
              parsed.data
                .paymentMethod,
            amount:
              toMoney(
                amount,
              ),
            notes:
              cleanOptional(
                parsed.data.notes,
              ),
          })
          .returning({
            id:
              debtPayments.id,
            paidAt:
              debtPayments.paidAt,
            createdAt:
              debtPayments.createdAt,
          });

      if (!debtPayment) {
        throw new Error(
          'Payment history could not be saved.',
        );
      }

      /*
       * Keep debt_payments temporarily for compatibility,
       * but every new later payment also enters the
       * permanent unified payment ledger.
       */
      await tx
        .insert(
          salePayments,
        )
        .values({
          saleId:
            sale.id,
          receivedByUserId:
            user.id,
          sourceDebtPaymentId:
            debtPayment.id,
          paymentType:
            'LATER_PAYMENT',
          paymentMethod:
            parsed.data
              .paymentMethod,
          receivedAmount:
            toMoney(
              amount,
            ),
          appliedAmount:
            toMoney(
              amount,
            ),
          returnedAmount:
            toMoney(0),
          returnMethod:
            null,
          extraKeptAmount:
            toMoney(0),
          extraReason:
            null,
          notes:
            cleanOptional(
              parsed.data.notes,
            ),
          paidAt:
            debtPayment.paidAt,
          createdAt:
            debtPayment.createdAt,
        });


      if (openDrawer) {
        await tx
          .insert(
            cashDrawerMovements,
          )
          .values({
            drawerId:
              openDrawer.id,
            createdByUserId:
              user.id,
            movementType:
              'CASH_DEBT_PAYMENT',
            direction: 'IN',
            amount:
              toMoney(amount),
            reason:
              `Unpaid sale payment / ${customerName}`,
            saleId: sale.id,
          });
      }
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Payment could not be saved.',
    };
  }

  revalidatePath('/debts');
  revalidatePath(`/debts/${sale.id}`);
  revalidatePath(`/sales/${sale.id}`);
  revalidatePath('/sales');
  revalidatePath('/money');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  return {
    success: 'Payment saved.',
  };
}
