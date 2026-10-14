'use client';

import { useActionState } from 'react';
import { LoaderCircle } from 'lucide-react';

import {
  requestOtpAction,
  verifyOtpAction,
  type OtpLoginState,
} from '@/lib/auth/otp-actions';

const initialState: OtpLoginState = {
  step: 'email',
};

const inputClass =
  'h-11 w-full rounded-[4px] border border-[var(--border-strong)] ' +
  'bg-[var(--background)] px-4 text-sm font-medium text-[var(--text)] ' +
  'outline-none transition placeholder:font-normal ' +
  'placeholder:text-[var(--muted)] focus:border-[var(--primary)] ' +
  'focus:ring-2 focus:ring-[var(--primary-soft)]';

const buttonClass =
  'flex h-11 w-full items-center justify-center gap-2 rounded-[4px] ' +
  'border border-[var(--primary-action)] bg-[var(--primary-action)] ' +
  'px-5 text-sm font-bold text-[var(--primary-contrast)] ' +
  'transition hover:bg-[var(--primary-action-hover)] ' +
  'disabled:cursor-wait disabled:opacity-70';

export function LoginForm() {
  const [requestState, requestAction, requesting] =
    useActionState(requestOtpAction, initialState);

  const [verifyState, verifyAction, verifying] =
    useActionState(verifyOtpAction, {
      step: 'code',
    } satisfies OtpLoginState);

  if (requestState.step === 'code') {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {requestState.message ||
            'Enter the verification code sent to your email.'}
        </p>

        <form action={verifyAction} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="otp-code"
              className="text-xs font-bold text-[var(--text)]"
            >
              Verification code
            </label>
            <input
              id="otp-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="Enter 6-digit code"
              className={inputClass}
            />
          </div>

          {verifyState.error ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {verifyState.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={verifying}
            className={buttonClass}
          >
            {verifying ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify and sign in'
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full py-2 text-xs font-semibold text-[var(--primary)]"
        >
          Use another email
        </button>
      </div>
    );
  }

  return (
    <form action={requestAction} className="space-y-4 sm:space-y-5">
      <div className="space-y-2">
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
          maxLength={180}
          placeholder="name@example.com"
          className={inputClass}
        />
      </div>

      {requestState.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {requestState.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={requesting}
        className={buttonClass}
      >
        {requesting ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Sending code...
          </>
        ) : (
          'Send verification code'
        )}
      </button>

      <p className="text-center text-xs leading-5 text-[var(--muted)]">
        Access is available only to authorized Mosse Tech staff.
      </p>
    </form>
  );
}
