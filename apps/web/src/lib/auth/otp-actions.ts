'use server';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  checkOtpSourceRateLimit,
} from './otp-source-rate-limit';

import {
  requestEmailOtp,
} from './request-email-otp';

import {
  verifyEmailOtpChallenge,
} from './verify-email-otp';

import {
  clearOtpChallengeCookie,
  readOtpChallengeCookie,
  setOtpChallengeCookie,
} from './otp-challenge-cookie';

import {
  setSessionCookie,
} from './session';

export type OtpLoginState = {
  step: 'email' | 'code';
  message?: string;
  error?: string;
};

const GENERIC_MESSAGE =
  'If this email has access, a verification code has been sent.';

async function getRequestSource(): Promise<string> {
  if (process.env.NODE_ENV !== 'production') {
    return 'local-development';
  }

  // Trust Vercel's forwarding header only inside its runtime.
  // Vercel replaces externally supplied X-Forwarded-For values
  // on its normal ingress path.
  if (
    process.env.VERCEL !== '1' ||
    process.env.VERCEL_ENV !== 'production'
  ) {
    throw new Error('Production OTP source protection is unavailable.');
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.trim();

  // Never accept an unverified forwarding chain or malformed IP.
  if (!forwardedFor || isIP(forwardedFor) === 0) {
    throw new Error('Trusted production client IP is unavailable.');
  }

  return forwardedFor;
}

export async function requestOtpAction(
  _previous: OtpLoginState,
  formData: FormData,
): Promise<OtpLoginState> {
  // Never retain a challenge from a previous login attempt.
  await clearOtpChallengeCookie();

  const rawEmail = formData.get('email');
  const email =
    typeof rawEmail === 'string'
      ? rawEmail.trim().toLowerCase()
      : '';

  if (
    email.length > 180 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
  ) {
    return {
      step: 'email',
      error: 'Enter a valid email address.',
    };
  }

  const source = await getRequestSource();

  const allowed =
    await checkOtpSourceRateLimit(source);

  if (!allowed) {
    return {
      step: 'email',
      error: 'Too many requests. Please try again later.',
    };
  }

  const result = await requestEmailOtp(email);

  // Always establish an opaque challenge flow, including
  // for unknown, disabled or rate-limited accounts.
  // A dummy reference never corresponds to a real challenge.
  await setOtpChallengeCookie(
    result.challengeId ?? randomUUID(),
    email,
  );

  return {
    step: 'code',
    message: GENERIC_MESSAGE,
  };
}

export async function verifyOtpAction(
  _previous: OtpLoginState,
  formData: FormData,
): Promise<OtpLoginState> {
  const rawCode = formData.get('code');

  const code =
    typeof rawCode === 'string'
      ? rawCode.trim()
      : '';

  if (!/^\d{6}$/.test(code)) {
    return {
      step: 'code',
      error: 'Enter the six-digit verification code.',
    };
  }

  const challenge = await readOtpChallengeCookie();

  if (!challenge) {
    return {
      step: 'code',
      error: 'This code is invalid or has expired.',
    };
  }

  const result = await verifyEmailOtpChallenge({
    ...challenge,
    code,
  });

  if (!result.success) {
    return {
      step: 'code',
      error: 'This code is invalid or has expired.',
    };
  }

  await setSessionCookie(
    result.token,
    result.expiresAt,
  );

  await clearOtpChallengeCookie();

  redirect('/dashboard');
}
