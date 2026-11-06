import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareReturnRefund,
} from './src/lib/sales/return-refund-policy.ts';

const decide = (overrides = {}) =>
  prepareReturnRefund({
    adjustedTotalCents: 50000,
    paymentsReceivedCents: 30000,
    previousRefundsCents: 0,
    availableDrawerCashCents: 100000,
    paymentMethod: 'CASH',
    ...overrides,
  });

test('partial payment leaves outstanding debt', () => {
  const result = decide();

  assert.equal(result.outstandingCents, 20000);
  assert.equal(result.refundDueCents, 0);
  assert.equal(result.requiresCashDrawer, false);
});

test('fully paid sale needs no refund', () => {
  const result = decide({
    paymentsReceivedCents: 50000,
  });

  assert.equal(result.outstandingCents, 0);
  assert.equal(result.refundAmountCents, 0);
});

test('overpayment requires exact cash refund', () => {
  const result = decide({
    adjustedTotalCents: 20000,
    paymentsReceivedCents: 50000,
  });

  assert.equal(result.refundDueCents, 30000);
  assert.equal(result.refundAmountCents, 30000);
  assert.equal(result.requiresCashDrawer, true);
});

test('prior refunds reduce remaining refundable money', () => {
  const result = decide({
    adjustedTotalCents: 20000,
    paymentsReceivedCents: 50000,
    previousRefundsCents: 10000,
  });

  assert.equal(result.refundAmountCents, 20000);
});

test('refund is rejected if drawer cash is insufficient', () => {
  assert.throws(
    () => decide({
      adjustedTotalCents: 20000,
      paymentsReceivedCents: 50000,
      availableDrawerCashCents: 29999,
    }),
    /Insufficient cash/,
  );
});

test('cash refund is allowed at exact drawer balance', () => {
  const result = decide({
    adjustedTotalCents: 20000,
    paymentsReceivedCents: 50000,
    availableDrawerCashCents: 30000,
  });

  assert.equal(result.refundAmountCents, 30000);
});

test('unverified non-cash refunds are rejected', () => {
  for (const paymentMethod of [
    'MOBILE_MONEY',
    'BANK',
    'CARD',
  ]) {
    assert.throws(
      () => decide({
        adjustedTotalCents: 20000,
        paymentsReceivedCents: 50000,
        paymentMethod,
      }),
      /Only cash refunds/,
    );
  }
});

test('previous refunds cannot exceed received money', () => {
  assert.throws(
    () => decide({
      previousRefundsCents: 30001,
    }),
    /Previous refunds exceed/,
  );
});

test('invalid money amounts are rejected', () => {
  for (const value of [-1, 0.5, NaN, Infinity]) {
    assert.throws(
      () => decide({
        paymentsReceivedCents: value,
      }),
    );
  }
});
