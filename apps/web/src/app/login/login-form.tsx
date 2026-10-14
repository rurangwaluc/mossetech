'use client';

import {
  Eye,
  EyeOff,
  LoaderCircle,
} from 'lucide-react';
import {
  useActionState,
  useState,
} from 'react';
import { loginAction } from '@/lib/auth/actions';

export function LoginForm() {
  const [state, action, pending] =
    useActionState(loginAction, {});

  const [showPassword, setShowPassword] =
    useState(false);

  return (
    <form
      action={action}
      className="space-y-4 sm:space-y-5"
    >
      <div className="space-y-1.5 sm:space-y-2">
        <label
          htmlFor="email"
          className="text-xs font-bold text-[var(--text)]"
        >
          Email address
        </label>

        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="bloomkigali@gmail.com"
          className="h-11 w-full rounded-[4px] border border-[var(--border-strong)] bg-[var(--background)] px-4 text-sm sm:h-12 font-medium text-[var(--text)] outline-none transition placeholder:font-normal placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]"
        />
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        <label
          htmlFor="password"
          className="text-xs font-bold text-[var(--text)]"
        >
          Password
        </label>

        <div className="relative">
          <input
            id="password"
            name="password"
            type={
              showPassword
                ? 'text'
                : 'password'
            }
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            className="h-11 w-full rounded-[4px] border border-[var(--border-strong)] bg-[var(--background)] px-4 pr-12 text-sm sm:h-12 font-medium text-[var(--text)] outline-none transition placeholder:font-normal placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]"
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword(
                (current) => !current,
              )
            }
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[3px] text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            aria-label={
              showPassword
                ? 'Hide password'
                : 'Show password'
            }
            title={
              showPassword
                ? 'Hide password'
                : 'Show password'
            }
          >
            {showPassword ? (
              <EyeOff
                className="h-4 w-4"
                aria-hidden="true"
              />
            ) : (
              <Eye
                className="h-4 w-4"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </div>

      {state.error ? (
        <div
          role="alert"
          className="border-l-2 border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2.5 text-xs font-semibold leading-5 text-[var(--text)]"
        >
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center sm:h-12 justify-center gap-2 rounded-[4px] border border-[var(--primary)] bg-[var(--primary)] px-5 text-sm font-bold text-[#17150F] transition hover:border-[var(--primary-strong)] hover:bg-[var(--primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--primary)] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? (
          <>
            <LoaderCircle
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
            Signing in...
          </>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  );
}
