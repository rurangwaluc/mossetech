import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const fileUrl = path =>
  pathToFileURL(resolve(process.cwd(), path)).href;

const auth = fileUrl('external-sales-auth.test.mjs');
const cache = fileUrl('external-sales-cache.test.mjs');

registerHooks({
  resolve(specifier, context, nextResolve) {
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

    if (specifier === '@mossetech/db/client') {
      return {
        url: fileUrl('paid-duplicate-blocked-db.test.mjs'),
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

const { cancelZechariahDuplicateAction } = await import(
  fileUrl('src/lib/external-sales/paid-duplicate-actions.ts')
);

globalThis.__mossetechTestUser = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'EMPLOYEE',
  status: 'ACTIVE',
  grants: [],
};

await assert.rejects(
  cancelZechariahDuplicateAction(
    'Mistaken duplicate external sale confirmed by Owner'
  ),
  /TEST_OWNER_REQUIRED/
);

console.log('PASS: Employee cannot execute correction');

globalThis.__mossetechTestUser = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'OWNER',
  status: 'ACTIVE',
};

const invalid = await cancelZechariahDuplicateAction('Short');

assert.equal(invalid.success, false);
console.log('PASS: Invalid reason rejected');

const blocked = await cancelZechariahDuplicateAction(
  'Mistaken duplicate external sale confirmed by Owner'
);

assert.equal(blocked.success, false);
assert.match(blocked.error, /Correction failed/);

console.log('PASS: Failed database transaction cannot report success');
console.log('PASS: No database connection attempted');
