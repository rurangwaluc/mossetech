import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const fileUrl = path =>
  pathToFileURL(resolve(process.cwd(), path)).href;

const mock = fileUrl('paid-duplicate-success-db.test.mjs');
const auth = fileUrl('external-sales-auth.test.mjs');
const cache = fileUrl('external-sales-cache.test.mjs');

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

globalThis.__mossetechTestUser = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'OWNER',
  status: 'ACTIVE',
};

await import(mock);
const state = globalThis.__paidDuplicateTestState;
assert.ok(state, 'Shared test state unavailable');

const { cancelZechariahDuplicateAction } = await import(
  fileUrl('src/lib/external-sales/paid-duplicate-actions.ts')
);

const result = await cancelZechariahDuplicateAction(
  'Mistaken duplicate sale witnessed and verified; payment reconciliation pending.'
);

assert.equal(result.success, true, result.error);
assert.equal(state.genuine.status, 'POSTED');
assert.equal(state.duplicate.status, 'CANCELLED');
assert.equal(state.payment.amount, '735000.00');
assert.equal(state.payment.paymentMethod, 'MOBILE_MONEY');
assert.equal(state.audits.length, 1);
assert.equal(state.audits[0].status, 'APPLIED');
assert.equal(state.audits[0].afterValues.paymentPreserved, true);
assert.equal(
  state.audits[0].afterValues.paymentReconciliation,
  'PENDING'
);

console.log('PASS: Genuine sale remains POSTED');
console.log('PASS: Duplicate sale becomes CANCELLED');
console.log('PASS: Mobile Money payment preserved');
console.log('PASS: Owner audit record created');
console.log('PASS: Reconciliation remains PENDING');

const repeated = await cancelZechariahDuplicateAction(
  'Repeated correction attempt must be rejected.'
);

assert.equal(repeated.success, false);
assert.equal(state.audits.length, 1);

console.log('PASS: Repeated correction rejected');
console.log('PASS: Mocked correction tests complete');
