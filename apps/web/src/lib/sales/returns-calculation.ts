export type ReturnBalanceInput = {
  originalTotalCents: number;
  totalReturnCreditCents: number;
  totalPaymentsReceivedCents: number;
  refundsAlreadyIssuedCents: number;
};

export type ReturnBalanceResult = {
  adjustedTotalCents: number;
  netPaidCents: number;
  outstandingCents: number;
  refundDueCents: number;
};

function assertMoney(value: number, name: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${name} must be a non-negative integer amount in cents.`);
  }
}

/**
 * Pure calculation only.
 *
 * Return credits must be independently validated against
 * eligible sale items, quantities, discounts and prior returns.
 *
 * This function never moves money or changes inventory.
 */
export function calculateReturnBalance(
  input: ReturnBalanceInput,
): ReturnBalanceResult {
  const {
    originalTotalCents,
    totalReturnCreditCents,
    totalPaymentsReceivedCents,
    refundsAlreadyIssuedCents,
  } = input;

  for (const [name, amount] of Object.entries(input)) {
    assertMoney(amount, name);
  }

  if (totalReturnCreditCents > originalTotalCents) {
    throw new Error('Return credit exceeds the original sale total.');
  }

  if (refundsAlreadyIssuedCents > totalPaymentsReceivedCents) {
    throw new Error('Refunds exceed customer payments.');
  }

  const adjustedTotalCents =
    originalTotalCents - totalReturnCreditCents;

  const netPaidCents =
    totalPaymentsReceivedCents - refundsAlreadyIssuedCents;

  return {
    adjustedTotalCents,
    netPaidCents,
    outstandingCents: Math.max(0, adjustedTotalCents - netPaidCents),
    refundDueCents: Math.max(0, netPaidCents - adjustedTotalCents),
  };
}
