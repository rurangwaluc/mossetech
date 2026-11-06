export type StockBalanceInput = {
  imported: number;
  sold: number;
  damaged: number;
  restocked: number;
};

/**
 * Original sale items remain in the sold ledger.
 * Only explicitly restockable returns increase
 * sellable inventory.
 *
 * Damaged customer returns do not increase stock.
 */
export function calculateAvailableStock(
  input: StockBalanceInput,
): number {
  const values = Object.values(input);

  if (
    values.some(
      (value) =>
        !Number.isSafeInteger(value) ||
        value < 0,
    )
  ) {
    throw new Error(
      'Stock quantities must be non-negative whole numbers.',
    );
  }

  const result =
    BigInt(input.imported) +
    BigInt(input.restocked) -
    BigInt(input.sold) -
    BigInt(input.damaged);

  if (
    result > BigInt(Number.MAX_SAFE_INTEGER) ||
    result < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error('Stock balance exceeds supported range.');
  }

  return Number(result);
}
