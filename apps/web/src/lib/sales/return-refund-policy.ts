export type ReturnRefundInput = {
  adjustedTotalCents: number;
  paymentsReceivedCents: number;
  previousRefundsCents: number;
  availableDrawerCashCents: number;
  paymentMethod: 'CASH' | 'MOBILE_MONEY' | 'BANK' | 'CARD';
};

export type ReturnRefundDecision = {
  outstandingCents: number;
  refundDueCents: number;
  refundAmountCents: number;
  requiresCashDrawer: boolean;
};

export function prepareReturnRefund(
  input: ReturnRefundInput,
): ReturnRefundDecision {
  const {
    adjustedTotalCents,
    paymentsReceivedCents,
    previousRefundsCents,
    availableDrawerCashCents,
    paymentMethod,
  } = input;

  for (const value of [
    adjustedTotalCents,
    paymentsReceivedCents,
    previousRefundsCents,
    availableDrawerCashCents,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        'Refund accounting requires non-negative integer cents.',
      );
    }
  }

  if (previousRefundsCents > paymentsReceivedCents) {
    throw new Error('Previous refunds exceed received payments.');
  }

  const netPaid =
    BigInt(paymentsReceivedCents) -
    BigInt(previousRefundsCents);

  const difference =
    BigInt(adjustedTotalCents) - netPaid;

  const outstanding =
    difference > BigInt(0) ? difference : BigInt(0);

  const refundDue =
    difference < BigInt(0) ? -difference : BigInt(0);

  if (
    outstanding > BigInt(Number.MAX_SAFE_INTEGER) ||
    refundDue > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error('Refund balance exceeds supported range.');
  }

  const outstandingCents = Number(outstanding);
  const refundDueCents = Number(refundDue);

  if (refundDueCents === 0) {
    return {
      outstandingCents,
      refundDueCents: 0,
      refundAmountCents: 0,
      requiresCashDrawer: false,
    };
  }

  // Non-cash methods require a separate verified payout
  // workflow. Do not record an unverified transfer as paid.
  if (paymentMethod !== 'CASH') {
    throw new Error(
      'Only cash refunds are currently supported.',
    );
  }

  if (availableDrawerCashCents < refundDueCents) {
    throw new Error(
      'Insufficient cash in the current drawer for this refund.',
    );
  }

  return {
    outstandingCents: 0,
    refundDueCents,
    refundAmountCents: refundDueCents,
    requiresCashDrawer: true,
  };
}
