'use client';

import { useState, useTransition } from 'react';

import { cancelUnpaidExternalSaleAction } from
  '@/lib/external-sales/cancellation-actions';

export function CancelExternalSaleForm({
  externalSaleId,
}: {
  externalSaleId: string;
}) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!confirm || pending || done) return;

    startTransition(async () => {
      const result = await cancelUnpaidExternalSaleAction(
        externalSaleId,
        reason,
      );

      if (result.success) {
        setDone(true);
        setMessage('Sale cancelled successfully.');
      } else {
        setMessage(result.error || 'Cancellation failed.');
      }
    });
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <h3 className="text-lg font-black text-[var(--text)]">
        Cancel sale
      </h3>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Available only for sales without recorded payments.
        Cancellation is permanent and recorded for auditing.
      </p>

      <label
        htmlFor="external-cancel-reason"
        className="mt-4 block text-sm font-bold text-[var(--text)]"
      >
        Reason for cancellation
      </label>
      <textarea
        id="external-cancel-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={pending || done}
        maxLength={2000}
        rows={3}
        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--text)]"
        placeholder="Explain why this sale must be cancelled"
      />

      <label className="mt-4 flex items-start gap-3 text-sm text-[var(--text)]">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(event) => setConfirm(event.target.checked)}
          disabled={pending || done}
          className="mt-1"
        />
        I confirm that this sale should be cancelled.
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending || done || !confirm || reason.trim().length < 10}
        className="mt-4 min-h-11 rounded-lg border border-red-600 px-5 text-sm font-bold text-red-600 transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Cancelling...' : done ? 'Cancelled' : 'Cancel sale'}
      </button>

      {message ? (
        <p role="status" className="mt-3 text-sm text-[var(--text)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
