import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');

assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_referral_payment_test');
assert.equal(url.username, 'postgres');
assert.notEqual(process.env.VERCEL, '1');

const { db, queryClient } = await import('@mossetech/db/client');
const {
  users,
  sales,
  cashDrawers,
  cashDrawerMovements,
  expenses,
  referralRewards,
  referralRewardPayments,
  saleReturns,
} = await import('@mossetech/db/schema');

const { executeReferralCashPayment } =
  await import('./src/lib/referrals/payment-transaction');

let passed = 0;

function check(name: string) {
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

try {
  const [owner] = await db.insert(users).values({
    name: 'Referral Test Owner',
    email: `${randomUUID()}@invalid.example`,
    passwordHash: 'test-only',
    role: 'OWNER',
  }).returning();

  const [sale] = await db.insert(sales).values({
    customerName: 'Referral Test Customer',
    paymentMethod: 'CASH',
    subtotalAmount: '500.00',
    totalAmount: '500.00',
    paidAmount: '500.00',
    balanceAmount: '0.00',
  }).returning();

  const [reward] = await db.insert(referralRewards).values({
    saleId: sale.id,
    referrerName: 'Referral Test Vincent',
    recordedByUserId: owner.id,
    amount: '100.00',
  }).returning();

  const [drawer] = await db.insert(cashDrawers).values({
    openedByUserId: owner.id,
    openingCash: '70.00',
  }).returning();

  check('Real PostgreSQL fixtures created');

  const payment = {
    ownerId: owner.id,
    rewardId: reward.id,
    idempotencyKey: randomUUID(),
    amount: '40.00',
  };

  assert.equal(
    await executeReferralCashPayment(payment),
    'recorded',
  );

  const [afterFirst] = await db.select()
    .from(referralRewards)
    .where(eq(referralRewards.id, reward.id));

  assert.equal(afterFirst.paidAmount, '40.00');
  check('First partial payment updates reward balance');

  assert.equal(
    await executeReferralCashPayment(payment),
    'already-recorded',
  );

  const firstPayments = await db.select()
    .from(referralRewardPayments)
    .where(eq(referralRewardPayments.rewardId, reward.id));

  assert.equal(firstPayments.length, 1);
  check('Duplicate payment cannot pay twice');

  await assert.rejects(
    executeReferralCashPayment({
      ...payment,
      amount: '30.00',
    }),
    /reference has already been used/,
  );

  check('Reused payment key with changed amount is rejected');

  const firstExpenses = await db.select()
    .from(expenses)
    .where(eq(expenses.id, firstPayments[0].expenseId));

  assert.equal(firstExpenses.length, 1);
  assert.equal(firstExpenses[0].amount, '40.00');

  const firstMovements = await db.select()
    .from(cashDrawerMovements)
    .where(eq(cashDrawerMovements.drawerId, drawer.id));

  assert.equal(firstMovements.length, 1);
  assert.equal(firstMovements[0].amount, '40.00');
  assert.equal(firstMovements[0].direction, 'OUT');
  assert.equal(firstMovements[0].expenseId, firstExpenses[0].id);

  check('Expense and cash movement reconcile');

  await assert.rejects(
    executeReferralCashPayment({
      ...payment,
      idempotencyKey: randomUUID(),
      amount: '70.00',
    }),
    /exceeds the reward balance/,
  );

  check('Reward overpayment is rejected');

  await assert.rejects(
    executeReferralCashPayment({
      ...payment,
      idempotencyKey: randomUUID(),
      amount: '35.00',
    }),
    /Not enough cash/,
  );

  const afterFailedPayments = await db.select()
    .from(referralRewardPayments)
    .where(eq(referralRewardPayments.rewardId, reward.id));

  assert.equal(afterFailedPayments.length, 1);
  check('Insufficient cash produces no payment record');

  assert.equal(
    await executeReferralCashPayment({
      ...payment,
      idempotencyKey: randomUUID(),
      amount: '20.00',
    }),
    'recorded',
  );

  const [afterSecond] = await db.select()
    .from(referralRewards)
    .where(eq(referralRewards.id, reward.id));

  assert.equal(afterSecond.paidAmount, '60.00');
  check('Second partial payment updates total paid correctly');

  const payments = await db.select()
    .from(referralRewardPayments)
    .where(eq(referralRewardPayments.rewardId, reward.id));

  assert.equal(payments.length, 2);
  check('Both payments preserved in payment history');

  await db.insert(saleReturns).values({
    saleId: sale.id,
    recordedByUserId: owner.id,
    idempotencyKey: randomUUID(),
    previousSaleTotal: '500.00',
    creditAmount: '100.00',
    reason: 'Test returned sale',
  });

  await assert.rejects(
    executeReferralCashPayment({
      ...payment,
      idempotencyKey: randomUUID(),
      amount: '10.00',
    }),
    /sale has returns/,
  );

  check('Returned sale blocks further referral payouts');

  const finalPayments = await db.select()
    .from(referralRewardPayments)
    .where(eq(referralRewardPayments.rewardId, reward.id));

  assert.equal(finalPayments.length, 2);
  check('Blocked payout leaves payment history unchanged');


  // Two simultaneous, distinct payouts must not exceed available cash.
  const [raceSale] = await db.insert(sales).values({
    customerName: 'Concurrency Test Customer',
    paymentMethod: 'CASH',
    subtotalAmount: '500.00',
    totalAmount: '500.00',
    paidAmount: '500.00',
    balanceAmount: '0.00',
  }).returning();

  const [raceReward] = await db.insert(referralRewards).values({
    saleId: raceSale.id,
    referrerName: 'Concurrency Test Referrer',
    recordedByUserId: owner.id,
    amount: '20.00',
  }).returning();

  const raceResults = await Promise.allSettled([
    executeReferralCashPayment({
      ownerId: owner.id,
      rewardId: raceReward.id,
      idempotencyKey: randomUUID(),
      amount: '7.00',
    }),
    executeReferralCashPayment({
      ownerId: owner.id,
      rewardId: raceReward.id,
      idempotencyKey: randomUUID(),
      amount: '7.00',
    }),
  ]);

  const raceSuccess = raceResults.filter(
    (result) =>
      result.status === 'fulfilled' &&
      result.value === 'recorded'
  );

  const raceFailure = raceResults.filter(
    (result) => result.status === 'rejected'
  );

  assert.equal(raceSuccess.length, 1);
  assert.equal(raceFailure.length, 1);
  check('Concurrent payouts cannot exceed available drawer cash');

  const racePayments = await db.select()
    .from(referralRewardPayments)
    .where(eq(referralRewardPayments.rewardId, raceReward.id));

  const [raceBalance] = await db.select()
    .from(referralRewards)
    .where(eq(referralRewards.id, raceReward.id));

  assert.equal(racePayments.length, 1);
  assert.equal(racePayments[0].amount, '7.00');
  assert.equal(raceBalance.paidAmount, '7.00');

  check('Concurrent attempts preserve a single correct payment');


} catch (error) {
  console.error('FAIL: Referral integration test', error);
  process.exitCode = 1;
} finally {
  await queryClient.end();
}

if (passed !== 13) {
  console.error(`FAILED: ${passed}/11 checks`);
  process.exitCode = 1;
} else {
  console.log('PASS: 13/13 REFERRAL PAYMENT CHECKS');
}


// All assertions have completed. This isolated test process
// must not remain alive because of an idle database connection.
process.exit(process.exitCode || 0);
