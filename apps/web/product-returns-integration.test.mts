import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');

assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_returns_integration_test');
assert.equal(url.username, 'postgres');
assert.notEqual(process.env.VERCEL, '1');

const { db, queryClient } = await import('@mossetech/db/client');
const {
  users, customers, products, stockArrivals,
  sales, saleItems, saleReturns, saleReturnItems,
  saleReturnRefunds, saleReturnCustomerCredits,
} = await import('@mossetech/db/schema');

const { executeProductReturnTransaction } =
  await import('./src/lib/sales/return-transaction');

const ROLLBACK = Symbol('ROLLBACK');
let passed = 0;
let completed = false;

function check(name: string) {
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

try {
  await db.transaction(async (tx) => {
    const identity = await tx.execute(
      'SELECT current_database() AS name',
    );

    assert.equal(
      identity.rows[0].name,
      'mossetech_returns_integration_test',
    );

    const [owner] = await tx.insert(users).values({
      name: 'Return Integration Owner',
      email: `${randomUUID()}@invalid.example`,
      passwordHash: 'test-only',
      role: 'OWNER',
    }).returning({ id: users.id });

    const [customer] = await tx.insert(customers).values({
      name: 'Return Integration Customer',
    }).returning({ id: customers.id });

    const [product] = await tx.insert(products).values({
      name: 'MOSSETECH_564P_RETURN_TEST',
      category: 'Test',
      itemType: 'PRODUCT',
      sellingPrice: '100.00',
      minimumSellingPrice: '100.00',
      buyingPrice: '60.00',
      quantity: 2,
    }).returning({ id: products.id });

    await tx.insert(stockArrivals).values({
      productId: product.id,
      receivedByUserId: owner.id,
      productName: 'MOSSETECH_564P_RETURN_TEST',
      quantityReceived: 5,
      sellingPriceSnapshot: '100.00',
      buyingPrice: '60.00',
    });

    const [sale] = await tx.insert(sales).values({
      customerId: customer.id,
      paymentMethod: 'CASH',
      subtotalAmount: '300.00',
      discountAmount: '0.00',
      totalAmount: '300.00',
      paidAmount: '100.00',
      balanceAmount: '200.00',
    }).returning({ id: sales.id });

    const [item] = await tx.insert(saleItems).values({
      saleId: sale.id,
      productId: product.id,
      itemName: 'MOSSETECH_564P_RETURN_TEST',
      itemType: 'PRODUCT',
      quantity: 3,
      unitPrice: '100.00',
      unitCost: '60.00',
      lineTotal: '300.00',
    }).returning({ id: saleItems.id });

    check('Real database fixtures created');

    const firstKey = randomUUID();

    const firstInput = {
      ownerId: owner.id,
      saleId: sale.id,
      idempotencyKey: firstKey,
      reason: 'Customer returned one product',
      requested: [{
        saleItemId: item.id,
        quantity: 1,
        condition: 'RESTOCK' as const,
      }],
      cashRefundConfirmed: null,
      refundMethod: null,
    };

    assert.equal(
      await executeProductReturnTransaction(tx, firstInput),
      'recorded',
    );

    const [afterFirst] = await tx.select()
      .from(sales).where(eq(sales.id, sale.id));

    assert.equal(afterFirst.totalAmount, '200.00');
    assert.equal(afterFirst.paidAmount, '100.00');
    assert.equal(afterFirst.balanceAmount, '100.00');

    check('Real return reduces outstanding debt');

    const [afterStock] = await tx.select()
      .from(products).where(eq(products.id, product.id));

    assert.equal(afterStock.quantity, 3);

    check('Restocked product increases sellable quantity');

    assert.equal(
      await executeProductReturnTransaction(tx, firstInput),
      'already-recorded',
    );

    const firstHistory = await tx.select()
      .from(saleReturns).where(eq(saleReturns.saleId, sale.id));

    assert.equal(firstHistory.length, 1);

    check('Duplicate submission creates no second return');

    const secondKey = randomUUID();

    assert.equal(
      await executeProductReturnTransaction(tx, {
        ...firstInput,
        idempotencyKey: secondKey,
        reason: 'Second product returned damaged',
        requested: [{
          saleItemId: item.id,
          quantity: 1,
          condition: 'DAMAGED',
        }],
      }),
      'recorded',
    );

    const [afterSecond] = await tx.select()
      .from(sales).where(eq(sales.id, sale.id));

    const [afterSecondStock] = await tx.select()
      .from(products).where(eq(products.id, product.id));

    assert.equal(afterSecond.totalAmount, '100.00');
    assert.equal(afterSecond.balanceAmount, '0.00');
    assert.equal(afterSecondStock.quantity, 3);

    check('Damaged return clears debt without restocking');

    const returnHistory = await tx.select()
      .from(saleReturns).where(eq(saleReturns.saleId, sale.id));

    const returnedItems = await tx.select()
      .from(saleReturnItems);

    assert.equal(returnHistory.length, 2);
    assert.equal(
      returnedItems.filter(
        row => row.originalSaleItemId === item.id,
      ).length,
      2,
    );

    check('Return history and item snapshots preserved');


    // Cash refund requests must remain blocked.
    await assert.rejects(
      executeProductReturnTransaction(tx, {
        ...firstInput,
        idempotencyKey: randomUUID(),
        reason: 'Attempted cash refund',
        requested: [{
          saleItemId: item.id,
          quantity: 1,
          condition: 'RESTOCK',
        }],
        cashRefundConfirmed: 'YES',
        refundMethod: 'CASH',
      }),
      /Cash refunds are disabled/,
    );
    check('Cash refund request is blocked');

    const creditInput = {
      ...firstInput,
      idempotencyKey: randomUUID(),
      reason: 'Final product returned for customer credit',
      requested: [{
        saleItemId: item.id,
        quantity: 1,
        condition: 'RESTOCK' as const,
      }],
      settlementMethod: 'CUSTOMER_CREDIT',
      customerCreditConfirmed: 'YES',
      customerCreditExpectedAmount: '100.00',
    };

    const beforeCredit = await tx.select()
      .from(saleReturnCustomerCredits)
      .where(eq(saleReturnCustomerCredits.saleId, sale.id));

    assert.equal(beforeCredit.length, 0);
    check('No customer credit exists before confirmation');

    await assert.rejects(
      executeProductReturnTransaction(tx, {
        ...creditInput,
        customerCreditConfirmed: null,
      }),
      /explicitly confirm/,
    );
    check('Unconfirmed customer credit is blocked');

    await assert.rejects(
      executeProductReturnTransaction(tx, {
        ...creditInput,
        customerCreditExpectedAmount: '99.00',
      }),
      /explicitly confirm/,
    );
    check('Incorrect customer credit amount is blocked');

    assert.equal(
      await executeProductReturnTransaction(tx, creditInput),
      'recorded',
    );

    const [finalSale] = await tx.select()
      .from(sales).where(eq(sales.id, sale.id));

    assert.equal(finalSale.totalAmount, '0.00');
    assert.equal(finalSale.paidAmount, '0.00');
    assert.equal(finalSale.balanceAmount, '0.00');
    check('Full return clears sale and outstanding debt');

    const credits = await tx.select()
      .from(saleReturnCustomerCredits)
      .where(eq(saleReturnCustomerCredits.saleId, sale.id));

    assert.equal(credits.length, 1);
    assert.equal(credits[0].customerId, customer.id);
    assert.equal(credits[0].amount, '100.00');
    assert.equal(credits[0].remainingAmount, '100.00');
    check('Customer credit liability recorded exactly once');

    const [finalProduct] = await tx.select()
      .from(products).where(eq(products.id, product.id));

    assert.equal(finalProduct.quantity, 4);

    const refunds = await tx.select()
      .from(saleReturnRefunds)
      .where(eq(saleReturnRefunds.saleId, sale.id));

    assert.equal(refunds.length, 0);
    check('Stock restored without issuing a cash refund');

    assert.equal(
      await executeProductReturnTransaction(tx, creditInput),
      'already-recorded',
    );

    const creditsAgain = await tx.select()
      .from(saleReturnCustomerCredits)
      .where(eq(saleReturnCustomerCredits.saleId, sale.id));

    assert.equal(creditsAgain.length, 1);
    check('Duplicate return cannot create duplicate credit');
    completed = true;
    throw ROLLBACK;
  });
} catch (error) {
  if (error !== ROLLBACK) {
    console.error('FAIL: Integration transaction', error);
    process.exitCode = 1;
  }
} finally {
  await queryClient.end();
}

if (!completed || passed !== 14) {
  console.error(`FAILED: ${passed}/8 checks`);
  process.exitCode = 1;
} else {
  console.log('PASS: 14/14 REAL BACKEND CHECKS');
  console.log('PASS: All test records rolled back');
}
