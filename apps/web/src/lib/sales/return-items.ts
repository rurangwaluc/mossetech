export type OriginalSaleItem = {
  id: string;
  quantity: number;
  unitPriceCents: number;
};

export type ReturnQuantity = {
  saleItemId: string;
  quantity: number;
};

export type ReturnItemsInput = {
  items: OriginalSaleItem[];
  previousReturns: ReturnQuantity[];
  requestedReturns: ReturnQuantity[];
  originalDiscountCents: number;
};

export type ReturnItemsResult = {
  originalSubtotalCents: number;
  originalTotalCents: number;
  previousReturnCreditCents: number;
  newReturnCreditCents: number;
  totalReturnCreditCents: number;
  adjustedTotalCents: number;
};

function whole(value: number, label: string, positive = false) {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0)
  ) {
    throw new Error(`${label} must be a valid whole number.`);
  }
}

function safeMoney(value: bigint, label: string): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the supported money range.`);
  }
  return Number(value);
}

/**
 * Validate cumulative returned quantities and calculate the
 * incremental customer credit, including original discounts.
 *
 * The discount is prorated against the value of goods retained.
 * Cumulative calculations prevent repeated rounding drift.
 *
 * No database, stock, or payment operations occur here.
 */
export function prepareSaleReturn(
  input: ReturnItemsInput,
): ReturnItemsResult {
  if (!input.items.length || !input.requestedReturns.length) {
    throw new Error('Select at least one item to return.');
  }

  whole(input.originalDiscountCents, 'Original discount');

  const items = new Map<string, OriginalSaleItem>();

  for (const item of input.items) {
    if (!item.id || items.has(item.id)) {
      throw new Error('Sale items must have unique identifiers.');
    }
    whole(item.quantity, 'Sold quantity', true);
    whole(item.unitPriceCents, 'Unit price');
    items.set(item.id, item);
  }

  function quantities(
    entries: ReturnQuantity[],
    label: string,
  ): Map<string, number> {
    const result = new Map<string, number>();

    for (const entry of entries) {
      const item = items.get(entry.saleItemId);

      if (!item) {
        throw new Error(`${label} contains an unknown sale item.`);
      }

      if (result.has(entry.saleItemId)) {
        throw new Error(`${label} contains a duplicate sale item.`);
      }

      whole(entry.quantity, `${label} quantity`, true);

      if (entry.quantity > item.quantity) {
        throw new Error(`${label} exceeds the quantity sold.`);
      }

      result.set(entry.saleItemId, entry.quantity);
    }

    return result;
  }

  const previous = quantities(input.previousReturns, 'Previous return');
  const requested = quantities(input.requestedReturns, 'New return');

  for (const [id, count] of requested) {
    const item = items.get(id)!;
    const prior = previous.get(id) ?? 0;

    if (count > item.quantity - prior) {
      throw new Error('Return exceeds the remaining eligible quantity.');
    }
  }

  let subtotal = BigInt(0);
  let previouslyRetained = BigInt(0);
  let newlyRetained = BigInt(0);

  for (const item of items.values()) {
    const unitPrice = BigInt(item.unitPriceCents);
    const prior = previous.get(item.id) ?? 0;
    const now = requested.get(item.id) ?? 0;

    subtotal += unitPrice * BigInt(item.quantity);
    previouslyRetained +=
      unitPrice * BigInt(item.quantity - prior);
    newlyRetained +=
      unitPrice * BigInt(item.quantity - prior - now);
  }

  const discount = BigInt(input.originalDiscountCents);

  if (discount > subtotal) {
    throw new Error('Original discount exceeds sale subtotal.');
  }

  if (subtotal === BigInt(0)) {
    throw new Error('A zero-value sale cannot produce a return credit.');
  }

  // Consistent cumulative allocation, including partial returns.
  function adjustedTotal(retainedSubtotal: bigint): bigint {
    const allocatedDiscount =
      (discount * retainedSubtotal) / subtotal;

    return retainedSubtotal - allocatedDiscount;
  }

  const originalTotal = subtotal - discount;
  const priorTotal = adjustedTotal(previouslyRetained);
  const newTotal = adjustedTotal(newlyRetained);

  return {
    originalSubtotalCents: safeMoney(subtotal, 'Subtotal'),
    originalTotalCents: safeMoney(originalTotal, 'Original total'),
    previousReturnCreditCents: safeMoney(
      originalTotal - priorTotal,
      'Previous return credit',
    ),
    newReturnCreditCents: safeMoney(
      priorTotal - newTotal,
      'New return credit',
    ),
    totalReturnCreditCents: safeMoney(
      originalTotal - newTotal,
      'Total return credit',
    ),
    adjustedTotalCents: safeMoney(newTotal, 'Adjusted total'),
  };
}
