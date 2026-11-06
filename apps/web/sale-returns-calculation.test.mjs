import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateReturnBalance,
} from './src/lib/sales/returns-calculation.ts';

const calculate = (values) => calculateReturnBalance({
  originalTotalCents: 39000000,
  totalReturnCreditCents: 4000000,
  totalPaymentsReceivedCents: 35000000,
  refundsAlreadyIssuedCents: 0,
  ...values,
});

test('customer keeps paid laptop and returns two unpaid products', () => {
  assert.deepEqual(calculate({}), {
    adjustedTotalCents: 35000000,
    netPaidCents: 35000000,
    outstandingCents: 0,
    refundDueCents: 0,
  });
});

test('partial payment leaves outstanding debt', () => {
  const result = calculate({
    totalPaymentsReceivedCents: 20000000,
  });
  assert.equal(result.outstandingCents, 15000000);
  assert.equal(result.refundDueCents, 0);
});

test('overpayment creates refund due, not negative debt', () => {
  const result = calculate({
    totalPaymentsReceivedCents: 39000000,
  });
  assert.equal(result.outstandingCents, 0);
  assert.equal(result.refundDueCents, 4000000);
});

test('previous refunds reduce the outstanding refund', () => {
  const result = calculate({
    totalPaymentsReceivedCents: 39000000,
    refundsAlreadyIssuedCents: 1500000,
  });
  assert.equal(result.refundDueCents, 2500000);
  assert.equal(result.netPaidCents, 37500000);
});

test('a zero-value return preserves existing balances', () => {
  const result = calculate({
    totalReturnCreditCents: 0,
  });
  assert.equal(result.adjustedTotalCents, 39000000);
  assert.equal(result.outstandingCents, 4000000);
});

test('rejects return credit exceeding the sale', () => {
  assert.throws(() => calculate({
    totalReturnCreditCents: 39000001,
  }));
});

test('rejects refunded money exceeding payments', () => {
  assert.throws(() => calculate({
    refundsAlreadyIssuedCents: 35000001,
  }));
});

test('rejects fractional, negative and unsafe money values', () => {
  for (const amount of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculate({
      totalReturnCreditCents: amount,
    }));
  }
});
