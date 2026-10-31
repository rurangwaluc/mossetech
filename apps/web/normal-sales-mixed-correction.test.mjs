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
      '@/lib/auth/session': authUrl,
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
  corrections,
} = await import('@mossetech/db/schema');

const { createSaleAction } =
  await import('./src/lib/sales/actions.ts');

const {
  submitAtSalePaymentFixAction,
  approvePaymentFixRequestAction,
} = await import('./src/lib/sales/payment-fixes.ts');

const ids = {
  user: null,
  employee: null,
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


  const original = await db.select()
    .from(salePayments)
    .where(eq(salePayments.saleId, ids.sale));

  const cash = original.find(
    p => p.isActive && p.paymentMethod === 'CASH'
  );
  const momo = original.find(
    p => p.isActive && p.paymentMethod === 'MOBILE_MONEY'
  );

  assert.ok(cash);
  assert.ok(momo);

  const correction = new FormData();
  correction.set('saleId', ids.sale);
  correction.set('paymentId', cash.id);
  correction.set('paymentMethod', 'BANK');
  correction.set('receivedAmount', '150000');
  correction.set('returnedAmount', '0');
  correction.set('extraKeptAmount', '0');
  correction.set('reason', 'Isolated mixed-payment correction test');

  let corrected = false;

  try {
    await submitAtSalePaymentFixAction(correction);
  } catch (error) {
    if (
      error?.message ===
      `TEST_REDIRECT:/sales/${ids.sale}?paymentFixed=1`
    ) {
      corrected = true;
    } else {
      throw error;
    }
  }

  await check('Owner correction applied', () => {
    assert.equal(corrected, true);
  });

  const afterPayments = await db.select()
    .from(salePayments)
    .where(eq(salePayments.saleId, ids.sale));

  await check('Cash replaced with Bank; MoMo preserved', () => {
    const active = afterPayments.filter(p => p.isActive);
    assert.equal(active.length, 2);

    assert.equal(
      active.find(p => p.paymentMethod === 'BANK')
        ?.receivedAmount,
      '150000.00',
    );

    assert.equal(
      active.find(p => p.id === momo.id)?.receivedAmount,
      '200000.00',
    );

    assert.equal(
      afterPayments.find(p => p.id === cash.id)?.isActive,
      false,
    );
  });

  await check('Sale total and mixed summary preserved', async () => {
    const [sale] = await db.select()
      .from(sales)
      .where(eq(sales.id, ids.sale));

    assert.equal(Number(sale.totalAmount), 350000);
    assert.equal(Number(sale.paidAmount), 350000);
    assert.equal(Number(sale.balanceAmount), 0);
    assert.equal(Number(sale.amountReceived), 350000);
  });

  await check('Cash correction and audit recorded', async () => {
    const movements = await db.select()
      .from(cashDrawerMovements)
      .where(eq(cashDrawerMovements.saleId, ids.sale));

    const adjustment = movements.find(
      m => m.movementType === 'PAYMENT_CORRECTION'
    );

    assert.ok(adjustment);
    assert.equal(adjustment.direction, 'OUT');
    assert.equal(Number(adjustment.amount), 150000);

    const audit = await db.select()
      .from(corrections)
      .where(eq(corrections.targetId, ids.sale));

    assert.equal(audit.length, 1);
    assert.equal(audit[0].status, 'APPLIED');
    assert.equal(audit[0].beforeValues.paymentId, cash.id);
    assert.equal(audit[0].afterValues.paymentMethod, 'BANK');
  });


  const bank = afterPayments.find(
    p => p.isActive && p.paymentMethod === 'BANK'
  );
  assert.ok(bank);

  const employee = await db.insert(users).values({
    name: 'Correction Test Employee',
    email: `${randomUUID()}@invalid.example`,
    passwordHash: 'test-only',
    role: 'EMPLOYEE',
  }).returning({ id: users.id });

  ids.employee = employee[0].id;
  const employeeId = ids.employee;

  try {
    globalThis.__mossetechTestUser = {
      id: employeeId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      grants: ['sales.correct'],
    };

    const requestForm = new FormData();
    requestForm.set('saleId', ids.sale);
    requestForm.set('paymentId', bank.id);
    requestForm.set('paymentMethod', 'CARD');
    requestForm.set('receivedAmount', '150000');
    requestForm.set('returnedAmount', '0');
    requestForm.set('extraKeptAmount', '0');
    requestForm.set('reason', 'Employee approval workflow test');

    let requested = false;

    try {
      await submitAtSalePaymentFixAction(requestForm);
    } catch (error) {
      if (
        error?.message ===
        `TEST_REDIRECT:/sales/${ids.sale}?paymentRequest=1`
      ) {
        requested = true;
      } else {
        throw error;
      }
    }

    await check('Employee correction waits for owner approval', async () => {
      assert.equal(requested, true);

      const pending = await db.select()
        .from(corrections)
        .where(eq(corrections.targetId, ids.sale));

      assert.equal(
        pending.filter(r => r.status === 'PENDING').length,
        1,
      );

      const current = await db.select()
        .from(salePayments)
        .where(eq(salePayments.saleId, ids.sale));

      assert.equal(
        current.find(p => p.id === bank.id)?.isActive,
        true,
      );
    });

    const [request] = await db.select()
      .from(corrections)
      .where(eq(corrections.targetId, ids.sale))
      .then(rows => rows.filter(r => r.status === 'PENDING'));

    assert.ok(request);

    globalThis.__mossetechTestUser = {
      id: ids.user,
      role: 'OWNER',
      status: 'ACTIVE',
    };

    const approvalForm = new FormData();
    approvalForm.set('correctionId', request.id);

    let approved = false;

    try {
      await approvePaymentFixRequestAction(approvalForm);
    } catch (error) {
      if (error?.message === 'TEST_REDIRECT:/requests?approved=1') {
        approved = true;
      } else {
        throw error;
      }
    }

    await check('Owner approval applies requested correction', async () => {
      assert.equal(approved, true);

      const rows = await db.select()
        .from(salePayments)
        .where(eq(salePayments.saleId, ids.sale));

      const active = rows.filter(p => p.isActive);
      assert.equal(active.length, 2);
      assert.ok(active.some(
        p => p.paymentMethod === 'CARD' &&
             Number(p.receivedAmount) === 150000
      ));
      assert.ok(active.some(
        p => p.paymentMethod === 'MOBILE_MONEY' &&
             Number(p.receivedAmount) === 200000
      ));

      const [updatedRequest] = await db.select()
        .from(corrections)
        .where(eq(corrections.id, request.id));

      assert.equal(updatedRequest.status, 'APPLIED');
      assert.equal(updatedRequest.reviewedByUserId, ids.user);
    });
  } finally {
    globalThis.__mossetechTestUser = {
      id: ids.user,
      role: 'OWNER',
      status: 'ACTIVE',
    };

  }

} catch (error) {
  failure = error;
  console.error('FAIL | Online sale acceptance:', error);
} finally {
  try {
    await db.transaction(async (tx) => {
      if (ids.sale) {
        await tx.delete(corrections)
          .where(eq(corrections.targetId, ids.sale));
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

      if (ids.employee) {
        await tx.delete(users)
          .where(eq(users.id, ids.employee));
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

console.log(`ONLINE SALE RESULT: ${passed}/11 checks passed`);

if (failure || cleanupFailure || passed !== 11) {
  process.exitCode = 1;
} else {
  console.log('RESULT: ONLINE MIXED PAYMENT PASSED');
}
