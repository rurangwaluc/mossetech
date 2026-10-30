/**
 * External sales financial calculations.
 *
 * All monetary values use integer cents internally.
 * These functions do not write to the database.
 */

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

const MAX_CENTS = 999999999999;

export function parseMoney(value: string): number {
  if (!MONEY_PATTERN.test(value)) {
    throw new Error('Enter a valid amount.');
  }

  const [whole, fraction = ''] = value.split('.');

  const cents =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  if (
    !Number.isSafeInteger(cents) ||
    cents > MAX_CENTS
  ) {
    throw new Error('Amount is too large.');
  }

  return cents;
}

export function formatMoney(cents: number): string {
  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(cents) > MAX_CENTS
  ) {
    throw new Error('Invalid money value.');
  }

  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);

  return (
    sign +
    Math.floor(absolute / 100) +
    '.' +
    String(absolute % 100).padStart(2, '0')
  );
}

export type ExternalSaleBalances = {
  grossProfitCents: number;
  customerBalanceCents: number;
  supplierBalanceCents: number;
  netCashCollectedCents: number;
};

export function calculateExternalSaleBalances(input: {
  customerTotalCents: number;
  supplierTotalCents: number;
  customerPaidCents: number;
  supplierPaidCents: number;
}): ExternalSaleBalances {
  const values = Object.values(input);

  if (
    values.some(
      (value) =>
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > MAX_CENTS,
    )
  ) {
    throw new Error('Invalid financial amounts.');
  }

  const {
    customerTotalCents,
    supplierTotalCents,
    customerPaidCents,
    supplierPaidCents,
  } = input;

  if (customerPaidCents > customerTotalCents) {
    throw new Error(
      'Customer payment exceeds the sale total.',
    );
  }

  if (supplierPaidCents > supplierTotalCents) {
    throw new Error(
      'Supplier payment exceeds the agreed amount.',
    );
  }

  return {
    grossProfitCents:
      customerTotalCents - supplierTotalCents,

    customerBalanceCents:
      customerTotalCents - customerPaidCents,

    supplierBalanceCents:
      supplierTotalCents - supplierPaidCents,

    netCashCollectedCents:
      customerPaidCents - supplierPaidCents,
  };
}
