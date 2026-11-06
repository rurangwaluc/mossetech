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
  cashRefundEnabled,
}: {
  saleId: string;
  items: Item[];
  originalItems: { id: string; quantity: number; unitPrice: string }[];
  previousReturns: { saleItemId: string; quantity: number }[];
  originalDiscount: string;
  alreadyPaid: string;
  currentSaleTotal: string;
  cashRefundEnabled: boolean;
}) {
  const [key] = useState(() => crypto.randomUUID());

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<
    Record<string, 'RESTOCK' | 'DAMAGED'>
  >({});
  const [reason, setReason] = useState('');
  const [refundConfirmed, setRefundConfirmed] = useState(false);

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

  let preview: { credit: number; balance: number; refundDue: number } | null = null;
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
      };
    } catch {
      preview = null;
    }
  }

  const requiresRefund = Boolean(preview && preview.refundDue > 0);
  const completed = Boolean(state.success);

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6"
    >
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {requiresRefund && cashRefundEnabled ? (
        <>
          <input type="hidden" name="refundMethod" value="CASH" />
          <input
            type="hidden"
            name="cashRefundExpectedAmount"
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
          <h2 className="text-base font-bold text-[var(--text)]">
            Products being returned
          </h2>

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
        Reason for return
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

      {preview ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <h3 className="text-sm font-bold text-[var(--text)]">Return summary</h3>
          <div className="flex justify-between gap-3 text-sm text-[var(--text)]">
            <span>Return credit</span>
            <strong>{preview.credit.toLocaleString('en-RW')} RWF</strong>
          </div>
          <div className="flex justify-between gap-3 text-sm text-[var(--text)]">
            <span>Remaining customer debt</span>
            <strong>{preview.balance.toLocaleString('en-RW')} RWF</strong>
          </div>
          {requiresRefund ? (
            cashRefundEnabled ? (
              <label className="block space-y-3 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text)]">
                <span className="font-bold">
                  Cash refund: {preview.refundDue.toLocaleString('en-RW')} RWF
                </span>
                <span className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="cashRefundConfirmed"
                    value="YES"
                    checked={refundConfirmed}
                    disabled={pending || completed}
                    onChange={event => setRefundConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I have checked the exact refund amount and confirm the
                    cash will be returned to the customer. The cash drawer must
                    have sufficient funds.
                  </span>
                </span>
              </label>
            ) : (
              <p role="alert" className="text-sm font-semibold text-red-600">
                This return requires a {preview.refundDue.toLocaleString('en-RW')} RWF
                customer refund. Refund payouts are not enabled; this return
                cannot be recorded.
              </p>
            )
          ) : (
            <p className="text-xs text-[var(--muted)]">
              No customer payout is required. Final amounts are checked again on saving.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Select a quantity to review the return before confirming.
        </p>
      )}

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
          (requiresRefund && (!cashRefundEnabled || !refundConfirmed)) ||
          !reason.trim()
        }
        className="w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Recording return...' : 'Confirm product return'}
      </button>
    </form>
  );
}
