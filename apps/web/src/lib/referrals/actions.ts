'use server';

import { revalidatePath } from 'next/cache';
import {
  executeReferralCashPayment,
} from './payment-transaction';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  referralRewards,
  saleReturns,
  sales,
} from '@mossetech/db/schema';
import { requireOwner } from '@/lib/auth/session';

function validUuid(value: FormDataEntryValue | null): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error('Choose a valid sale.');
  }
  return value;
}

function amountInCents(value: FormDataEntryValue | null): number {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)
  ) {
    throw new Error('Enter a valid reward amount.');
  }

  const [whole, decimals = ''] = value.split('.');
  const cents = Number(whole) * 100 +
    Number(decimals.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error('Reward must be greater than zero.');
  }
  return cents;
}

export async function createReferralRewardAction(form: FormData) {
  const owner = await requireOwner();

  let saleId: string;

  try {
    saleId = validUuid(form.get('saleId'));
  } catch {
    redirect('/referrals?error=invalid-sale');
  }

  const referrerName = String(form.get('referrerName') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();

  if (
    referrerName.length < 2 ||
    referrerName.length > 160 ||
    notes.length > 1000
  ) {
    redirect('/referrals?error=invalid-details');
  }

  let cents: number;

  try {
    cents = amountInCents(form.get('amount'));
  } catch {
    redirect('/referrals?error=invalid-amount');
  }

  let result: 'created' | 'ineligible' | 'duplicate' = 'ineligible';

  try {
    result = await db.transaction(async (tx) => {
      // Serialize referral creation with other sale operations.
      await tx.execute(sql`
        SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE
      `);

      const [sale] = await tx
        .select()
        .from(sales)
        .where(eq(sales.id, saleId))
        .limit(1);

      if (!sale) return 'ineligible';

      const total = Number(sale.totalAmount);
      const paid = Number(sale.paidAmount);
      const balance = Number(sale.balanceAmount);

      if (
        !Number.isFinite(total) ||
        !Number.isFinite(paid) ||
        total <= 0 ||
        balance !== 0 ||
        paid !== total ||
        cents > Math.round(total * 100)
      ) {
        return 'ineligible';
      }

      const existingReturns = await tx
        .select({ id: saleReturns.id })
        .from(saleReturns)
        .where(eq(saleReturns.saleId, saleId))
        .limit(1);

      if (existingReturns.length) return 'ineligible';

      const inserted = await tx
        .insert(referralRewards)
        .values({
          saleId,
          referrerName,
          recordedByUserId: owner.id,
          amount: (cents / 100).toFixed(2),
          notes: notes || null,
        })
        .onConflictDoNothing()
        .returning({ id: referralRewards.id });

      return inserted.length ? 'created' : 'duplicate';
    });
  } catch {
    redirect('/referrals?error=save-failed');
  }

  if (result !== 'created') {
    redirect(`/referrals?error=${result}`);
  }

  revalidatePath('/referrals');
  revalidatePath(`/sales/${saleId}`);
  redirect('/referrals?created=1');
}


export async function payReferralRewardAction(form: FormData) {
  // Authorization is checked on every submission,
  // not just when rendering the page.
  const owner = await requireOwner();

  const rewardId = form.get('rewardId');
  const idempotencyKey = form.get('idempotencyKey');
  const amount = form.get('amount');

  if (
    typeof rewardId !== 'string' ||
    typeof idempotencyKey !== 'string' ||
    typeof amount !== 'string'
  ) {
    redirect('/referrals?error=payment-failed');
  }

  try {
    await executeReferralCashPayment({
      ownerId: owner.id,
      rewardId,
      idempotencyKey,
      amount,
    });
  } catch {
    redirect('/referrals?error=payment-failed');
  }

  revalidatePath('/referrals');
  revalidatePath('/expenses');
  revalidatePath('/money');
  revalidatePath('/reports');

  redirect('/referrals?payment=recorded');
}
