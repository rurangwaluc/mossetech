import { eq, isNull } from 'drizzle-orm';

import {
  expenses,
  externalCustomerPayments,
  externalSupplierSettlements,
  moneyAdditions,
  moneyTransfers,
  salePayments,
} from '@mossetech/db/schema';

import type {
  DbTransaction,
} from '@/lib/cash-drawer/locking';

import type {
  PaymentMethod,
} from '@/lib/money/balance';

export async function getPaymentMethodBalanceInTransaction(
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
