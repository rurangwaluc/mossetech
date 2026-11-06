import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAvailableStock,
} from './src/lib/sales/stock-return-balance.ts';

const calculate = (overrides = {}) =>
  calculateAvailableStock({
    imported: 10,
    sold: 5,
    damaged: 1,
    restocked: 0,
    ...overrides,
  });

test('unchanged inventory without customer returns', () => {
  assert.equal(calculate(), 4);
});

test('sellable returns increase available stock', () => {
  assert.equal(calculate({ restocked: 2 }), 6);
});

test('original sale remains counted as sold', () => {
  assert.equal(
    calculate({
      imported: 3,
      sold: 3,
      damaged: 0,
      restocked: 2,
    }),
    2,
  );
});

test('damaged returns do not increase sellable stock', () => {
  assert.equal(
    calculate({
      imported: 3,
      sold: 3,
      damaged: 0,
      restocked: 0,
    }),
    0,
  );
});

test('existing stock damages remain deducted', () => {
  assert.equal(calculate({
    restocked: 2,
    damaged: 3,
  }), 4);
});

test('negative stock remains detectable', () => {
  assert.equal(calculate({
    imported: 1,
    sold: 2,
    damaged: 0,
  }), -1);
});

test('rejects invalid quantities', () => {
  for (const value of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() =>
      calculate({ restocked: value }),
    );
  }
});

test('rejects balances outside safe integer range', () => {
  assert.throws(() =>
    calculate({
      imported: Number.MAX_SAFE_INTEGER,
      restocked: 1,
      sold: 0,
      damaged: 0,
    }),
  );
});
