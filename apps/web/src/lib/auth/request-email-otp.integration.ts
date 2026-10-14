import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db, queryClient } from '@mossetech/db/client';
import {
  emailOtpChallenges,
  users,
} from '@mossetech/db/schema';

import { requestEmailOtp } from './request-email-otp';

const url = new URL(process.env.DATABASE_URL || '');

if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55434' ||
  url.pathname !== '/mossetech_otp_test' ||
  url.username !== 'mossetech_test'
) {
  throw new Error('STOP: Unsafe integration test database.');
}

if (
  !process.env.EMAIL_OTP_HMAC_SECRET ||
  Buffer.byteLength(
    process.env.EMAIL_OTP_HMAC_SECRET,
    'utf8',
  ) < 32
) {
  throw new Error('STOP: Test OTP secret missing.');
}

const suffix = randomUUID().slice(0, 8);

async function createUser(
  status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
) {
  const email =
    `request-${suffix}-${randomUUID()}@example.test`;

  const [user] = await db
    .insert(users)
    .values({
      name: 'OTP Request Test',
      email,
      passwordHash: 'TEST_ONLY_NO_REAL_PASSWORD',
      role: 'EMPLOYEE',
      status,
    })
    .returning();

  assert.ok(user);
  return user;
}

const delivered: string[] = [];

const fakeDelivery = async (input: {
  email: string;
  code: string;
  challengeId: string;
}) => {
  delivered.push(input.challengeId);
  return { providerMessageId: randomUUID() };
};

async function challengesFor(userId: string) {
  return db
    .select()
    .from(emailOtpChallenges)
    .where(eq(emailOtpChallenges.userId, userId));
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

  console.log('PASS: Isolated database verified.');

  {
    const user = await createUser();

    const result = await requestEmailOtp(user.email, {
      deliver: fakeDelivery,
    });

    assert.equal(result.accepted, true);
    assert.ok(result.challengeId);

    const rows = await challengesFor(user.id);

    assert.equal(rows.length, 1);
    assert.ok(rows[0].sentAt);
    assert.equal(rows[0].revokedAt, null);

    console.log('PASS: Active user receives OTP.');
  }

  {
    const unknown =
      `missing-${randomUUID()}@example.test`;

    const result = await requestEmailOtp(unknown, {
      deliver: fakeDelivery,
    });

    assert.deepEqual(result, { accepted: true });

    console.log('PASS: Unknown account stays private.');
  }

  {
    const user = await createUser('DISABLED');

    const result = await requestEmailOtp(user.email, {
      deliver: fakeDelivery,
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal(
      (await challengesFor(user.id)).length,
      0,
    );

    console.log('PASS: Suspended account blocked.');
  }

  {
    const user = await createUser();

    const results = await Promise.all([
      requestEmailOtp(user.email, {
        deliver: fakeDelivery,
      }),
      requestEmailOtp(user.email, {
        deliver: fakeDelivery,
      }),
    ]);

    assert.equal(
      results.filter((result) => result.challengeId).length,
      1,
    );

    assert.equal(
      (await challengesFor(user.id)).length,
      1,
    );

    console.log('PASS: Concurrent requests restricted.');
  }

  {
    const user = await createUser();

    await requestEmailOtp(user.email, {
      deliver: fakeDelivery,
    });

    const second = await requestEmailOtp(user.email, {
      deliver: fakeDelivery,
    });

    assert.deepEqual(second, { accepted: true });
    assert.equal(
      (await challengesFor(user.id)).length,
      1,
    );

    console.log('PASS: Cooldown enforced.');
  }

  {
    const user = await createUser();

    const result = await requestEmailOtp(user.email, {
      deliver: async () => {
        throw new Error('Simulated email failure');
      },
    });

    assert.deepEqual(result, { accepted: true });

    const rows = await challengesFor(user.id);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sentAt, null);
    assert.ok(rows[0].revokedAt);

    console.log('PASS: Failed delivery revokes challenge.');
  }

  // 7. Hourly request limit.
  {
    const user = await createUser();
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      await db.insert(emailOtpChallenges).values({
        userId: user.id,
        email: user.email,
        codeHash: '0'.repeat(64),
        attempts: 0,
        expiresAt: new Date(now + 300_000),
        createdAt: new Date(now - (i + 1) * 120_000),
        revokedAt: new Date(now - (i + 1) * 120_000),
      });
    }

    const result = await requestEmailOtp(user.email, {
      deliver: fakeDelivery,
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal((await challengesFor(user.id)).length, 5);

    console.log('PASS: Hourly limit enforced in database.');
  }

  // 8. Rolling 24-hour request limit.
  {
    const user = await createUser();
    const now = Date.now();

    for (let i = 0; i < 15; i++) {
      await db.insert(emailOtpChallenges).values({
        userId: user.id,
        email: user.email,
        codeHash: '0'.repeat(64),
        attempts: 0,
        expiresAt: new Date(now + 300_000),
        createdAt: new Date(now - (i + 1) * 70 * 60_000),
        revokedAt: new Date(now - (i + 1) * 70 * 60_000),
      });
    }

    const result = await requestEmailOtp(user.email, {
      deliver: fakeDelivery,
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal((await challengesFor(user.id)).length, 15);

    console.log('PASS: Daily limit enforced in database.');
  }

  // 9. Suspension while email delivery is in progress.
  {
    const user = await createUser();

    const result = await requestEmailOtp(user.email, {
      deliver: async () => {
        await db
          .update(users)
          .set({ status: 'DISABLED' })
          .where(eq(users.id, user.id));

        return { providerMessageId: randomUUID() };
      },
    });

    assert.deepEqual(result, { accepted: true });

    const rows = await challengesFor(user.id);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sentAt, null);

    console.log(
      'PASS: Suspension during delivery prevents activation.',
    );
  }

  // 10. Revocation while email delivery is in progress.
  {
    const user = await createUser();

    const result = await requestEmailOtp(user.email, {
      deliver: async ({ challengeId }) => {
        await db
          .update(emailOtpChallenges)
          .set({ revokedAt: new Date() })
          .where(eq(emailOtpChallenges.id, challengeId));

        return { providerMessageId: randomUUID() };
      },
    });

    assert.deepEqual(result, { accepted: true });

    const rows = await challengesFor(user.id);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sentAt, null);
    assert.ok(rows[0].revokedAt);

    console.log(
      'PASS: Revoked challenge cannot be reactivated.',
    );
  }

  console.log();
  console.log('ALL OTP REQUEST INTEGRATION TESTS PASSED.');
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
    'OTP request test failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
