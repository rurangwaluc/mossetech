import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db, queryClient } from '@mossetech/db/client';
import { otpRequestSourceLimits } from '@mossetech/db/schema';

import {
  checkOtpSourceRateLimit,
  hashOtpRequestSource,
  OTP_SOURCE_MAX_REQUESTS,
} from './otp-source-rate-limit';

const databaseUrl = new URL(
  process.env.DATABASE_URL || '',
);

if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port !== '55434' ||
  databaseUrl.pathname !== '/mossetech_otp_test' ||
  databaseUrl.username !== 'mossetech_test'
) {
  throw new Error('STOP: Unsafe test database.');
}

function getTestSecret(): string {
  const value = process.env.OTP_RATE_LIMIT_SECRET;

  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('STOP: Test limiter secret missing.');
  }

  return value;
}

const secret: string = getTestSecret();

const suffix = randomUUID();

async function run() {
  const identity = await queryClient.query(`
    SELECT current_database() AS database_name,
           current_user AS database_user
  `);

  assert.equal(
    identity.rows[0]?.database_name,
    'mossetech_otp_test',
  );

  assert.equal(
    identity.rows[0]?.database_user,
    'mossetech_test',
  );

  console.log('PASS: Isolated database identity.');

  const source = `test-source-${suffix}`;
  const sourceHash = hashOtpRequestSource(source, secret);

  assert.equal(
    await checkOtpSourceRateLimit(source),
    true,
  );

  console.log('PASS: First request accepted.');

  for (let i = 1; i < OTP_SOURCE_MAX_REQUESTS; i++) {
    assert.equal(
      await checkOtpSourceRateLimit(source),
      true,
    );
  }

  assert.equal(
    await checkOtpSourceRateLimit(source),
    false,
  );

  console.log('PASS: 21st request blocked.');

  const [stored] = await db
    .select()
    .from(otpRequestSourceLimits)
    .where(eq(otpRequestSourceLimits.sourceHash, sourceHash));

  assert.ok(stored);
  assert.equal(stored.requestCount, OTP_SOURCE_MAX_REQUESTS + 1);
  assert.notEqual(stored.sourceHash, source);

  console.log('PASS: Hashed source identifier stored.');

  const otherSource = `other-${suffix}`;

  assert.equal(
    await checkOtpSourceRateLimit(otherSource),
    true,
  );

  console.log('PASS: Sources independently limited.');

  const concurrentSource = `concurrent-${suffix}`;

  const results = await Promise.all(
    Array.from(
      { length: OTP_SOURCE_MAX_REQUESTS + 5 },
      () => checkOtpSourceRateLimit(concurrentSource),
    ),
  );

  assert.equal(
    results.filter(Boolean).length,
    OTP_SOURCE_MAX_REQUESTS,
  );

  console.log('PASS: Concurrent requests enforced atomically.');

  const resetSource = `reset-${suffix}`;
  const resetHash = hashOtpRequestSource(resetSource, secret);

  await db.insert(otpRequestSourceLimits).values({
    sourceHash: resetHash,
    windowStart: new Date(Date.now() - 30 * 60_000),
    requestCount: OTP_SOURCE_MAX_REQUESTS,
    expiresAt: new Date(Date.now() - 1000),
  });

  assert.equal(
    await checkOtpSourceRateLimit(resetSource),
    true,
  );

  const [resetRow] = await db
    .select()
    .from(otpRequestSourceLimits)
    .where(eq(otpRequestSourceLimits.sourceHash, resetHash));

  assert.equal(resetRow?.requestCount, 1);

  console.log('PASS: Expired window resets correctly.');

  console.log();
  console.log('ALL SOURCE RATE-LIMIT TESTS PASSED.');
}

async function main() {
  try {
    await run();
  } finally {
    await queryClient.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Rate-limit test failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
