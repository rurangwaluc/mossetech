'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  completeExternalSaleAction,
  receiveExternalCustomerPaymentAction,
} from '@/lib/external-sales/actions';
import {
  payExternalSupplierAction,
} from '@/lib/external-sales/settlement-actions';

type Props = {
  saleId: string;
  supplierId: string;
  status: string;
  customerBalance: number;
  supplierBalance: number;
};

const inputClass =
  'mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]';

export function ExternalPaymentActions({
  saleId,
  supplierId,
  status,
  customerBalance,
  supplierBalance,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [customerKey, setCustomerKey] = useState(() => crypto.randomUUID());
  const [supplierKey, setSupplierKey] = useState(() => crypto.randomUUID());

  function completeSale() {
    const confirmed = window.confirm(
      'Complete this external sale? This records the sale and the agreed ' +
      'amount owed to the source shop. No customer or supplier payment ' +
      'will be recorded automatically.'
    );

    if (!confirmed) return;

    setMessage('');

    startTransition(async () => {
      const result = await completeExternalSaleAction(saleId);

      if (!result.success) {
        setMessage(result.error || 'Could not complete sale.');
        return;
      }

      router.refresh();
    });
  }

  function receivePayment(formData: FormData) {
    setMessage('');
    formData.set('externalSaleId', saleId);
    formData.set('idempotencyKey', customerKey);

    startTransition(async () => {
      const result = await receiveExternalCustomerPaymentAction(formData);

      if (!result.success) {
        setMessage(result.error || 'Could not receive payment.');
        return;
      }

      setCustomerKey(crypto.randomUUID());
      router.refresh();
    });
  }

  function paySupplier(formData: FormData) {
    setMessage('');
    formData.set('externalSaleId', saleId);
    formData.set('supplierId', supplierId);
    formData.set('idempotencyKey', supplierKey);

    startTransition(async () => {
      const result = await payExternalSupplierAction(formData);

      if (!result.success) {
        setMessage(result.error || 'Could not pay supplier.');
        return;
      }

      setSupplierKey(crypto.randomUUID());
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      {message ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--border)] p-3 text-sm font-semibold text-red-600"
        >
          {message}
        </p>
      ) : null}

      {status === 'DRAFT' ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-lg font-bold text-[var(--text)]">
            Complete sale
          </h2>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Completing this sale records the selling amount and the cost owed
            to the source shop. Customer payments and payments to the
            source shop are recorded separately afterward. Your own stock
            will not be reduced.
          </p>

          <button
            type="button"
            disabled={pending}
            onClick={completeSale}
            className="mt-4 rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? 'Processing...' : 'Complete sale'}
          </button>
        </div>
      ) : null}

      {status === 'POSTED' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <form
            action={receivePayment}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
          >
            <h2 className="text-lg font-bold text-[var(--text)]">
              Receive payment
            </h2>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Customer owes: {customerBalance.toFixed(2)} RWF
            </p>

            <label className="mt-4 block text-sm font-semibold text-[var(--text)]">
              Amount received (RWF)
              <input
                name="amount"
                type="number"
                min="0.01"
                max={customerBalance.toFixed(2)}
                step="0.01"
                required
                className={inputClass}
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-[var(--text)]">
              Payment method
              <select
                name="paymentMethod"
                className={inputClass}
                defaultValue="CASH"
              >
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="BANK">Bank</option>
                <option value="CARD">Card</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={pending || customerBalance <= 0}
              className="mt-5 w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? 'Processing...' : 'Record customer payment'}
            </button>
          </form>

          <form
            action={paySupplier}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
          >
            <h2 className="text-lg font-bold text-[var(--text)]">
              Pay supplier
            </h2>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Supplier owed: {supplierBalance.toFixed(2)} RWF
            </p>

            <label className="mt-4 block text-sm font-semibold text-[var(--text)]">
              Amount to pay (RWF)
              <input
                name="amount"
                type="number"
                min="0.01"
                max={supplierBalance.toFixed(2)}
                step="0.01"
                required
                className={inputClass}
              />
            </label>

            <input type="hidden" name="paymentMethod" value="CASH" />

            <p className="mt-4 text-sm text-[var(--muted)]">
              Cash payment from the open drawer.
            </p>

            <button
              type="submit"
              disabled={pending || supplierBalance <= 0}
              className="mt-5 w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? 'Processing...' : 'Record supplier payment'}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
