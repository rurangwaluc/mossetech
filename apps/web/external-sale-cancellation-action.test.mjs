import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = path =>
  pathToFileURL(resolve(process.cwd(), path)).href;

const mock = url('external-sale-cancellation-db.test.mjs');
const auth = url('external-sales-auth.test.mjs');
const cache = url('external-sales-cache.test.mjs');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@mossetech/db/client') {
      return { url: mock, shortCircuit: true };
    }
    if (specifier === '@/lib/auth/session') {
      return { url: auth, shortCircuit: true };
    }
    if (specifier === 'next/cache') {
      return { url: cache, shortCircuit: true };
    }
    if (specifier === 'server-only') {
      return {
        url: 'data:text/javascript,export%20%7B%7D',
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const ownerId = randomUUID();

globalThis.__cancellationTestState = {
  sale: null,
  customerPayments: false,
  supplierPayments: false,
  audits: [],
};

const state = globalThis.__cancellationTestState;

function reset() {
  state.sale = {
    id: randomUUID(),
    status: 'POSTED',
    customerName: 'Test Customer',
    productName: 'Test Laptop',
    customerTotal: '735000.00',
    agreedSupplierTotal: '680000.00',
  };
  state.customerPayments = false;
  state.supplierPayments = false;
  state.audits = [];
  globalThis.__mossetechTestUser = {
    id: ownerId,
    role: 'OWNER',
    status: 'ACTIVE',
  };
}

const { cancelUnpaidExternalSaleAction: cancel } =
  await import(url('src/lib/external-sales/cancellation-actions.ts'));

let passed = 0;

async function test(name, callback) {
  await callback();
  passed++;
  console.log(`PASS | ${name}`);
}

reset();

await test('01 | Employee authorization rejected', async () => {
  globalThis.__mossetechTestUser = {
    id: randomUUID(),
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    grants: [],
  };

  await assert.rejects(
    cancel(state.sale.id, 'Mistaken duplicate sale'),
    /TEST_OWNER_REQUIRED/
  );
  assert.equal(state.sale.status, 'POSTED');
  assert.equal(state.audits.length, 0);
});

reset();

await test('02 | Invalid cancellation reason rejected', async () => {
  const result = await cancel(state.sale.id, 'Short');
  assert.equal(result.success, false);
  assert.equal(state.sale.status, 'POSTED');
  assert.equal(state.audits.length, 0);
});

reset();
state.customerPayments = true;

await test('03 | Customer payment blocks cancellation', async () => {
  const result = await cancel(state.sale.id, 'Mistaken duplicate sale');
  assert.equal(result.success, false);
  assert.equal(state.sale.status, 'POSTED');
  assert.equal(state.audits.length, 0);
});

reset();
state.supplierPayments = true;

await test('04 | Supplier settlement blocks cancellation', async () => {
  const result = await cancel(state.sale.id, 'Mistaken duplicate sale');
  assert.equal(result.success, false);
  assert.equal(state.sale.status, 'POSTED');
  assert.equal(state.audits.length, 0);
});

reset();

await test('05 | Unpaid sale cancellation succeeds', async () => {
  const result = await cancel(state.sale.id, 'Mistaken duplicate sale');
  assert.equal(result.success, true, result.error);
  assert.equal(state.sale.status, 'CANCELLED');
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].status, 'APPLIED');
  assert.equal(state.audits[0].requestedByUserId, ownerId);
  assert.equal(state.audits[0].beforeValues.status, 'POSTED');
  assert.equal(state.audits[0].afterValues.status, 'CANCELLED');
});

await test('06 | Repeated cancellation rejected', async () => {
  const result = await cancel(state.sale.id, 'Mistaken duplicate sale');
  assert.equal(result.success, false);
  assert.equal(state.audits.length, 1);
});

console.log(`\nPASS: ${passed} cancellation action tests`);
console.log('Mock database only. No PostgreSQL connection.');
