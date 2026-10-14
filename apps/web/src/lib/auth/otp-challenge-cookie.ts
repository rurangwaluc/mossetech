import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const OTP_CHALLENGE_COOKIE =
  'mossetech_email_otp_challenge';

const COOKIE_MAX_AGE = 5 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret(): string {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET;

  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Email verification is not configured.');
  }

  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', getSecret())
    .update('mossetech:otp-cookie:v1\0')
    .update(value)
    .digest('hex');
}

export function encodeOtpChallengeCookie(
  challengeId: string,
  email: string,
): string {
  const normalizedEmail = email.trim().toLowerCase();

  if (
    !UUID_PATTERN.test(challengeId) ||
    normalizedEmail.length > 180 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
      normalizedEmail,
    )
  ) {
    throw new Error('Invalid OTP challenge.');
  }

  const expiresAt = Date.now() + COOKIE_MAX_AGE * 1000;

  const payload = Buffer.from(
    JSON.stringify({
      challengeId,
      email: normalizedEmail,
      expiresAt,
    }),
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

export function decodeOtpChallengeCookie(
  value: string,
): { challengeId: string; email: string } | null {
  const [payload, signature, extra] = value.split('.');

  if (!payload || !signature || extra) {
    return null;
  }

  const expected = sign(payload);

  if (
    !/^[0-9a-f]{64}$/i.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    )
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );

    if (
      !data ||
      !UUID_PATTERN.test(data.challengeId) ||
      typeof data.email !== 'string' ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email) ||
      typeof data.expiresAt !== 'number' ||
      data.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      challengeId: data.challengeId,
      email: data.email,
    };
  } catch {
    return null;
  }
}

export async function setOtpChallengeCookie(
  challengeId: string,
  email: string,
) {
  const store = await cookies();

  store.set(
    OTP_CHALLENGE_COOKIE,
    encodeOtpChallengeCookie(challengeId, email),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/login',
      maxAge: COOKIE_MAX_AGE,
    },
  );
}

export async function readOtpChallengeCookie() {
  const store = await cookies();

  const value = store.get(OTP_CHALLENGE_COOKIE)?.value;

  return value ? decodeOtpChallengeCookie(value) : null;
}

export async function clearOtpChallengeCookie() {
  const store = await cookies();
  store.delete(OTP_CHALLENGE_COOKIE);
}
