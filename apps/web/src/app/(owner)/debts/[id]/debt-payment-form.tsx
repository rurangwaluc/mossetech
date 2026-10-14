'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  enqueueOfflineOperation,
  getOfflineOperation,
} from '@/lib/offline/outbox';

import {
  runOutboxSync,
} from '@/lib/offline/sync';

type DebtPaymentFormProps = {
  saleId: string;
  userId: string;
  balanceAmount: string;
  cashDrawerId:
    | string
    | null;
};

const PAYMENT_METHODS = [
  'CASH',
  'MOBILE_MONEY',
  'BANK',
  'CARD',
] as const;

type PaymentMethod =
  (typeof PAYMENT_METHODS)[number];

function isPaymentMethod(
  value: string,
): value is PaymentMethod {
  return (
    PAYMENT_METHODS as
      readonly string[]
  ).includes(value);
}

export function DebtPaymentForm({
  saleId,
  userId,
  balanceAmount,
  cashDrawerId,
}: DebtPaymentFormProps) {
  const router =
    useRouter();

  const formRef =
    useRef<HTMLFormElement>(
      null,
    );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    queuedLocally,
    setQueuedLocally,
  ] = useState(false);

  const [
    success,
    setSuccess,
  ] = useState<
    string | null
  >(null);

  const [
    clientError,
    setClientError,
  ] = useState<
    string | null
  >(null);

  const hasOpenDrawer =
    Boolean(
      cashDrawerId,
    );

  useEffect(() => {
    function handleCommittedData() {
      setQueuedLocally(false);
    }

    window.addEventListener(
      'bloom-kigali:data-committed',
      handleCommittedData,
    );

    return () => {
      window.removeEventListener(
        'bloom-kigali:data-committed',
        handleCommittedData,
      );
    };
  }, []);

  async function handleSubmit(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const form =
      event.currentTarget;

    const data =
      new FormData(
        form,
      );

    const amountText =
      String(
        data.get(
          'amount',
        ) || '',
      ).trim();

    const methodText =
      String(
        data.get(
          'paymentMethod',
        ) || '',
      );

    const notes =
      String(
        data.get(
          'notes',
        ) || '',
      ).trim();

    const amount =
      Number(
        amountText,
      );

    const balance =
      Number(
        balanceAmount,
      );

    if (
      !amountText ||
      !Number.isFinite(
        amount,
      ) ||
      amount <= 0
    ) {
      setClientError(
        'Enter a valid payment amount.',
      );

      return;
    }

    if (
      !Number.isFinite(
        balance,
      ) ||
      balance <= 0
    ) {
      setClientError(
        'This debt is already cleared.',
      );

      return;
    }

    if (
      amount >
      balance
    ) {
      setClientError(
        'Payment cannot be higher than the unpaid amount.',
      );

      return;
    }

    if (
      !isPaymentMethod(
        methodText,
      )
    ) {
      setClientError(
        'Choose the payment method.',
      );

      return;
    }

    if (
      methodText ===
        'CASH' &&
      !cashDrawerId
    ) {
      setClientError(
        'Open the cash drawer before saving a cash payment.',
      );

      return;
    }

    if (
      notes.length >
      1000
    ) {
      setClientError(
        'Note is too long.',
      );

      return;
    }

    setSaving(true);
    setQueuedLocally(false);
    setSuccess(null);
    setClientError(null);

    const operationId =
      crypto.randomUUID();

    try {
      await enqueueOfflineOperation({
        operationId,

        userId,

        kind:
          'DEBT_PAYMENT',

        payload: {
          saleId,

          paymentMethod:
            methodText,

          amount:
            amountText,

          notes:
            notes || null,

          cashDrawerId:
            methodText ===
              'CASH'
              ? cashDrawerId
              : null,
        },
      });
    } catch (error) {
      setSaving(false);

      setClientError(
        error instanceof
          Error
          ? error.message
          : 'Payment could not be saved on this device.',
      );

      return;
    }

    /*
     * The local outbox write is the durable save
     * while the device is offline.
     */
    if (
      !navigator.onLine
    ) {
      form.reset();

      setQueuedLocally(
        true,
      );

      setSaving(false);

      return;
    }

    /*
     * Online: ask the outbox to commit immediately.
     */
    await runOutboxSync(
      userId,
    );

    let operation =
      await getOfflineOperation(
        operationId,
      );

    /*
     * A global sync may already have owned the
     * sync loop when this payment was enqueued.
     * Give this operation one immediate second pass.
     */
    if (
      operation?.status ===
        'pending' &&
      navigator.onLine
    ) {
      await runOutboxSync(
        userId,
      );

      operation =
        await getOfflineOperation(
          operationId,
        );
    }

    if (
      operation?.status ===
        'completed'
    ) {
      form.reset();

      setSuccess(
        'Payment saved.',
      );

      setSaving(false);

      router.refresh();

      return;
    }

    if (
      operation?.status ===
        'failed' &&
      operation
        .nextAttemptAt ===
        null
    ) {
      setSaving(false);

      setClientError(
        operation.lastError ||
          'Payment could not be saved.',
      );

      return;
    }

    /*
     * A temporary connection/server problem does not
     * lose the payment. It remains in the outbox.
     */
    form.reset();

    setQueuedLocally(
      true,
    );

    setSaving(false);
  }

  return (
    <form
      ref={formRef}
      onSubmit={
        handleSubmit
      }
      className="space-y-4"
    >
      <div>
        <label
          htmlFor="amount"
          className="text-sm font-black text-[var(--text)]"
        >
          Amount paid
        </label>

        <input
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          max={balanceAmount}
          required
          disabled={
            saving ||
            queuedLocally
          }
          placeholder="Enter amount"
          className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div>
        <label
          htmlFor="paymentMethod"
          className="text-sm font-black text-[var(--text)]"
        >
          Paid by
        </label>

        <select
          id="paymentMethod"
          name="paymentMethod"
          defaultValue=""
          required
          disabled={
            saving ||
            queuedLocally
          }
          className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-black text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option
            value=""
            disabled
          >
            Choose payment method
          </option>

          <option
            value="CASH"
            disabled={
              !hasOpenDrawer
            }
          >
            {hasOpenDrawer
              ? 'Cash'
              : 'Cash — open drawer first'}
          </option>

          <option value="MOBILE_MONEY">
            Mobile money
          </option>

          <option value="BANK">
            Bank
          </option>

          <option value="CARD">
            Card
          </option>
        </select>
      </div>

      <div>
        <label
          htmlFor="notes"
          className="text-sm font-black text-[var(--text)]"
        >
          Note{' '}
          <span className="font-semibold text-[var(--muted)]">
            (optional)
          </span>
        </label>

        <input
          id="notes"
          name="notes"
          maxLength={1000}
          disabled={
            saving ||
            queuedLocally
          }
          placeholder="Add a note"
          className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {clientError ? (
        <div className="rounded-lg border border-[#E85D5D]/30 px-3 py-2 text-sm font-bold text-[#E85D5D]">
          {clientError}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-[#5F8A63]/30 px-3 py-2 text-sm font-bold text-[#5F8A63] dark:text-[#79C27D]">
          {success}
        </div>
      ) : null}

      {queuedLocally ? (
        <div className="rounded-lg border border-[var(--primary)]/35 px-3 py-2 text-sm font-bold text-[var(--text)]">
          Payment saved on this device.
          It will update the balance
          after it syncs.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={
          saving ||
          queuedLocally
        }
        className="h-11 w-full rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving
          ? 'Saving...'
          : queuedLocally
            ? 'Waiting to sync'
            : 'Save payment'}
      </button>
    </form>
  );
}
