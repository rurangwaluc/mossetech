import {
  eq,
  isNull,
} from 'drizzle-orm';

import { db } from '@mossetech/db/client';

import {
  expenses,
  externalCustomerPayments,
  externalSupplierSettlements,
  moneyAdditions,
  moneyTransfers,
  salePayments,
} from '@mossetech/db/schema';

export type PaymentMethod =
  | 'CASH'
  | 'MOBILE_MONEY'
  | 'BANK'
  | 'CARD';

export const paymentMethods:
  PaymentMethod[] = [
    'CASH',
    'MOBILE_MONEY',
    'BANK',
    'CARD',
  ];

export function paymentName(
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

export async function getMoneyBalances() {
  const [
    paymentList,
    expenseList,
    transferList,
    additionList,
    externalCustomerList,
    externalSupplierList,
  ] = await Promise.all([
    db
      .select()
      .from(salePayments)
      .where(
        eq(
          salePayments.isActive,
          true,
        ),
      ),

    db
      .select()
      .from(expenses),

    db
      .select()
      .from(moneyTransfers)
      .where(
        isNull(
          moneyTransfers.reversedAt,
        ),
      ),

    db
      .select()
      .from(moneyAdditions)
      .where(
        isNull(
          moneyAdditions.reversedAt,
        ),
      ),

    db
      .select()
      .from(externalCustomerPayments),

    db
      .select()
      .from(externalSupplierSettlements),
  ]);

  return paymentMethods.map(
    (method) => {
      const customerIn =
        paymentList
          .filter(
            (payment) =>
              payment
                .paymentMethod ===
              method,
          )
          .reduce(
            (sum, payment) =>
              sum +
              Number(
                payment
                  .receivedAmount,
              ),
            0,
          );

      const customerReturnsOut =
        paymentList
          .filter(
            (payment) =>
              payment
                .returnMethod ===
              method,
          )
          .reduce(
            (sum, payment) =>
              sum +
              Number(
                payment
                  .returnedAmount,
              ),
            0,
          );

      const addedMoney =
        additionList
          .filter(
            (addition) =>
              addition
                .paymentMethod ===
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
              expense
                .paymentMethod ===
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
              transfer
                .toPaymentMethod ===
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
              transfer
                .fromPaymentMethod ===
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

      const moneyIn =
        addedMoney +
        customerIn +
        externalCustomerIn +
        transferIn;

      const moneyOut =
        customerReturnsOut +
        expensesOut +
        externalSupplierOut +
        transferOut;

      return {
        method,

        name:
          paymentName(
            method,
          ),

        balance:
          moneyIn -
          moneyOut,

        moneyIn,
        moneyOut,
      };
    },
  );
}

export async function getPaymentMethodBalance(
  method: PaymentMethod,
) {
  const balances =
    await getMoneyBalances();

  return (
    balances.find(
      (balance) =>
        balance.method ===
        method,
    )?.balance || 0
  );
}
