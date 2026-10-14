import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canRequestEmailOtp,
  OTP_REQUEST_COOLDOWN_MS,
  OTP_REQUEST_DAILY_LIMIT,
  OTP_REQUEST_HOURLY_LIMIT,
} from './email-otp-request-policy.ts';

const now = new Date('2026-10-14T12:00:00.000Z');

const requestAt = (millisecondsAgo) => ({
  createdAt: new Date(now.getTime() - millisecondsAgo),
});

test('allows the first request', () => {
  assert.equal(canRequestEmailOtp([], now), true);
});

test('rejects requests inside the cooldown', () => {
  assert.equal(
    canRequestEmailOtp([requestAt(59_999)], now),
    false,
  );
});

test('allows request at the cooldown boundary', () => {
  assert.equal(
    canRequestEmailOtp(
      [requestAt(OTP_REQUEST_COOLDOWN_MS)],
      now,
    ),
    true,
  );
});

test('enforces the hourly request limit', () => {
  const history = Array.from(
    { length: OTP_REQUEST_HOURLY_LIMIT },
    (_, index) => requestAt((index + 1) * 120_000),
  );

  assert.equal(canRequestEmailOtp(history, now), false);
});

test('enforces the daily request limit', () => {
  const history = Array.from(
    { length: OTP_REQUEST_DAILY_LIMIT },
    (_, index) =>
      requestAt((index + 1) * 70 * 60_000),
  );

  assert.equal(canRequestEmailOtp(history, now), false);
});

test('ignores requests outside the rolling day', () => {
  assert.equal(
    canRequestEmailOtp(
      [requestAt(24 * 60 * 60_000 + 1)],
      now,
    ),
    true,
  );
});

test('does not count future timestamps', () => {
  assert.equal(
    canRequestEmailOtp([requestAt(-60_000)], now),
    true,
  );
});

test('does not count invalid timestamps', () => {
  assert.equal(
    canRequestEmailOtp(
      [{ createdAt: new Date(NaN) }],
      now,
    ),
    true,
  );
});
