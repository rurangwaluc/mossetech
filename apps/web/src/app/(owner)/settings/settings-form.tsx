'use client';

import { useActionState } from 'react';
import { updateBusinessSettingsAction } from '@/lib/settings/actions';

type SettingsFormProps = {
  settings: {
    businessName: string;
    phone: string;
    address: string;
  };
};

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
    >
      {children}
    </label>
  );
}

const inputClass =
  'h-11 w-full rounded-[6px] border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)] dark:border-[#343434] dark:bg-[#1B1B1B] dark:text-[#F5F5F5]';

export function SettingsForm({
  settings,
}: SettingsFormProps) {
  const [
    state,
    action,
    pending,
  ] = useActionState(
    updateBusinessSettingsAction,
    {},
  );

  return (
    <form
      action={action}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="businessName">
            Business name
          </FieldLabel>

          <input
            id="businessName"
            name="businessName"
            defaultValue={
              settings.businessName
            }
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="phone">
            Business phone
          </FieldLabel>

          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={
              settings.phone
            }
            placeholder="+250..."
            className={inputClass}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <FieldLabel htmlFor="address">
            Business address
          </FieldLabel>

          <textarea
            id="address"
            name="address"
            defaultValue={
              settings.address
            }
            rows={3}
            placeholder="Kigali, Rwanda or full business address"
            className="w-full resize-none rounded-[6px] border border-neutral-200 bg-white px-3.5 py-3 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)] dark:border-[#343434] dark:bg-[#1B1B1B] dark:text-[#F5F5F5]"
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]">
            Currency
          </span>

          <div className="flex h-11 items-center justify-between rounded-[6px] border border-neutral-200 bg-neutral-50 px-3.5 dark:border-[#343434] dark:bg-[#171817]">
            <span className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]">
              RWF
            </span>

            <span className="text-xs font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
              Rwandan franc
            </span>
          </div>
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

      <div className="flex justify-end border-t border-neutral-100 pt-5 dark:border-[#2A2A2A]">
        <button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-[6px] bg-[var(--primary)] px-5 text-sm font-black text-[#17150F] transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {pending
            ? 'Saving...'
            : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
