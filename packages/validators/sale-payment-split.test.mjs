import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const {
  calculateSalePaymentSplit: calculate,
} = await import(
  pathToFileURL(
    resolve('src/sale-payment-split.ts')
  ).href
);

let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS | ${String(passed).padStart(2, '0')} | ${name}`);
}

const part = (method, amount) => ({
  method,
  amount,
});

test('Cash only', () => {
  const result = calculate('500000', [
    part('CASH', '500000'),
  ]);
  assert.equal(result.balance, '0.00');
  assert.equal(result.hasCash, true);
});

test('MoMo only', () => {
  const result = calculate('500000', [
    part('MOBILE_MONEY', '500000'),
  ]);
  assert.equal(result.balance, '0.00');
});

test('Bank only', () => {
  const result = calculate('500000', [
    part('BANK', '500000'),
  ]);
  assert.equal(result.balance, '0.00');
});

test('Cash + MoMo', () => {
  const result = calculate('500000', [
    part('CASH', '200000'),
    part('MOBILE_MONEY', '300000'),
  ]);
  assert.equal(result.received, '500000.00');
  assert.equal(result.payments.length, 2);
});

test('Cash + Bank', () => {
  const result = calculate('500000', [
    part('CASH', '200000'),
    part('BANK', '300000'),
  ]);
  assert.equal(result.balance, '0.00');
});

test('MoMo + Bank', () => {
  const result = calculate('500000', [
    part('MOBILE_MONEY', '200000'),
    part('BANK', '300000'),
  ]);
  assert.equal(result.hasCash, false);
});

test('Cash + MoMo + Bank', () => {
  const result = calculate('500000', [
    part('CASH', '150000'),
    part('MOBILE_MONEY', '200000'),
    part('BANK', '150000'),
  ]);
  assert.equal(result.received, '500000.00');
  assert.equal(result.balance, '0.00');
  assert.equal(result.payments.length, 3);
});

test('Partial payment leaves debt', () => {
  const result = calculate('500000', [
    part('CASH', '100000'),
    part('MOBILE_MONEY', '150000'),
  ]);
  assert.equal(result.balance, '250000.00');
});

test('No payment leaves full balance', () => {
  const result = calculate('500000', []);
  assert.equal(result.received, '0.00');
  assert.equal(result.balance, '500000.00');
});

test('Zero payment entries excluded', () => {
  const result = calculate('500000', [
    part('CASH', '0'),
    part('BANK', '500000'),
  ]);
  assert.equal(result.payments.length, 1);
  assert.equal(result.hasCash, false);
});

test('Reject overpayment', () => {
  assert.throws(() => calculate('500000', [
    part('CASH', '300000'),
    part('BANK', '300000'),
  ]));
});

test('Reject duplicate methods', () => {
  assert.throws(() => calculate('500000', [
    part('CASH', '100000'),
    part('CASH', '200000'),
  ]));
});

test('Reject invalid and negative amounts', () => {
  for (const value of ['-100', 'abc', '1.234', '']) {
    assert.throws(() => calculate('500000', [
      part('BANK', value),
    ]));
  }
});

test('Exact decimal arithmetic', () => {
  const result = calculate('0.30', [
    part('CASH', '0.10'),
    part('MOBILE_MONEY', '0.20'),
  ]);
  assert.equal(result.balance, '0.00');
});

console.log(`\nRESULT: ${passed}/14 PASSED`);
