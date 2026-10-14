'use client';

import { useActionState } from 'react';
import { updateOwnerProfileAction } from '@/lib/settings/actions';

type OwnerAccountFormProps = {
  owner: {
    name: string;
    email: string;
    phone: string;
  };
};

const inputClass =
  'h-11 w-full rounded-[6px] border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)] dark:border-[#343434] dark:bg-[#1B1B1B] dark:text-[#F5F5F5]';

const readOnlyInputClass =
  'h-11 w-full cursor-default rounded-[6px] border border-neutral-200 bg-neutral-50 px-3.5 text-sm font-semibold text-[#6B7280] outline-none dark:border-[#343434] dark:bg-[#171817] dark:text-[#A3A3A3]';

export function OwnerAccountForm({
  owner,
}: OwnerAccountFormProps) {
  const [
    state,
    action,
    pending,
  ] = useActionState(
    updateOwnerProfileAction,
    {},
  );

  return (
    <section>
<h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[#222222] dark:text-[#F5F5F5]">
        Owner account
      </h2>

      <p className="mt-1 text-sm font-semibold leading-6 text-[#6B7280] dark:text-[#A3A3A3]">
        Manage the owner profile used to access Bloom Kigali.
      </p>

      <form
        action={action}
        className="mt-6 space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="ownerName"
              className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
            >
              Owner name
            </label>

            <input
              id="ownerName"
              name="name"
              defaultValue={owner.name}
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="ownerEmail"
              className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
            >
              Sign-in email
            </label>

            <input
              id="ownerEmail"
              type="email"
              value={owner.email}
              readOnly
              aria-readonly="true"
              className={readOnlyInputClass}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="ownerPhone"
              className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
            >
              Owner phone
            </label>

            <input
              id="ownerPhone"
              name="phone"
              type="tel"
              defaultValue={owner.phone}
              placeholder="+250..."
              className={inputClass}
            />
          </div>
        </div>

        {state.error ? (
          <div className="rounded-[6px] border border-[#F2C94C]/50 bg-[#F2C94C]/10 px-4 py-3 text-sm font-bold text-[#8A5A00] dark:text-[#FFD45A]">
            {state.error}
          </div>
        ) : null}

        {state.success ? (
          <div className="rounded-[6px] border border-[#5F8A63]/40 bg-[#5F8A63]/10 px-4 py-3 text-sm font-bold text-[#5F8A63] dark:text-[#79C27D]">
            {state.success}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="h-11 w-full rounded-[6px] bg-[var(--primary)] px-5 text-sm font-black text-[#17150F] transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {pending
              ? 'Saving...'
              : 'Save account'}
          </button>
        </div>
      </form>
    </section>
  );
}
