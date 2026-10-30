import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/');

assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_external_sales_test');
assert.equal(url.username, 'postgres');
assert.notEqual(process.env.VERCEL, '1');

const { db, queryClient } = await import('@mossetech/db/client');

const {
  users,
  customers,
  products,
  stockArrivals,
  sales,
  saleItems,
  salePayments,
  cashDrawers,
  cashDrawerMovements,
} = await import('@mossetech/db/schema');

const { executeSaleCreateSync } =
  await import('./src/lib/sales/sync-server.ts');

const ROLLBACK = Symbol('EXPECTED_TEST_ROLLBACK');

let passed = 0;
let failed = false;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`PASS | ${String(passed).padStart(2, '0')} | ${name}`);
    });
}

function basePayload(productId, overrides = {}) {
  return {
    customerMode: 'WALK_IN',
    paymentMethod: 'CASH',
    discountAmount: '0',
    amountReceived: '0',
    changeReturned: '0',
    extraKept: '0',
    items: [
      {
        productId,
        quantity: 1,
        unitPrice: '500000',
      },
    ],
    ...overrides,
  };
}

async function records(tx, saleId) {
  const [sale] = await tx
    .select()
    .from(sales)
    .where(eq(sales.id, saleId));

  const payments = await tx
    .select()
    .from(salePayments)
    .where(eq(salePayments.saleId, saleId));

  const movements = await tx
    .select()
    .from(cashDrawerMovements)
    .where(eq(cashDrawerMovements.saleId, saleId));

  const items = await tx
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId));

  return { sale, payments, movements, items };
}

function money(value) {
  return Number(value).toFixed(2);
}

function assertPayments(rows, expected) {
  assert.equal(rows.length, Object.keys(expected).length);

  for (const [method, amount] of Object.entries(expected)) {
    const matches = rows.filter(
      (payment) => payment.paymentMethod === method,
    );

    assert.equal(matches.length, 1);
    assert.equal(money(matches[0].receivedAmount), money(amount));
    assert.equal(money(matches[0].appliedAmount), money(amount));
    assert.equal(money(matches[0].returnedAmount), '0.00');
    assert.equal(money(matches[0].extraKeptAmount), '0.00');
    assert.equal(matches[0].paymentType, 'AT_SALE');
    assert.equal(matches[0].isActive, true);
  }
}

function assertCashMovement(rows, expectedAmount) {
  const cash = rows.filter(
    (row) => row.movementType === 'CASH_SALE',
  );

  if (Number(expectedAmount) === 0) {
    assert.equal(cash.length, 0);
    return;
  }

  assert.equal(cash.length, 1);
  assert.equal(cash[0].direction, 'IN');
  assert.equal(money(cash[0].amount), money(expectedAmount));

  assert.equal(
    rows.filter((row) => row.movementType === 'CUSTOMER_EXTRA_KEPT').length,
    0,
  );
}

try {
  await db.transaction(async (tx) => {
    const database = await tx.execute(sql`
      SELECT current_database() AS name
    `);

    assert.equal(
      database.rows[0].name,
      'mossetech_external_sales_test',
    );

    const [user] = await tx
      .insert(users)
      .values({
        name: 'Mixed Payment Integration Test',
        email: `${randomUUID()}@invalid.example`,
        passwordHash: 'test-only',
        role: 'OWNER',
      })
      .returning({ id: users.id });

    const [customer] = await tx
      .insert(customers)
      .values({
        name: 'Mixed Payment Test Customer',
      })
      .returning({ id: customers.id });

    const [product] = await tx
      .insert(products)
      .values({
        name: 'Mixed Payment Test Product',
        category: 'Test',
        itemType: 'PRODUCT',
        sellingPrice: '500000.00',
        minimumSellingPrice: '500000.00',
        buyingPrice: '350000.00',
        quantity: 10,
      })
      .returning({ id: products.id });

    await tx.insert(stockArrivals).values({
      productId: product.id,
      receivedByUserId: user.id,
      productName: 'Mixed Payment Test Product',
      quantityReceived: 10,
      sellingPriceSnapshot: '500000.00',
      buyingPrice: '350000.00',
    });

    const [drawer] = await tx
      .insert(cashDrawers)
      .values({
        openedByUserId: user.id,
        openingCash: '100000.00',
      })
      .returning({ id: cashDrawers.id });

    const testUser = { id: user.id };
    const createdAt = new Date();

    const countSales = async () => {
      const [row] = await tx
        .select({ count: sql`count(*)::int` })
        .from(sales);

      return Number(row.count);
    };

    const create = async (payload) =>
      executeSaleCreateSync(
        tx,
        testUser,
        payload,
        createdAt,
      );

    const full = await create(
      basePayload(product.id, {
        cashDrawerId: drawer.id,
        payments: [
          { method: 'CASH', amount: '150000' },
          { method: 'MOBILE_MONEY', amount: '200000' },
          { method: 'BANK', amount: '150000' },
        ],
      }),
    );

    const fullRows = await records(tx, full.saleId);

    await check('Full mixed sale totals and balance', () => {
      assert.equal(money(full.totalAmount), '500000.00');
      assert.equal(money(full.paidAmount), '500000.00');
      assert.equal(money(full.balanceAmount), '0.00');
      assert.equal(money(fullRows.sale.amountReceived), '500000.00');
      assert.equal(money(fullRows.sale.balanceAmount), '0.00');
    });

    await check('Cash, MoMo and Bank recorded separately', () => {
      assertPayments(fullRows.payments, {
        CASH: 150000,
        MOBILE_MONEY: 200000,
        BANK: 150000,
      });

      const sum = fullRows.payments.reduce(
        (total, row) => total + Number(row.appliedAmount),
        0,
      );

      assert.equal(money(sum), '500000.00');
    });

    await check('Only Cash enters the drawer', () => {
      assertCashMovement(fullRows.movements, 150000);
      assert.equal(fullRows.items.length, 1);
      assert.equal(fullRows.items[0].quantity, 1);
    });

    const partial = await create(
      basePayload(product.id, {
        customerMode: 'EXISTING',
        customerId: customer.id,
        paymentMethod: 'MOBILE_MONEY',
        payments: [
          { method: 'CASH', amount: '100000' },
          { method: 'MOBILE_MONEY', amount: '150000' },
        ],
        cashDrawerId: drawer.id,
      }),
    );

    const partialRows = await records(tx, partial.saleId);

    await check('Partial mixed sale preserves customer debt', () => {
      assert.equal(money(partial.totalAmount), '500000.00');
      assert.equal(money(partial.paidAmount), '250000.00');
      assert.equal(money(partial.balanceAmount), '250000.00');
      assert.equal(money(partialRows.sale.balanceAmount), '250000.00');
      assert.equal(partialRows.sale.customerId, customer.id);

      assertPayments(partialRows.payments, {
        CASH: 100000,
        MOBILE_MONEY: 150000,
      });

      assertCashMovement(partialRows.movements, 100000);
    });

    const nonCash = await create(
      basePayload(product.id, {
        paymentMethod: 'BANK',
        payments: [
          { method: 'BANK', amount: '300000' },
          { method: 'CARD', amount: '200000' },
        ],
      }),
    );

    const nonCashRows = await records(tx, nonCash.saleId);

    await check('Bank and Card do not create drawer movements', () => {
      assertPayments(nonCashRows.payments, {
        BANK: 300000,
        CARD: 200000,
      });

      assertCashMovement(nonCashRows.movements, 0);
    });

    const beforeReject = await countSales();

    await assert.rejects(
      create(
        basePayload(product.id, {
          payments: [
            { method: 'CASH', amount: '400000' },
            { method: 'BANK', amount: '200000' },
          ],
          cashDrawerId: drawer.id,
        }),
      ),
    );

    await check('Overpayment rejected without creating a sale', async () => {
      assert.equal(await countSales(), beforeReject);
    });

    await assert.rejects(
      create(
        basePayload(product.id, {
          payments: [
            { method: 'CASH', amount: '100000' },
            { method: 'CASH', amount: '100000' },
          ],
          cashDrawerId: drawer.id,
          customerMode: 'EXISTING',
          customerId: customer.id,
        }),
      ),
    );

    await check('Duplicate payment method rejected', async () => {
      assert.equal(await countSales(), beforeReject);
    });

    await assert.rejects(
      create(
        basePayload(product.id, {
          payments: [
            { method: 'CASH', amount: '100000' },
          ],
          cashDrawerId: drawer.id,
        }),
      ),
    );

    await check('Walk-in customer cannot receive unpaid credit', async () => {
      assert.equal(await countSales(), beforeReject);
    });

    const [currentProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, product.id));

    await check('Stock ledger reconciles all completed sales', () => {
      assert.equal(currentProduct.quantity, 7);
    });

    const [cashTotal] = await tx
      .select({
        total: sql`
          coalesce(sum(${cashDrawerMovements.amount}), 0)
        `,
      })
      .from(cashDrawerMovements)
      .where(eq(cashDrawerMovements.drawerId, drawer.id));

    await check('Cash movement total reconciles', () => {
      assert.equal(money(cashTotal.total), '250000.00');
    });

    console.log('All assertions passed inside isolated transaction.');

    // Roll back the successful fixtures and all financial changes.
    throw ROLLBACK;
  });
} catch (error) {
  if (error !== ROLLBACK) {
    failed = true;
    console.error('FAIL | Transaction acceptance:', error);
  }
} finally {
  await queryClient.end();
}

console.log('');
console.log('=== NORMAL-SALE MIXED-PAYMENT RESULTS ===');
console.log(`Checks passed: ${passed}`);
console.log('Test transaction rolled back.');

if (failed || passed !== 10) {
  console.error('RESULT: FAILED — Do not deploy.');
  process.exitCode = 1;
} else {
  console.log('RESULT: 10/10 PASSED');
  console.log('Production database was not accessed.');
}
