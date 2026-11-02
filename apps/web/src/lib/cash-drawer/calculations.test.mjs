import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getDrawerCashIn,
  getDrawerCashOut,
  getExpectedDrawerCash,
  getDifferenceType,
} from './calculations.ts';

const movement = (direction, amount, movementType) => ({
  direction,
  amount,
  movementType,
});

test('opening cash plus receipts minus payouts', () => {
  const drawer = { openingCash: '50000.00' };
  const movements = [
    movement('IN', '100000.00', 'SALE'),
    movement('OUT', '20000.00', 'EXPENSE'),
  ];

  assert.equal(getDrawerCashIn(movements), 100000);
  assert.equal(getDrawerCashOut(movements), 20000);
  assert.equal(getExpectedDrawerCash(drawer, movements), 130000);
});

test('opening and closing records are not double-counted', () => {
  const drawer = { openingCash: '50000.00' };
  const movements = [
    movement('IN', '50000.00', 'OPENING_CASH'),
    movement('IN', '25000.00', 'SALE'),
    movement('OUT', '75000.00', 'CLOSING_COUNT'),
    movement('OUT', '1000.00', 'CASH_DIFFERENCE'),
  ];

  assert.equal(getExpectedDrawerCash(drawer, movements), 75000);
});

test('missing and extra cash are classified correctly', () => {
  assert.equal(getDifferenceType(-500), 'MISSING');
  assert.equal(getDifferenceType(500), 'EXTRA');
  assert.equal(getDifferenceType(0), 'NONE');
});

test('general Money additions cannot accept CASH', async () => {
  const { externalMoneyAdditionSchema } = await import(
    '../../../../../packages/validators/src/money.ts'
  );

  const input = {
    paymentMethod: 'CASH',
    amount: '1000.00',
    reason: 'Test cash addition',
  };

  assert.equal(
    externalMoneyAdditionSchema.safeParse(input).success,
    false
  );
});
