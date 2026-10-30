import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseMoney,
  formatMoney,
  calculateExternalSaleBalances,
} from './money.ts';

test('parses exact decimal amounts', () => {
  assert.equal(parseMoney('350000'), 35000000);
  assert.equal(parseMoney('0.01'), 1);
  assert.equal(parseMoney('1.20'), 120);
  assert.equal(formatMoney(120), '1.20');
  assert.equal(formatMoney(-5000), '-50.00');
});

test('rejects malformed money', () => {
  for (const value of [
    '-1',
    '1.234',
    '1e4',
    'NaN',
    '1,000',
    ' 100',
    '01',
    '',
  ]) {
    assert.throws(() => parseMoney(value));
  }
});

test('calculates profit and both balances', () => {
  assert.deepEqual(
    calculateExternalSaleBalances({
      customerTotalCents: parseMoney('400000'),
      supplierTotalCents: parseMoney('350000'),
      customerPaidCents: parseMoney('200000'),
      supplierPaidCents: parseMoney('100000'),
    }),
    {
      grossProfitCents: parseMoney('50000'),
      customerBalanceCents: parseMoney('200000'),
      supplierBalanceCents: parseMoney('250000'),
      netCashCollectedCents: parseMoney('100000'),
    },
  );
});

test('supports legitimate loss-making sales', () => {
  const result = calculateExternalSaleBalances({
    customerTotalCents: parseMoney('900'),
    supplierTotalCents: parseMoney('1000'),
    customerPaidCents: 0,
    supplierPaidCents: 0,
  });

  assert.equal(result.grossProfitCents, -10000);
});

test('rejects customer overpayment', () => {
  assert.throws(() =>
    calculateExternalSaleBalances({
      customerTotalCents: 10000,
      supplierTotalCents: 8000,
      customerPaidCents: 10001,
      supplierPaidCents: 0,
    }),
  );
});

test('rejects supplier overpayment', () => {
  assert.throws(() =>
    calculateExternalSaleBalances({
      customerTotalCents: 10000,
      supplierTotalCents: 8000,
      customerPaidCents: 0,
      supplierPaidCents: 8001,
    }),
  );
});

test('rejects invalid ledger values', () => {
  assert.throws(() =>
    calculateExternalSaleBalances({
      customerTotalCents: NaN,
      supplierTotalCents: 0,
      customerPaidCents: 0,
      supplierPaidCents: 0,
    }),
  );

  assert.throws(() =>
    calculateExternalSaleBalances({
      customerTotalCents: -1,
      supplierTotalCents: 0,
      customerPaidCents: 0,
      supplierPaidCents: 0,
    }),
  );
});
