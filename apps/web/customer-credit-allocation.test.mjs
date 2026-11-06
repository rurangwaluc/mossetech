import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCustomerCreditAllocation as allocate } from './src/lib/sales/customer-credit-allocation.ts';

test('Vincent returns RWF 10,000 item: RWF 6,000 remains owed', () => {
  assert.deepEqual(allocate({salePaidCents:1200000, adjustedTotalCents:1800000, previouslyIssuedCreditCents:0, totalCreditEntitlementCents:0}), {newlyOwedCreditCents:0,newSalePaidCents:1200000,outstandingCents:600000});
});

test('Vincent returns RWF 18,000 item: RWF 2,000 customer credit', () => {
  assert.deepEqual(allocate({salePaidCents:1200000, adjustedTotalCents:1000000, previouslyIssuedCreditCents:0, totalCreditEntitlementCents:200000}), {newlyOwedCreditCents:200000,newSalePaidCents:1000000,outstandingCents:0});
});

test('Vincent returns both products: RWF 12,000 customer credit', () => {
  assert.deepEqual(allocate({salePaidCents:1200000, adjustedTotalCents:0, previouslyIssuedCreditCents:0, totalCreditEntitlementCents:1200000}), {newlyOwedCreditCents:1200000,newSalePaidCents:0,outstandingCents:0});
});

test('second return preserves existing customer credit without issuing it twice', () => {
  assert.deepEqual(allocate({salePaidCents:1000000, adjustedTotalCents:0, previouslyIssuedCreditCents:200000, totalCreditEntitlementCents:1200000}), {newlyOwedCreditCents:1000000,newSalePaidCents:0,outstandingCents:0});
});

test('inconsistent recorded credit is rejected', () => {
  assert.throws(() => allocate({salePaidCents:1000000, adjustedTotalCents:0, previouslyIssuedCreditCents:200000, totalCreditEntitlementCents:200000}), /does not reconcile/);
});
