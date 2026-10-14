import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export const EMAIL_OTP_DIGITS = 6;

export const EMAIL_OTP_TTL_MS =
  5 * 60 * 1000;

export const EMAIL_OTP_RESEND_COOLDOWN_MS =
  60 * 1000;

export const EMAIL_OTP_MAX_ATTEMPTS = 5;

export type EmailOtpProof = {
  code: string;
  challengeId: string;
  email: string;
  secret: string;
};

export type EmailOtpAttemptState = {
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
};

export function generateEmailOtp(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(EMAIL_OTP_DIGITS, '0');
}

export function getEmailOtpExpiry(
  now: Date = new Date(),
): Date {
  return new Date(
    now.getTime() + EMAIL_OTP_TTL_MS,
  );
}

export function hashEmailOtp({
  code,
  challengeId,
  email,
  secret,
}: EmailOtpProof): string {
  if (!/^\d{6}$/.test(code)) {
    throw new Error(
      'OTP must contain exactly six digits.',
    );
  }

  if (!challengeId.trim() || !email.trim()) {
    throw new Error(
      'OTP challenge and email are required.',
    );
  }

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(
      'OTP signing secret must be at least 32 bytes.',
    );
  }

  return createHmac('sha256', secret)
    .update(
      `mossetech:email-otp:v1\0${challengeId.trim()}\0${email.trim().toLowerCase()}\0${code}`,
    )
    .digest('hex');
}

export function verifyEmailOtp(
  proof: EmailOtpProof,
  storedHash: string,
): boolean {
  if (
    !/^\d{6}$/.test(proof.code) ||
    !/^[0-9a-f]{64}$/i.test(storedHash)
  ) {
    return false;
  }

  const candidate = Buffer.from(
    hashEmailOtp(proof),
    'hex',
  );

  const expected = Buffer.from(
    storedHash,
    'hex',
  );

  return timingSafeEqual(
    candidate,
    expected,
  );
}

export function canAttemptEmailOtp(
  state: EmailOtpAttemptState,
  now: Date = new Date(),
): boolean {
  return (
    state.consumedAt === null &&
    Number.isInteger(state.attempts) &&
    state.attempts >= 0 &&
    state.attempts < EMAIL_OTP_MAX_ATTEMPTS &&
    state.expiresAt.getTime() > now.getTime()
  );
}

export function canResendEmailOtp(
  lastSentAt: Date,
  now: Date = new Date(),
): boolean {
  return (
    now.getTime() - lastSentAt.getTime() >=
    EMAIL_OTP_RESEND_COOLDOWN_MS
  );
}
