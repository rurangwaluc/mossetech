import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_external_sales_test');
assert.equal(url.username, 'postgres');
assert.notEqual(process.env.VERCEL, '1');

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
  offlineOperations,
} = await import('@mossetech/db/schema');

const { executeSaleCreateSync } =
  await import('./src/lib/sales/sync-server.ts');

const {
  runIdempotentOfflineOperation,
  OfflineOperationConflictError,
} = await import('./src/lib/offline/server.ts');

const ids = {
  user: null,
  product: null,
  drawer: null,
  sale: null,
  operation: randomUUID(),
};

const checks = [];
let createdAt;

async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log(`PASS | ${String(checks.length).padStart(2, '0')} | ${name}`);
}

async function count(table, column, value) {
  const [row] = await db
    .select({ count: sql`count(*)::int` })
    .from(table)
    .where(eq(column, value));
  return Number(row.count);
}

let cleanupError = null;
let testError = null;

try {
  const [identity] = await db.execute(
    sql`SELECT current_database() AS name`
  ).then((result) => result.rows);

  assert.equal(identity.name, 'mossetech_external_sales_test');

  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      name: 'Mixed Replay Test',
      email: `${randomUUID()}@invalid.example`,
      passwordHash: 'test-only',
      role: 'OWNER',
    }).returning({ id: users.id });
    ids.user = user.id;

    const [product] = await tx.insert(products).values({
      name: 'Mixed Replay Test Product',
      category: 'Test',
      itemType: 'PRODUCT',
      sellingPrice: '500000.00',
      minimumSellingPrice: '500000.00',
      buyingPrice: '350000.00',
      quantity: 10,
    }).returning({ id: products.id });
    ids.product = product.id;

    await tx.insert(stockArrivals).values({
      productId: product.id,
      receivedByUserId: user.id,
      productName: 'Mixed Replay Test Product',
      quantityReceived: 10,
      sellingPriceSnapshot: '500000.00',
      buyingPrice: '350000.00',
    });

    const [drawer] = await tx.insert(cashDrawers).values({
      openedByUserId: user.id,
      openingCash: '100000.00',
    }).returning({ id: cashDrawers.id });
    ids.drawer = drawer.id;
  });

  // The offline sale must occur after its drawer session opens.
  // Set this after the fixture transaction has committed.
  createdAt = new Date();

  const payload = {
    customerMode: 'WALK_IN',
    paymentMethod: 'CASH',
    amountReceived: '0',
    changeReturned: '0',
    extraKept: '0',
    discountAmount: '0',
    cashDrawerId: ids.drawer,
    items: [{
      productId: ids.product,
      quantity: 1,
      unitPrice: '500000',
    }],
    payments: [
      { method: 'CASH', amount: '150000' },
      { method: 'MOBILE_MONEY', amount: '200000' },
      { method: 'BANK', amount: '150000' },
    ],
  };

  const invoke = (operationId, data) =>
    runIdempotentOfflineOperation({
      operationId,
      userId: ids.user,
      kind: 'SALE_CREATE',
      payload: data,
      clientCreatedAt: createdAt,
      execute: (tx) =>
        executeSaleCreateSync(
          tx,
          { id: ids.user },
          data,
          createdAt,
        ),
    });

  const first = await invoke(ids.operation, payload);
  ids.sale = first.result.saleId;

  await check('First synchronization creates one sale', async () => {
    assert.equal(first.replayed, false);
    assert.equal(await count(sales, sales.id, ids.sale), 1);
    assert.equal(first.result.totalAmount, '500000.00');
    assert.equal(first.result.paidAmount, '500000.00');
    assert.equal(first.result.balanceAmount, '0.00');
  });

  const second = await invoke(ids.operation, payload);

  await check('Same operation replays existing result', async () => {
    assert.equal(second.replayed, true);
    assert.equal(second.result.saleId, ids.sale);
    assert.deepEqual(second.result, first.result);
  });

  await check('Replay creates no extra payment records', async () => {
    assert.equal(
      await count(salePayments, salePayments.saleId, ids.sale),
      3,
    );
  });

  await check('Replay creates no extra Cash movements', async () => {
    const movements = await db
      .select()
      .from(cashDrawerMovements)
      .where(eq(cashDrawerMovements.saleId, ids.sale));

    assert.equal(movements.length, 1);
    assert.equal(movements[0].movementType, 'CASH_SALE');
    assert.equal(Number(movements[0].amount), 150000);
  });

  await check('Replay does not deduct stock twice', async () => {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, ids.product));

    assert.equal(product.quantity, 9);
    assert.equal(
      await count(saleItems, saleItems.saleId, ids.sale),
      1,
    );
  });

  await check('Changed payload with same ID is rejected', async () => {
    await assert.rejects(
      invoke(ids.operation, {
        ...payload,
        payments: [
          { method: 'CASH', amount: '200000' },
          { method: 'MOBILE_MONEY', amount: '150000' },
          { method: 'BANK', amount: '150000' },
        ],
      }),
      (error) => error instanceof OfflineOperationConflictError,
    );
  });

  await check('Rejected replay leaves original data intact', async () => {
    assert.equal(await count(sales, sales.id, ids.sale), 1);
    assert.equal(
      await count(salePayments, salePayments.saleId, ids.sale),
      3,
    );
    assert.equal(
      await count(cashDrawerMovements, cashDrawerMovements.saleId, ids.sale),
      1,
    );
  });

} catch (error) {
  testError = error;
  console.error('FAIL | Offline replay acceptance:', error);
} finally {
  try {
    await db.transaction(async (tx) => {
      // Delete only records created by this test.
      if (ids.operation) {
        await tx.delete(offlineOperations)
          .where(eq(offlineOperations.operationId, ids.operation));
      }

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

    console.log('PASS: Test fixture cleanup transaction completed.');
  } catch (error) {
    cleanupError = error;
    console.error('FAIL | Test fixture cleanup:', error);
  }

  await queryClient.end();
}

console.log('');
console.log('=== OFFLINE REPLAY RESULTS ===');
console.log(`Checks passed: ${checks.length}/7`);

if (testError || cleanupError || checks.length !== 7) {
  console.error('RESULT: FAILED — DO NOT DEPLOY');
  process.exitCode = 1;
} else {
  console.log('RESULT: 7/7 PASSED');
  console.log('Isolated database test records cleaned up.');
}
