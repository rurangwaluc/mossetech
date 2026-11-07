import { formatMoney, parseMoney } from '@/lib/external-sales/money';

/** An agreement attached to an external draft; never itself a payment. */
export function validateExternalDraftReferral(
  referrerName: string,
  amount: string,
  notes: string,
  sellingPriceCents: number,
) {
  if (!referrerName && !amount && !notes) return null;

  if (referrerName.length < 2 || referrerName.length > 160 ||
      notes.length > 1000) {
    throw new Error('Check the referrer name and notes.');
  }

  let rewardCents: number;
  try {
    rewardCents = parseMoney(amount);
  } catch {
    throw new Error('Enter a valid referral reward amount.');
  }

  // Match the existing referral reward limit (numeric(12,2) and <=9 whole digits).
  if (rewardCents <= 0 || rewardCents > 99999999999 ||
      rewardCents > sellingPriceCents) {
    throw new Error('Referral reward must be positive and cannot exceed the sale total.');
  }

  return {
    referrerName,
    amount: formatMoney(rewardCents),
    notes: notes || null,
  };
}
