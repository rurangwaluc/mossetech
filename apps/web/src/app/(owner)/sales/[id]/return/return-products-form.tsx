'use client';

import { useActionState, useState } from 'react';
import { prepareSaleReturn } from '@/lib/sales/return-items';

import {
  recordProductReturnAction,
  type ProductReturnState,
} from '@/lib/sales/return-actions';

type Item = {
  id: string;
  name: string;
  sold: number;
  returned: number;
  remaining: number;
  unitPrice: string;
};

export function ReturnProductsForm({
  saleId,
  items,
  originalItems,
  previousReturns,
  originalDiscount,
  alreadyPaid,
  currentSaleTotal,
  customerLinked,
  existingCustomerCredit,
}: {
  saleId: string;
  items: Item[];
  originalItems: { id: string; quantity: number; unitPrice: string }[];
  previousReturns: { saleItemId: string; quantity: number }[];
  originalDiscount: string;
  alreadyPaid: string;
  currentSaleTotal: string;
  customerLinked: boolean;
  existingCustomerCredit: number;
}) {
  const [key] = useState(() => crypto.randomUUID());

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<
    Record<string, 'RESTOCK' | 'DAMAGED'>
  >({});
  const [reason, setReason] = useState('');
  const [creditConfirmed, setCreditConfirmed] = useState(false);

  const [state, action, pending] = useActionState<
    ProductReturnState,
    FormData
  >(
    recordProductReturnAction,
    {},
  );

  const selected = items
    .filter((item) => (quantities[item.id] || 0) > 0)
    .map((item) => ({
      saleItemId: item.id,
      quantity: quantities[item.id],
      condition: conditions[item.id] || 'RESTOCK',
    }));

  const toCents = (amount: string) => {
    const [whole, fraction = ''] = amount.split('.');
    if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) {
      throw new Error('Invalid financial value');
    }
    const result = Number(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0')));
    if (!Number.isSafeInteger(result)) throw new Error('Money exceeds supported range');
    return result;
  };

  let preview: { credit: number; balance: number; refundDue: number; remainingSale: number; paid: number; previousDebt: number; debtReduction: number } | null = null;
  if (selected.length > 0) {
    try {
      const plan = prepareSaleReturn({
        items: originalItems.map(item => ({
          id: item.id,
          quantity: item.quantity,
          unitPriceCents: toCents(item.unitPrice),
        })),
        previousReturns,
        requestedReturns: selected.map(({ saleItemId, quantity }) => ({
          saleItemId,
          quantity,
        })),
        originalDiscountCents: toCents(originalDiscount),
      });
      const nextTotal = toCents(currentSaleTotal) - plan.newReturnCreditCents;
      const netPaid = toCents(alreadyPaid);
      preview = {
        credit: plan.newReturnCreditCents / 100,
        balance: Math.max(0, nextTotal - netPaid) / 100,
        refundDue: Math.max(0, netPaid - nextTotal) / 100,
        remainingSale: nextTotal / 100,
        paid: netPaid / 100,
        previousDebt: Math.max(0, toCents(currentSaleTotal) - netPaid) / 100,
        debtReduction: (Math.max(0, toCents(currentSaleTotal) - netPaid) - Math.max(0, nextTotal - netPaid)) / 100,
      };
    } catch {
      preview = null;
    }
  }

  const requiresRefund = Boolean(preview && preview.refundDue > 0);
  const completed = Boolean(state.success);
  const formatMoney = (value: number) =>
    `RWF ${new Intl.NumberFormat('en-RW', { maximumFractionDigits: 2 }).format(value)}`;

  return (
    <form
      action={action}
      className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6"
    >
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {requiresRefund && customerLinked ? (
        <>
          <input type="hidden" name="settlementMethod" value="CUSTOMER_CREDIT" />
          <input
            type="hidden"
            name="customerCreditExpectedAmount"
            value={preview ? preview.refundDue.toFixed(2) : ''}
          />
        </>
      ) : null}
      <input
        type="hidden"
        name="returnItems"
        value={JSON.stringify(selected)}
      />

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No products are available for return.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Step 1 · Products</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--text)]">What did the customer bring back?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Set the quantity for each product. Leave 0 for products the customer keeps.</p>
            </div>
            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text)]">
              {selected.length} {selected.length === 1 ? 'product' : 'products'} selected
            </span>
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-[var(--border)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-bold text-[var(--text)]">
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Sold: {item.sold}
                    {' / '}Previously returned: {item.returned}
                    {' / '}Available: {item.remaining}
                  </p>
                </div>

                <p className="text-sm font-semibold text-[var(--text)]">
                  {new Intl.NumberFormat('en-RW').format(
                    Number(item.unitPrice),
                  )} RWF each
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[var(--text)]">
                  Quantity returning
                  <input
                    type="number"
                    min={0}
                    max={item.remaining}
                    step={1}
                    disabled={pending || completed}
                    value={quantities[item.id] ?? 0}
                    onChange={(event) => {
                      const next = Number(event.target.value);

                      setQuantities((current) => ({
                        ...current,
                        [item.id]:
                          Number.isSafeInteger(next)
                            ? Math.max(0, Math.min(item.remaining, next))
                            : 0,
                      }));
                    }}
                    className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--text)]"
                  />
                </label>

                <label className="text-sm font-semibold text-[var(--text)]">
                  Product condition
                  <select
                    disabled={
                      pending ||
                      completed ||
                      !(quantities[item.id] > 0)
                    }
                    value={conditions[item.id] || 'RESTOCK'}
                    onChange={(event) =>
                      setConditions((current) => ({
                        ...current,
                        [item.id]: event.target.value as
                          'RESTOCK' | 'DAMAGED',
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--text)]"
                  >
                    <option value="RESTOCK">Good — return to stock</option>
                    <option value="DAMAGED">Damaged — do not restock</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="block text-sm font-semibold text-[var(--text)]">
        Step 2 · Reason for return
        <textarea
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={2000}
          rows={3}
          disabled={pending || completed}
          placeholder="Why were these products returned?"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-[var(--text)]"
        />
      </label>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5" aria-live="polite">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Step 3 · Before you confirm</p>
          <h3 className="mt-1 text-lg font-bold text-[var(--text)]">What changes after this return?</h3>
        </div>
        {preview ? (
          <>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 text-[var(--muted)]">
                <dt>Current sale total</dt><dd className="tabular-nums">{formatMoney(Number(currentSaleTotal))}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[var(--muted)]">
                <dt>Value of products returned</dt><dd className="font-semibold tabular-nums text-[var(--text)]">− {formatMoney(preview.credit)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-[var(--text)]">
                <dt className="font-bold">New sale total</dt><dd className="text-lg font-black tabular-nums">{formatMoney(preview.remainingSale)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[var(--muted)]">
                <dt>Customer already paid</dt><dd className="tabular-nums">{formatMoney(preview.paid)}</dd>
              </div>
            </dl>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Customer still owes</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">{formatMoney(preview.balance)}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {preview.balance === 0
                  ? 'The outstanding debt will be cleared. Existing payments stay in the history.'
                  : `Debt will decrease by ${formatMoney(preview.debtReduction)}. Only the remaining balance can be collected.`}
              </p>
            </div>
            {requiresRefund ? (
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                <p className="text-base font-bold text-[var(--text)]">
                  Customer credit to record: {formatMoney(preview.refundDue)}
                </p>
                {existingCustomerCredit > 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Existing credit owed: {formatMoney(existingCustomerCredit)}.
                    After this return, total credit owed will be {formatMoney(existingCustomerCredit + preview.refundDue)}.
                  </p>
                ) : null}
                <p className="text-sm text-[var(--muted)]">
                  This money stays owed to the customer. No cash will be refunded,
                  and this credit cannot yet be spent on purchases or paid out.
                </p>
                {!customerLinked ? (
                  <p role="alert" className="text-sm font-semibold text-[var(--text)]">
                    Link this sale to a customer before issuing customer credit.
                  </p>
                ) : (
                  <label className="flex items-start gap-3 text-sm font-medium text-[var(--text)]">
                    <input
                      type="checkbox"
                      name="customerCreditConfirmed"
                      value="YES"
                      checked={creditConfirmed}
                      disabled={pending || completed}
                      onChange={(event) => setCreditConfirmed(event.target.checked)}
                      className="mt-1"
                    />
                    <span>I confirm the business owes the customer exactly {formatMoney(preview.refundDue)} as a recorded credit, with no cash paid out.</span>
                  </label>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No customer credit is due. On confirmation, the sale, debt, stock and return history will be updated together.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Choose at least one product quantity above to see the updated sale and debt before saving.</p>
        )}
      </section>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p role="status" className="text-sm font-semibold text-[var(--text)]">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          pending ||
          completed ||
          selected.length === 0 ||
          !preview ||
          (requiresRefund && (!customerLinked || !creditConfirmed)) ||
          !reason.trim()
        }
        className="w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Recording return...' : requiresRefund && !customerLinked ? 'Link customer to continue' : requiresRefund ? 'Record return and customer credit' : 'Confirm product return'}
      </button>
    </form>
  );
}
