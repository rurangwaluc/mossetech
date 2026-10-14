'use client';

import { useActionState } from 'react';
import { changeOwnerPasswordAction } from '@/lib/settings/password-actions';

const inputClass =
  'h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)] dark:border-[#343434] dark:bg-[#1B1B1B] dark:text-[#F5F5F5]';

export function PasswordForm() {
  const [
    state,
    action,
    pending,
  ] = useActionState(
    changeOwnerPasswordAction,
    {},
  );

  return (
    <section className="w-full">
      <div className="max-w-5xl">
        <h2 className="font-display text-xl font-black tracking-tight text-[#222222] dark:text-[#F5F5F5]">
          Password
        </h2>

        <p className="mt-1 text-sm font-semibold leading-6 text-[#6B7280] dark:text-[#A3A3A3]">
          Change the password used to sign in to the owner account.
        </p>

        <form
          action={action}
          className="mt-5 max-w-5xl space-y-5"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor="currentPassword"
                className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
              >
                Current password
              </label>

              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                className={
                  inputClass
                }
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
              >
                New password
              </label>

              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={
                  inputClass
                }
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
              >
                Confirm password
              </label>

              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={
                  inputClass
                }
              />
            </div>
          </div>

          {state.error ? (
            <div className="rounded-lg border border-[#F2C94C]/50 bg-[#F2C94C]/10 px-4 py-3 text-sm font-bold text-[#8A5A00] dark:text-[#FFD45A]">
              {state.error}
            </div>
          ) : null}

          {state.success ? (
            <div className="rounded-lg border border-[#5F8A63]/40 bg-[#5F8A63]/10 px-4 py-3 text-sm font-bold text-[#5F8A63] dark:text-[#79C27D]">
              {state.success}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                pending
              }
              className="h-11 w-full rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-[#17150F] transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {pending
                ? 'Changing...'
                : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
