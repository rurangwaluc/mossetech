export type MinimumPriceLine = {
  name: string;
  quantity: number;
  agreedUnitPrice: number;
  minimumUnitPrice: string | number | null;
};

export type MinimumPriceResult =
  | {
      valid: true;
      minimumTotal: number;
      maximumDiscount: number;
    }
  | {
      valid: false;
      error: string;
    };

function toCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  const scaled = value * 100;
  const rounded = Math.round(scaled);

  if (
    !Number.isSafeInteger(rounded) ||
    Math.abs(scaled - rounded) > 0.000001
  ) {
    return null;
  }

  return rounded;
}

export function validateMinimumSellingPrices(
  lines: MinimumPriceLine[],
  discountAmount: number,
): MinimumPriceResult {
  const discountCents = toCents(discountAmount);

  if (!lines.length || discountCents === null) {
    return {
      valid: false,
      error: 'Invalid sale prices or discount.',
    };
  }

  const checked: {
    name: string;
    agreedCents: number;
    minimumCents: number;
  }[] = [];

  let subtotalCents = 0;
  let minimumTotalCents = 0;

  for (const line of lines) {
    const minimum =
      line.minimumUnitPrice === null
        ? null
        : Number(line.minimumUnitPrice);

    if (minimum === null || minimum <= 0) {
      return {
        valid: false,
        error: `Moses must set a minimum selling price for ${line.name} before it can be sold.`,
      };
    }

    const agreedCents = toCents(line.agreedUnitPrice);
    const minimumCents = toCents(minimum);

    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      agreedCents === null ||
      agreedCents <= 0 ||
      minimumCents === null ||
      minimumCents <= 0
    ) {
      return {
        valid: false,
        error: `Enter valid prices and quantity for ${line.name}.`,
      };
    }

    if (agreedCents < minimumCents) {
      return {
        valid: false,
        error: `${line.name} cannot be sold below its minimum selling price.`,
      };
    }

    subtotalCents += agreedCents * line.quantity;
    minimumTotalCents += minimumCents * line.quantity;

    if (
      !Number.isSafeInteger(subtotalCents) ||
      !Number.isSafeInteger(minimumTotalCents)
    ) {
      return {
        valid: false,
        error: 'Sale amount exceeds the supported range.',
      };
    }

    checked.push({
      name: line.name,
      agreedCents,
      minimumCents,
    });
  }

  if (discountCents > subtotalCents) {
    return {
      valid: false,
      error: 'Discount cannot exceed the sale subtotal.',
    };
  }

  const finalCents = subtotalCents - discountCents;

  // Proportional basket discount. Compare exact ratios using
  // integers, so rounding cannot bypass a product minimum.
  for (const line of checked) {
    if (
      BigInt(line.agreedCents) * BigInt(finalCents) <
      BigInt(line.minimumCents) * BigInt(subtotalCents)
    ) {
      return {
        valid: false,
        error: `Discount would reduce ${line.name} below its minimum selling price.`,
      };
    }
  }

  // The basket total required to keep every individual
  // product at or above its minimum after discount.
  let requiredTotalCents = BigInt(0);

  for (const line of checked) {
    const numerator =
      BigInt(line.minimumCents) * BigInt(subtotalCents);
    const denominator = BigInt(line.agreedCents);
    const required =
      (numerator + denominator - BigInt(1)) / denominator;

    if (required > requiredTotalCents) {
      requiredTotalCents = required;
    }
  }

  return {
    valid: true,
    minimumTotal: minimumTotalCents / 100,
    maximumDiscount:
      Number(BigInt(subtotalCents) - requiredTotalCents) / 100,
  };
}
