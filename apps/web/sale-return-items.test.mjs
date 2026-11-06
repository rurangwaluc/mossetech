import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareSaleReturn } from './src/lib/sales/return-items.ts';

const items = [
  { id: 'laptop', quantity: 1, unitPriceCents: 35000000 },
  { id: 'mouse', quantity: 2, unitPriceCents: 1500000 },
  { id: 'keyboard', quantity: 1, unitPriceCents: 2500000 },
];

const run = (overrides = {}) => prepareSaleReturn({
  items,
  previousReturns: [],
  requestedReturns: [
    { saleItemId: 'mouse', quantity: 2 },
    { saleItemId: 'keyboard', quantity: 1 },
  ],
  originalDiscountCents: 0,
  ...overrides,
});

test('returns mouse and keyboard while customer keeps laptop', () => {
  const result = run();
  assert.equal(result.originalTotalCents, 40500000);
  assert.equal(result.newReturnCreditCents, 5500000);
  assert.equal(result.adjustedTotalCents, 35000000);
});

test('allows returning one of two identical items', () => {
  const result = run({
    requestedReturns: [{ saleItemId: 'mouse', quantity: 1 }],
  });
  assert.equal(result.newReturnCreditCents, 1500000);
  assert.equal(result.adjustedTotalCents, 39000000);
});

test('rejects returning more than the customer bought', () => {
  assert.throws(() => run({
    requestedReturns: [{ saleItemId: 'mouse', quantity: 3 }],
  }));
});

test('rejects returning an item twice beyond its remaining quantity', () => {
  assert.throws(() => run({
    previousReturns: [{ saleItemId: 'mouse', quantity: 1 }],
    requestedReturns: [{ saleItemId: 'mouse', quantity: 2 }],
  }));
});

test('allows a second partial return within remaining quantity', () => {
  const result = run({
    previousReturns: [{ saleItemId: 'mouse', quantity: 1 }],
    requestedReturns: [{ saleItemId: 'mouse', quantity: 1 }],
  });
  assert.equal(result.previousReturnCreditCents, 1500000);
  assert.equal(result.newReturnCreditCents, 1500000);
  assert.equal(result.totalReturnCreditCents, 3000000);
});

test('preserves the original discount proportionally', () => {
  const result = run({
    originalDiscountCents: 4050000,
  });
  assert.equal(result.originalTotalCents, 36450000);
  assert.equal(result.newReturnCreditCents, 4950000);
  assert.equal(result.adjustedTotalCents, 31500000);
});

test('rejects duplicate requested lines', () => {
  assert.throws(() => run({
    requestedReturns: [
      { saleItemId: 'mouse', quantity: 1 },
      { saleItemId: 'mouse', quantity: 1 },
    ],
  }));
});

test('rejects unknown sale items', () => {
  assert.throws(() => run({
    requestedReturns: [
      { saleItemId: 'unknown', quantity: 1 },
    ],
  }));
});

test('rejects invalid quantities and monetary values', () => {
  assert.throws(() => run({
    requestedReturns: [
      { saleItemId: 'mouse', quantity: 0 },
    ],
  }));
  assert.throws(() => run({
    originalDiscountCents: 50000000,
  }));
  assert.throws(() => run({
    items: [
      { id: 'bad', quantity: 1, unitPriceCents: 0.5 },
    ],
    requestedReturns: [
      { saleItemId: 'bad', quantity: 1 },
    ],
  }));
});
