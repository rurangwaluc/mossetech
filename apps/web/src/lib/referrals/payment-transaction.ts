import { and, eq, sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  expenses,
  referralRewardPayments,
  referralRewards,
  saleReturns,
  sales,
} from '@mossetech/db/schema';
import { getLockedCurrentDrawerState } from '@/lib/cash-drawer/locking';

type PaymentInput = {
  ownerId: string;
  rewardId: string;
  idempotencyKey: string;
  amount: string;
};

function moneyCents(value: string): number {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Invalid payment amount.');
  }

  const [whole, decimals = ''] = value.split('.');
  const cents =
    Number(whole) * 100 +
    Number(decimals.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents)) {
    throw new Error('Payment exceeds the supported range.');
  }

  return cents;
}

function money(value: number): string {
  return (value / 100).toFixed(2);
}

/**
 * Transaction-layer implementation only.
 *
 * Must be called by an authenticated owner-only action.
 * Does not authorize a user by itself.
 *
 * No payout UI is activated until database integration tests pass.
 */
export async function executeReferralCashPayment(
  input: PaymentInput,
): Promise<'recorded' | 'already-recorded'> {
  const {
    ownerId,
    rewardId,
    idempotencyKey,
    amount,
  } = input;

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !uuid.test(ownerId) ||
    !uuid.test(rewardId) ||
    !uuid.test(idempotencyKey)
  ) {
    throw new Error('Invalid payment reference.');
  }

  const amountCents = moneyCents(amount);

  if (amountCents <= 0) {
    throw new Error('Payment must be greater than zero.');
  }

  return db.transaction(async (tx) => {
    // Read the sale reference before acquiring the sale lock.
    const [candidate] = await tx
      .select({
        saleId: referralRewards.saleId,
      })
      .from(referralRewards)
      .where(eq(referralRewards.id, rewardId))
      .limit(1);

    if (!candidate) {
      throw new Error('Referral reward not found.');
    }

    // Coordinate with sale corrections and returns.
    await tx.execute(sql`
      SELECT id FROM sales
      WHERE id = ${candidate.saleId}
      FOR UPDATE
    `);

    // Serialize simultaneous payout attempts for this reward.
    await tx.execute(sql`
      SELECT id FROM referral_rewards
      WHERE id = ${rewardId}
      FOR UPDATE
    `);

    const [reward] = await tx
      .select()
      .from(referralRewards)
      .where(eq(referralRewards.id, rewardId))
      .limit(1);

    if (!reward || reward.saleId !== candidate.saleId) {
      throw new Error('Referral reward changed. Please review.');
    }

    const [previous] = await tx
      .select()
      .from(referralRewardPayments)
      .where(
        eq(
          referralRewardPayments.idempotencyKey,
          idempotencyKey,
        ),
      )
      .limit(1);

    if (previous) {
      if (
        previous.rewardId !== rewardId ||
        moneyCents(previous.amount) !== amountCents
      ) {
        throw new Error('Payment reference has already been used.');
      }

      return 'already-recorded';
    }

    const [sale] = await tx
      .select()
      .from(sales)
      .where(eq(sales.id, reward.saleId))
      .limit(1);

    if (!sale) {
      throw new Error('Linked sale was not found.');
    }

    const returns = await tx
      .select({ id: saleReturns.id })
      .from(saleReturns)
      .where(eq(saleReturns.saleId, sale.id))
      .limit(1);

    if (returns.length) {
      throw new Error(
        'This sale has returns. Review the referral reward first.',
      );
    }

    if (
      moneyCents(sale.balanceAmount) !== 0 ||
      moneyCents(sale.paidAmount) !==
        moneyCents(sale.totalAmount) ||
      moneyCents(sale.totalAmount) <= 0
    ) {
      throw new Error(
        'Referral payments require a fully paid eligible sale.',
      );
    }

    const rewardCents = moneyCents(reward.amount);
    const paidCents = moneyCents(reward.paidAmount);

    if (
      paidCents > rewardCents ||
      amountCents > rewardCents - paidCents
    ) {
      throw new Error('Payment exceeds the reward balance.');
    }

    // Lock the physical drawer before calculating available cash.
    const drawer = await getLockedCurrentDrawerState(tx);

    if (!drawer) {
      throw new Error(
        'Open the cash drawer before paying a referral reward.',
      );
    }

    if (
      !Number.isFinite(drawer.expectedCash) ||
      moneyCents(drawer.expectedCash.toFixed(2)) < amountCents
    ) {
      throw new Error('Not enough cash in the drawer.');
    }

    const [expense] = await tx
      .insert(expenses)
      .values({
        recordedByUserId: ownerId,
        name: `Referral reward / ${reward.referrerName}`,
        category: 'Referral rewards',
        amount: money(amountCents),
        paymentMethod: 'CASH',
        expenseDate: new Date(),
        notes: `Referral linked to sale ${reward.saleId}`,
      })
      .returning({ id: expenses.id });

    if (!expense) {
      throw new Error('Could not record the referral expense.');
    }

    await tx.insert(cashDrawerMovements).values({
      drawerId: drawer.drawer.id,
      createdByUserId: ownerId,
      movementType: 'CASH_EXPENSE',
      direction: 'OUT',
      amount: money(amountCents),
      reason: `Referral reward / ${reward.referrerName}`,
      expenseId: expense.id,
    });

    await tx.insert(referralRewardPayments).values({
      rewardId,
      expenseId: expense.id,
      recordedByUserId: ownerId,
      idempotencyKey,
      amount: money(amountCents),
      paymentMethod: 'CASH',
    });

    const [updated] = await tx
      .update(referralRewards)
      .set({
        paidAmount: money(paidCents + amountCents),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(referralRewards.id, rewardId),
          eq(referralRewards.paidAmount, reward.paidAmount),
        ),
      )
      .returning({ id: referralRewards.id });

    if (!updated) {
      throw new Error('Reward balance changed. Payment cancelled.');
    }

    return 'recorded';
  });
}
