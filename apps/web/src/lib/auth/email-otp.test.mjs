import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_TTL_MS,
  canAttemptEmailOtp,
  canResendEmailOtp,
  generateEmailOtp,
  getEmailOtpExpiry,
  hashEmailOtp,
  verifyEmailOtp,
} from './email-otp.ts';

const secret =
  'this-is-a-test-only-secret-value-of-40-bytes-plus';

const challengeId =
  '21f3489b-e190-42b7-a9f3-15e563a9c3a9';

const proof = {
  code: '004821',
  challengeId,
  email: 'Staff@Example.com',
  secret,
};

test('generates six-digit numeric codes', () => {
  for (let i = 0; i < 100; i += 1) {
    assert.match(
      generateEmailOtp(),
      /^\d{6}$/,
    );
  }
});

test('binds OTP to email and challenge', () => {
  const hash = hashEmailOtp(proof);

  assert.match(hash, /^[0-9a-f]{64}$/);

  assert.equal(
    verifyEmailOtp(proof, hash),
    true,
  );

  assert.equal(
    verifyEmailOtp(
      { ...proof, code: '004822' },
      hash,
    ),
    false,
  );

  assert.equal(
    verifyEmailOtp(
      { ...proof, email: 'other@example.com' },
      hash,
    ),
    false,
  );

  assert.equal(
    verifyEmailOtp(
      { ...proof, challengeId: 'different' },
      hash,
    ),
    false,
  );

  assert.equal(
    verifyEmailOtp(
      { ...proof, email: ' staff@example.com ' },
      hash,
    ),
    true,
  );
});

test('rejects malformed codes and hashes', () => {
  const hash = hashEmailOtp(proof);

  for (const code of [
    '12345',
    '1234567',
    'abcdef',
    '00000x',
  ]) {
    assert.equal(
      verifyEmailOtp({ ...proof, code }, hash),
      false,
    );
  }

  assert.equal(
    verifyEmailOtp(proof, 'bad'),
    false,
  );

  assert.throws(() =>
    hashEmailOtp({
      ...proof,
      code: '12345',
    }),
  );

  assert.throws(() =>
    hashEmailOtp({
      ...proof,
      secret: 'weak',
    }),
  );
});

test('enforces expiration and consumed state', () => {
  const now =
    new Date('2026-10-14T10:00:00Z');

  const expiresAt =
    getEmailOtpExpiry(now);

  assert.equal(
    expiresAt.getTime() - now.getTime(),
    EMAIL_OTP_TTL_MS,
  );

  const state = {
    expiresAt,
    consumedAt: null,
    attempts: 0,
  };

  assert.equal(
    canAttemptEmailOtp(state, now),
    true,
  );

  assert.equal(
    canAttemptEmailOtp(state, expiresAt),
    false,
  );

  assert.equal(
    canAttemptEmailOtp(
      { ...state, consumedAt: now },
      now,
    ),
    false,
  );
});

test('enforces maximum verification attempts', () => {
  const now =
    new Date('2026-10-14T10:00:00Z');

  const state = {
    expiresAt: getEmailOtpExpiry(now),
    consumedAt: null,
    attempts: EMAIL_OTP_MAX_ATTEMPTS,
  };

  assert.equal(
    canAttemptEmailOtp(state, now),
    false,
  );

  assert.equal(
    canAttemptEmailOtp(
      {
        ...state,
        attempts: EMAIL_OTP_MAX_ATTEMPTS - 1,
      },
      now,
    ),
    true,
  );

  assert.equal(
    canAttemptEmailOtp(
      { ...state, attempts: -1 },
      now,
    ),
    false,
  );
});

test('enforces the resend cooldown', () => {
  const sentAt =
    new Date('2026-10-14T10:00:00Z');

  const before = new Date(
    sentAt.getTime() +
    EMAIL_OTP_RESEND_COOLDOWN_MS - 1,
  );

  const after = new Date(
    sentAt.getTime() +
    EMAIL_OTP_RESEND_COOLDOWN_MS,
  );

  assert.equal(
    canResendEmailOtp(sentAt, before),
    false,
  );

  assert.equal(
    canResendEmailOtp(sentAt, after),
    true,
  );
});
