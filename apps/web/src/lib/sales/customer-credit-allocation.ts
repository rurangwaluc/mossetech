/** Pure cents-only allocation. No DB writes and no movement of money. */
export function calculateCustomerCreditAllocation(input: {
  salePaidCents: number;
  adjustedTotalCents: number;
  previouslyIssuedCreditCents: number;
  totalCreditEntitlementCents: number;
}) {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid ${name}`);
    }
  }
  const newlyOwedCreditCents = Math.max(
    0, input.salePaidCents - input.adjustedTotalCents,
  );
  const newSalePaidCents = input.salePaidCents - newlyOwedCreditCents;
  const outstandingCents = input.adjustedTotalCents - newSalePaidCents;
  if (input.totalCreditEntitlementCents !==
      input.previouslyIssuedCreditCents + newlyOwedCreditCents) {
    throw new Error('Customer credit entitlement does not reconcile.');
  }
  if (outstandingCents < 0) {
    throw new Error('Negative outstanding amount.');
  }
  return { newlyOwedCreditCents, newSalePaidCents, outstandingCents };
}
