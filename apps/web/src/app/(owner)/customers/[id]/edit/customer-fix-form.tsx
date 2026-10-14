'use client';

import Link from 'next/link';
import {
  useFormStatus,
} from 'react-dom';

import {
  submitCustomerFixAction,
} from '@/lib/customers/actions';


type Props = {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    notes: string | null;
  };

  role:
    | 'OWNER'
    | 'EMPLOYEE';

  hasPendingRequest:
    boolean;

  error:
    | string
    | null;
};


function SubmitButton({
  role,
  disabled,
}: {
  role:
    | 'OWNER'
    | 'EMPLOYEE';

  disabled: boolean;
}) {
  const {
    pending,
  } =
    useFormStatus();

  return (
    <button
      type="submit"
      disabled={
        pending ||
        disabled
      }
      className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? role ===
          'OWNER'
          ? 'Saving...'
          : 'Sending...'
        : role ===
          'OWNER'
          ? 'Save fix'
          : 'Send request'}
    </button>
  );
}


export default function CustomerFixForm({
  customer,
  role,
  hasPendingRequest,
  error,
}: Props) {
  return (
    <form
      action={
        submitCustomerFixAction
      }
      className="space-y-4"
    >
      <input
        type="hidden"
        name="customerId"
        value={
          customer.id
        }
      />

      {error ? (
        <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {hasPendingRequest ? (
        <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          {role ===
          'OWNER' ? (
            <>
              A request is already waiting for this customer.{' '}
              <Link
                href="/requests"
                className="font-black text-[var(--primary)]"
              >
                Review request
              </Link>
            </>
          ) : (
            'A request for this customer is already waiting for the owner.'
          )}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <header className="border-b border-[var(--border)] px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
            Customer details
          </p>

          <h2 className="mt-1 text-xl font-black text-[var(--text)]">
            {role ===
            'OWNER'
              ? 'Fix customer details'
              : 'Ask owner to fix'}
          </h2>

          <p className="mt-1 text-sm font-bold leading-6 text-[var(--muted)]">
            {role ===
            'OWNER'
              ? 'Correct the saved customer information.'
              : 'Change what is wrong. The owner will review it before anything changes.'}
          </p>
        </header>

        <div className="space-y-5 px-5 py-5">
          <label className="block">
            <span className="text-sm font-black text-[var(--text)]">
              Customer name
            </span>

            <input
              name="name"
              defaultValue={
                customer.name
              }
              required
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black text-[var(--text)]">
              Phone
            </span>

            <span className="ml-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              Optional
            </span>

            <input
              name="phone"
              defaultValue={
                customer.phone ||
                ''
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black text-[var(--text)]">
              Notes
            </span>

            <span className="ml-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              Optional
            </span>

            <textarea
              name="notes"
              defaultValue={
                customer.notes ||
                ''
              }
              rows={3}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <label className="block">
          <span className="text-sm font-black text-[var(--text)]">
            What was entered wrong?
          </span>

          <textarea
            name="reason"
            required
            rows={3}
            placeholder="Explain what needs correcting"
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
          />
        </label>

        <p className="mt-3 text-xs font-semibold text-[var(--muted)]">
          This changes the customer record only. Existing sales and payments are not changed.
        </p>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href={`/customers/${customer.id}`}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
          >
            Back
          </Link>

          <SubmitButton
            role={
              role
            }
            disabled={
              hasPendingRequest
            }
          />
        </div>
      </section>
    </form>
  );
}
