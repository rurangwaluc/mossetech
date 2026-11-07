export function validateSaleReferral(
  nameValue: unknown,
  amountValue: unknown,
  notesValue: unknown,
  total: number,
  paid: number,
  balance: number,
) {
  const name = typeof nameValue === 'string' ? nameValue.trim() : '';
  const amount = typeof amountValue === 'string' ? amountValue.trim() : '';
  const notes = typeof notesValue === 'string' ? notesValue.trim() : '';

  if (!name && !amount && !notes) return null;

  if (
    name.length < 2 ||
    name.length > 160 ||
    notes.length > 1000 ||
    !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount)
  ) {
    throw new Error('Check the referral name and reward amount.');
  }

  const [whole, fraction = ''] = amount.split('.');
  const cents = Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    cents > Math.round(total * 100) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    Math.round(balance * 100) !== 0 ||
    Math.round(paid * 100) !== Math.round(total * 100)
  ) {
    throw new Error(
      'Referral rewards require a fully paid sale and cannot exceed the sale total.'
    );
  }

  return {
    referrerName: name,
    amount: (cents / 100).toFixed(2),
    notes: notes || null,
  };
}
