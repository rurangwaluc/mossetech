export const SALE_PAYMENT_METHODS = [
  'CASH',
  'MOBILE_MONEY',
  'BANK',
  'CARD',
] as const;

export type SalePaymentMethod =
  (typeof SALE_PAYMENT_METHODS)[number];

export type SalePaymentPart = {
  method: SalePaymentMethod;
  amount: string;
};

export class SalePaymentSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalePaymentSplitError';
  }
}

function cents(value: string): number {
  const clean = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    throw new SalePaymentSplitError(
      'Enter a valid payment amount.',
    );
  }

  const [whole, fraction = ''] = clean.split('.');

  const result =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(result)) {
    throw new SalePaymentSplitError(
      'Payment amount is too large.',
    );
  }

  return result;
}

function amount(value: number): string {
  return (value / 100).toFixed(2);
}

export function calculateSalePaymentSplit(
  total: string,
  parts: SalePaymentPart[],
) {
  const totalCents = cents(total);

  if (!Array.isArray(parts)) {
    throw new SalePaymentSplitError(
      'Invalid payment information.',
    );
  }

  const seen = new Set<SalePaymentMethod>();

  const payments = parts.map((part) => {
    if (!SALE_PAYMENT_METHODS.includes(part.method)) {
      throw new SalePaymentSplitError(
        'Choose a valid payment method.',
      );
    }

    if (seen.has(part.method)) {
      throw new SalePaymentSplitError(
        'Enter each payment method only once.',
      );
    }

    seen.add(part.method);

    return {
      method: part.method,
      cents: cents(part.amount),
    };
  }).filter((part) => part.cents > 0);

  const receivedCents = payments.reduce(
    (sum, part) => sum + part.cents,
    0,
  );

  if (!Number.isSafeInteger(receivedCents)) {
    throw new SalePaymentSplitError(
      'Total payment is too large.',
    );
  }

  if (receivedCents > totalCents) {
    throw new SalePaymentSplitError(
      'Payments exceed the sale total.',
    );
  }

  return {
    total: amount(totalCents),
    received: amount(receivedCents),
    balance: amount(totalCents - receivedCents),
    hasCash: payments.some(
      (part) => part.method === 'CASH',
    ),
    payments: payments.map((part) => ({
      method: part.method,
      amount: amount(part.cents),
    })),
  };
}
