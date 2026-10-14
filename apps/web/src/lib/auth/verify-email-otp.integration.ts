import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db, queryClient } from '@mossetech/db/client';
import {
  emailOtpChallenges,
  sessions,
  users,
} from '@mossetech/db/schema';

import {
  getEmailOtpExpiry,
  hashEmailOtp,
} from './email-otp';

import {
  verifyEmailOtpChallenge,
} from './verify-email-otp';

const databaseUrl = new URL(
  process.env.DATABASE_URL || '',
);

if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port !== '55434' ||
  databaseUrl.pathname !== '/mossetech_otp_test' ||
  databaseUrl.username !== 'mossetech_test'
) {
  throw new Error('STOP: Unsafe integration test database.');
}

function getTestSecret(): string {
  const value = process.env.EMAIL_OTP_HMAC_SECRET;

  if (!value || value.length < 32) {
    throw new Error('STOP: Test signing secret missing.');
  }

  return value;
}

const secret: string = getTestSecret();

const testId = randomUUID().slice(0, 8);

async function createChallenge(options: {
  status?: 'ACTIVE' | 'DISABLED';
  expired?: boolean;
} = {}) {
  const email = `otp-${testId}-${randomUUID()}@example.test`;
  const code = '005128';
  const challengeId = randomUUID();

  const [user] = await db
    .insert(users)
    .values({
      name: 'OTP Integration Test',
      email,
      passwordHash: 'NO_REAL_PASSWORD_TEST_ONLY',
      role: 'EMPLOYEE',
      status: options.status ?? 'ACTIVE',
    })
    .returning();

  assert.ok(user);

  await db.insert(emailOtpChallenges).values({
    id: challengeId,
    userId: user.id,
    email,
    codeHash: hashEmailOtp({
      code,
      challengeId,
      email,
      secret,
    }),
    attempts: 0,
    expiresAt: options.expired
      ? new Date(Date.now() - 1000)
      : getEmailOtpExpiry(),
    sentAt: new Date(),
  });

  return {
    userId: user.id,
    challengeId,
    email,
    code,
  };
}

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

  console.log('PASS: Isolated PostgreSQL identity.');

  // 1. Successful verification.
  {
    const challenge = await createChallenge();

    const result =
      await verifyEmailOtpChallenge(challenge);

    assert.equal(result.success, true);

    if (result.success) {
      assert.equal(result.token.length, 64);
    }

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, challenge.userId));

    assert.equal(rows.length, 1);

    const replay =
      await verifyEmailOtpChallenge(challenge);

    assert.equal(replay.success, false);

    console.log('PASS: Success creates one session.');
    console.log('PASS: Consumed OTP cannot be replayed.');
  }

  // 2. Incorrect code increments attempts.
  {
    const challenge = await createChallenge();

    const result =
      await verifyEmailOtpChallenge({
        ...challenge,
        code: '999999',
      });

    assert.equal(result.success, false);

    const [row] = await db
      .select()
      .from(emailOtpChallenges)
      .where(
        eq(emailOtpChallenges.id, challenge.challengeId),
      );

    assert.equal(row?.attempts, 1);

    console.log('PASS: Failed attempt persisted.');
  }

  // 3. Five failures permanently block the challenge.
  {
    const challenge = await createChallenge();

    for (let i = 0; i < 5; i++) {
      const result =
        await verifyEmailOtpChallenge({
          ...challenge,
          code: '999999',
        });

      assert.equal(result.success, false);
    }

    const validAfterLimit =
      await verifyEmailOtpChallenge(challenge);

    assert.equal(validAfterLimit.success, false);

    console.log('PASS: Five-attempt limit enforced.');
  }

  // 4. Expired OTP cannot sign in.
  {
    const challenge = await createChallenge({
      expired: true,
    });

    const result =
      await verifyEmailOtpChallenge(challenge);

    assert.equal(result.success, false);

    console.log('PASS: Expired OTP rejected.');
  }

  // 5. Suspended user cannot sign in.
  {
    const challenge = await createChallenge({
      status: 'DISABLED',
    });

    const result =
      await verifyEmailOtpChallenge(challenge);

    assert.equal(result.success, false);

    console.log('PASS: Suspended user rejected.');
  }

  // 6. Two simultaneous requests: exactly one success.
  {
    const challenge = await createChallenge();

    const results = await Promise.all([
      verifyEmailOtpChallenge(challenge),
      verifyEmailOtpChallenge(challenge),
    ]);

    assert.equal(
      results.filter(result => result.success).length,
      1,
    );

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, challenge.userId));

    assert.equal(rows.length, 1);

    console.log(
      'PASS: Concurrent verification creates one session.',
    );
  }

  console.log();
  console.log('ALL OTP INTEGRATION TESTS PASSED.');
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
    'OTP integration test failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
