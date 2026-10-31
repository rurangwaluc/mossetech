'use client';

import { useState, useTransition } from 'react';

import { cancelZechariahDuplicateAction } from
  '@/lib/external-sales/paid-duplicate-actions';

export function PaidDuplicateForm() {
  const [reason, setReason] = useState(
    'Mistaken duplicate of Zechariah sale created on 30 October 2026 at 17:09. '
    + 'The 17:07 record was entered in error. '
    + 'Mobile Money receipt requires reconciliation.'
  );
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [completed, setCompleted] = useState(false);

  function submit() {
    if (!confirmed || pending || completed) return;

    startTransition(async () => {
      const result = await cancelZechariahDuplicateAction(reason);

      if (result.success) {
        setCompleted(true);
        setMessage(
          'Duplicate cancelled. The Mobile Money payment is preserved '
          + 'and still requires reconciliation.'
        );
      } else {
        setMessage(result.error || 'Correction failed.');
      }
    });
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <h3 className="text-lg font-black text-[var(--text)]">
        Correct duplicate sale
      </h3>

      <p className="mt-2 text-sm text-[var(--muted)]">
        This sale was identified as a duplicate of Zechariah&apos;s
        genuine sale created at 17:09 on 30 October 2026.
      </p>

      <p className="mt-3 text-sm font-bold text-amber-700 dark:text-amber-400">
        Important: Cancelling this mistaken sale will not remove
        the 735,000 RWF Mobile Money payment from financial records.
        That payment must be reconciled separately.
      </p>

      <label
        htmlFor="paid-duplicate-reason"
        className="mt-4 block text-sm font-bold text-[var(--text)]"
      >
        Correction reason
      </label>

      <textarea
        id="paid-duplicate-reason"
        value={reason}
        onChange={event => setReason(event.target.value)}
        disabled={pending || completed}
        rows={4}
        maxLength={2000}
        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--text)]"
      />

      <label className="mt-4 flex items-start gap-3 text-sm text-[var(--text)]">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          disabled={pending || completed}
          className="mt-1"
        />
        I confirm that the 17:07 sale was created by mistake
        and that its Mobile Money payment must remain recorded
        pending reconciliation.
      </label>

      <button
        type="button"
        disabled={
          pending ||
          completed ||
          !confirmed ||
          reason.trim().length < 20
        }
        onClick={submit}
        className="mt-4 min-h-11 rounded-lg border border-red-600 px-5 text-sm font-bold text-red-600 transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? 'Correcting...'
          : completed
            ? 'Corrected'
            : 'Confirm duplicate correction'}
      </button>

      {message ? (
        <p role="status" className="mt-3 text-sm text-[var(--text)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
