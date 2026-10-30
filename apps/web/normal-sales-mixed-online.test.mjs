import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq, sql } from 'drizzle-orm';

const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_external_sales_test');
assert.equal(url.username, 'postgres');
assert.notEqual(process.env.VERCEL, '1');

const authUrl = pathToFileURL(
  resolve(process.cwd(), 'external-sales-auth.test.mjs'),
).href;

const redirectUrl = pathToFileURL(
  resolve(process.cwd(), 'normal-sales-test-navigation.mjs'),
).href;

const cacheUrl = pathToFileURL(
  resolve(process.cwd(), 'normal-sales-test-cache.mjs'),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const replacements = {
      'server-only': 'data:text/javascript,export%20%7B%7D',
      '@/lib/auth/require-permission': authUrl,
      'next/navigation': redirectUrl,
      'next/cache': cacheUrl,
    };

    if (Object.hasOwn(replacements, specifier)) {
      return {
        url: replacements[specifier],
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

const { db, queryClient } = await import('@mossetech/db/client');

const {
  users,
  products,
  stockArrivals,
  sales,
  saleItems,
  salePayments,
  cashDrawers,
  cashDrawerMovements,
} = await import('@mossetech/db/schema');

const { createSaleAction } =
  await import('./src/lib/sales/actions.ts');

const ids = {
  user: null,
  product: null,
  drawer: null,
  sale: null,
};

const marker = `online-mixed-${randomUUID()}`;
let passed = 0;
let failure = null;
let cleanupFailure = null;

async function check(label, fn) {
  await fn();
  passed++;
  console.log(`PASS | ${passed} | ${label}`);
}

try {
  await db.transaction(async (tx) => {
    const [identity] = (
      await tx.execute(sql`SELECT current_database() AS name`)
    ).rows;

    assert.equal(identity.name, 'mossetech_external_sales_test');

    const [user] = await tx.insert(users).values({
      name: 'Mixed Online Test Owner',
      email: `${randomUUID()}@invalid.example`,
      passwordHash: 'test-only',
      role: 'OWNER',
    }).returning({ id: users.id });

    ids.user = user.id;

    const [product] = await tx.insert(products).values({
      name: 'Mixed Online Test Product',
      category: 'Test',
      itemType: 'PRODUCT',
      sellingPrice: '350000.00',
      minimumSellingPrice: '350000.00',
      buyingPrice: '200000.00',
      quantity: 5,
    }).returning({ id: products.id });

    ids.product = product.id;

    await tx.insert(stockArrivals).values({
      productId: product.id,
      receivedByUserId: user.id,
      productName: 'Mixed Online Test Product',
      quantityReceived: 5,
      sellingPriceSnapshot: '350000.00',
      buyingPrice: '200000.00',
    });

    const [drawer] = await tx.insert(cashDrawers).values({
      openedByUserId: user.id,
      openingCash: '100000.00',
    }).returning({ id: cashDrawers.id });

    ids.drawer = drawer.id;
  });

  globalThis.__mossetechTestUser = {
    id: ids.user,
    role: 'OWNER',
    status: 'ACTIVE',
  };

  const form = new FormData();
  form.set('customerMode', 'WALK_IN');
  form.set('paymentMethod', 'CASH');
  form.set('discountAmount', '0');
  form.set('amountReceived', '0');
  form.set('changeReturned', '0');
  form.set('extraKept', '0');
  form.set('notes', marker);
  form.set('itemsJson', JSON.stringify([{
    productId: ids.product,
    quantity: 1,
    unitPrice: '350000',
  }]));
  form.set('paymentsJson', JSON.stringify([
    { method: 'CASH', amount: '150000' },
    { method: 'MOBILE_MONEY', amount: '200000' },
  ]));

  let redirected = false;
  let errorResult = null;

  try {
    errorResult = await createSaleAction({}, form);
  } catch (error) {
    if (error?.message === 'TEST_REDIRECT:/sales') {
      redirected = true;
    } else {
      throw error;
    }
  }

  if (errorResult?.error) {
    throw new Error(errorResult.error);
  }

  await check('Online sale action completes successfully', () => {
    assert.equal(redirected, true);
  });

  const matching = await db
    .select()
    .from(sales)
    .where(eq(sales.notes, marker));

  assert.equal(matching.length, 1);
  ids.sale = matching[0].id;

  await check('Correct total, paid amount and balance', () => {
    assert.equal(Number(matching[0].totalAmount), 350000);
    assert.equal(Number(matching[0].paidAmount), 350000);
    assert.equal(Number(matching[0].balanceAmount), 0);
  });

  const payments = await db
    .select()
    .from(salePayments)
    .where(eq(salePayments.saleId, ids.sale));

  await check('Cash and MoMo recorded as separate payments', () => {
    assert.equal(payments.length, 2);

    const values = Object.fromEntries(
      payments.map((p) => [
        p.paymentMethod,
        Number(p.appliedAmount),
      ]),
    );

    assert.deepEqual(values, {
      CASH: 150000,
      MOBILE_MONEY: 200000,
    });
  });

  const movements = await db
    .select()
    .from(cashDrawerMovements)
    .where(eq(cashDrawerMovements.saleId, ids.sale));

  await check('Only Cash enters the drawer', () => {
    assert.equal(movements.length, 1);
    assert.equal(movements[0].movementType, 'CASH_SALE');
    assert.equal(Number(movements[0].amount), 150000);
  });

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, ids.product));

  await check('Online sale deducts stock once', () => {
    assert.equal(product.quantity, 4);
  });

} catch (error) {
  failure = error;
  console.error('FAIL | Online sale acceptance:', error);
} finally {
  try {
    await db.transaction(async (tx) => {
      if (ids.sale) {
        await tx.delete(cashDrawerMovements)
          .where(eq(cashDrawerMovements.saleId, ids.sale));
        await tx.delete(salePayments)
          .where(eq(salePayments.saleId, ids.sale));
        await tx.delete(saleItems)
          .where(eq(saleItems.saleId, ids.sale));
        await tx.delete(sales)
          .where(eq(sales.id, ids.sale));
      }

      if (ids.product) {
        await tx.delete(stockArrivals)
          .where(eq(stockArrivals.productId, ids.product));
        await tx.delete(products)
          .where(eq(products.id, ids.product));
      }

      if (ids.drawer) {
        await tx.delete(cashDrawers)
          .where(eq(cashDrawers.id, ids.drawer));
      }

      if (ids.user) {
        await tx.delete(users)
          .where(eq(users.id, ids.user));
      }
    });

    console.log('PASS: Isolated test records cleaned up.');
  } catch (error) {
    cleanupFailure = error;
    console.error('FAIL | Cleanup:', error);
  }

  delete globalThis.__mossetechTestUser;
  await queryClient.end();
}

console.log(`ONLINE SALE RESULT: ${passed}/5 checks passed`);

if (failure || cleanupFailure || passed !== 5) {
  process.exitCode = 1;
} else {
  console.log('RESULT: ONLINE MIXED PAYMENT PASSED');
}
