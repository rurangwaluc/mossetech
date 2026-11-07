import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  externalCustomerPayments,
  externalSales,
  referralRewards,
  sales,
} from '@mossetech/db/schema';
import { requireOwner } from '@/lib/auth/session';
import {
  createReferralRewardAction,
  payReferralRewardAction,
} from '@/lib/referrals/actions';

type Props = {
  searchParams?: Promise<{
    created?: string;
    payment?: string;
    error?: string;
  }>;
};

function money(value: string | number): string {
  return `RWF ${Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;
}

export default async function ReferralsPage({ searchParams }: Props) {
  await requireOwner();

  const params = await searchParams;

  const [rewards, availableSales] = await Promise.all([
    db.select({
      id: referralRewards.id,
      saleId: referralRewards.saleId,
      externalSaleId: referralRewards.externalSaleId,
      externalStatus: externalSales.status,
      externalTotal: externalSales.customerTotal,
      referrerName: referralRewards.referrerName,
      amount: referralRewards.amount,
      paidAmount: referralRewards.paidAmount,
      customerName: sql<string | null>`COALESCE(${sales.customerName}, ${externalSales.customerName})`,
      createdAt: referralRewards.createdAt,
    })
      .from(referralRewards)
      .leftJoin(sales, eq(referralRewards.saleId, sales.id))
      .leftJoin(externalSales, eq(referralRewards.externalSaleId, externalSales.id))
      .orderBy(desc(referralRewards.createdAt))
      .limit(100),

    db.select({
      id: sales.id,
      customerName: sales.customerName,
      totalAmount: sales.totalAmount,
      paidAmount: sales.paidAmount,
      balanceAmount: sales.balanceAmount,
    })
      .from(sales)
      .orderBy(desc(sales.createdAt))
      .limit(100),
  ]);

  const externalIds = rewards
    .map((reward) => reward.externalSaleId)
    .filter((id): id is string => Boolean(id));
  const externalPaymentTotals = externalIds.length
    ? await db.select({
        externalSaleId: externalCustomerPayments.externalSaleId,
        paid: sql<string>`COALESCE(SUM(${externalCustomerPayments.amount}), 0)`,
      }).from(externalCustomerPayments)
        .where(inArray(externalCustomerPayments.externalSaleId, externalIds))
        .groupBy(externalCustomerPayments.externalSaleId)
    : [];
  const externalPaid = new Map(
    externalPaymentTotals.map((row) => [row.externalSaleId, row.paid]),
  );
  const isCancelled = (reward: (typeof rewards)[number]) =>
    reward.externalSaleId !== null && reward.externalStatus === 'CANCELLED';
  const isEligibleExternal = (reward: (typeof rewards)[number]) =>
    Boolean(reward.externalSaleId) &&
    reward.externalStatus === 'POSTED' &&
    Number(reward.externalTotal) > 0 &&
    Number(externalPaid.get(reward.externalSaleId! ) ?? 0) === Number(reward.externalTotal) &&
    Number(reward.amount) <= Number(reward.externalTotal);

  const usedSales = new Set(rewards.map((reward) => reward.saleId));

  const eligibleSales = availableSales.filter((sale) =>
    Number(sale.totalAmount) > 0 &&
    Number(sale.balanceAmount) === 0 &&
    Number(sale.paidAmount) === Number(sale.totalAmount) &&
    !usedSales.has(sale.id)
  );

  const rewardTotal = rewards.reduce(
    (sum, reward) => sum + (isCancelled(reward) ? 0 : Number(reward.amount)), 0
  );
  const paidTotal = rewards.reduce(
    (sum, reward) => sum + (isCancelled(reward) ? 0 : Number(reward.paidAmount)), 0
  );
  const owedTotal = Math.max(0, rewardTotal - paidTotal);

  const errorMessages: Record<string, string> = {
    'invalid-sale': 'Please select a valid sale.',
    'invalid-details': 'Check the referrer name and notes.',
    'invalid-amount': 'Enter a valid reward amount.',
    'ineligible': 'This sale is not eligible for a referral reward.',
    'duplicate': 'A referral reward already exists for this sale.',
    'save-failed': 'The referral could not be saved.',
    'payment-failed':
      'Payment was not recorded. Check the reward balance, sale and available cash.',
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm text-[var(--muted)]">Sales / Referrals</p>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Referral rewards
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Record who brought a customer and track agreed rewards.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['Total agreed', rewardTotal],
          ['Already paid', paidTotal],
          ['Still owed', owedTotal],
        ].map(([label, amount]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-[var(--border)] p-4"
          >
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-xl font-bold text-[var(--text)]">
              {money(Number(amount))}
            </p>
          </div>
        ))}
      </div>

      {params?.payment === 'recorded' && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Referral payment recorded successfully.
        </p>
      )}

      {params?.created === '1' && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Referral reward recorded successfully.
        </p>
      )}

      {params?.error && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {errorMessages[params.error] ?? 'Please review the referral.'}
        </p>
      )}

      <section className="rounded-xl border border-[var(--border)] p-4 md:p-5">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          Record a referral
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          One agreed reward per fully paid sale. No payment is made here.
        </p>

        <form
          action={createReferralRewardAction}
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <label className="space-y-1 text-sm">
            <span>Customer sale</span>
            <select
              name="saleId"
              required
              defaultValue=""
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <option value="" disabled>Select a fully paid sale</option>
              {eligibleSales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.customerName || 'Walk-in customer'} — {money(sale.totalAmount)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span>Referred by</span>
            <input
              name="referrerName"
              required
              minLength={2}
              maxLength={160}
              placeholder="Name of the person who referred the customer"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span>Agreed reward (RWF)</span>
            <input
              name="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="e.g. 10000"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span>Notes (optional)</span>
            <input
              name="notes"
              maxLength={1000}
              placeholder="Reason or agreed reward terms"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-white"
            >
              Record referral reward
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[var(--border)] p-4 md:p-5">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          Referral history
        </h2>
        <div className="mt-4 space-y-3">
          {rewards.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No referral rewards recorded yet.
            </p>
          )}
          {rewards.map((reward) => {
            const outstanding = Math.max(
              0,
              Number(reward.amount) - Number(reward.paidAmount)
            );
            const canPay = reward.externalSaleId
              ? isEligibleExternal(reward)
              : true;
            const status = isCancelled(reward)
              ? 'Sale cancelled'
              : outstanding === 0
              ? 'Paid'
              : Number(reward.paidAmount) > 0
                ? 'Partly paid'
                : 'Not paid';

            return (
              <div
                key={reward.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-4"
              >
                <div>
                  <p className="font-semibold text-[var(--text)]">
                    {reward.referrerName}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Customer: {reward.customerName || 'Walk-in customer'}
                  </p>
                  <Link
                    href={reward.externalSaleId
                      ? `/sales/external/${reward.externalSaleId}`
                      : `/sales/${reward.saleId}`}
                    className="text-sm underline"
                  >
                    View sale
                  </Link>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(reward.amount)}</p>
                  <p className="text-sm">{status}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Still owed: {money(outstanding)}
                  </p>
                  {reward.externalSaleId && outstanding > 0 && !canPay && !isCancelled(reward) && (
                    <p className="text-xs text-[var(--muted)]">
                      Payout available after full customer payment.
                    </p>
                  )}
                  {outstanding > 0 && canPay && (
                    <form
                      action={payReferralRewardAction}
                      className="mt-3 flex flex-wrap items-center justify-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="rewardId"
                        value={reward.id}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={randomUUID()}
                      />
                      <label className="text-xs">
                        <span className="sr-only">
                          Cash payment amount in RWF
                        </span>
                        <input
                          name="amount"
                          type="number"
                          min="0.01"
                          max={outstanding.toFixed(2)}
                          step="0.01"
                          required
                          placeholder="Amount in RWF"
                          className="w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                      >
                        Record cash payment
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-[var(--muted)]">
        Payments are recorded as expenses only when paid.
        An open cash drawer with enough cash is required.
        Unpaid rewards remain outstanding obligations.
      </p>
    </main>
  );
}
