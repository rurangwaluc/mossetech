import {
  eq,
  sql,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  emailOtpChallenges,
  sessions,
  users,
} from '@mossetech/db/schema';

import {
  canAttemptEmailOtp,
  verifyEmailOtp,
} from './email-otp';

import {
  createSessionToken,
  getSessionExpiry,
  hashSessionToken,
} from './session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN =
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export type VerifyEmailOtpInput = {
  challengeId: string;
  email: string;
  code: string;
};

export type VerifyEmailOtpResult =
  | {
      success: true;
      token: string;
      expiresAt: Date;
    }
  | {
      success: false;
      reason: 'INVALID_OR_EXPIRED';
    };

const failedResult: VerifyEmailOtpResult = {
  success: false,
  reason: 'INVALID_OR_EXPIRED',
};

export async function verifyEmailOtpChallenge(
  input: VerifyEmailOtpInput,
): Promise<VerifyEmailOtpResult> {
  const challengeId =
    input.challengeId.trim().toLowerCase();

  const email =
    input.email.trim().toLowerCase();

  const code =
    input.code.trim();

  if (
    !UUID_PATTERN.test(challengeId) ||
    !EMAIL_PATTERN.test(email) ||
    email.length > 180 ||
    !/^\d{6}$/.test(code)
  ) {
    return failedResult;
  }

  const secret =
    process.env.EMAIL_OTP_HMAC_SECRET;

  if (
    !secret ||
    Buffer.byteLength(secret, 'utf8') < 32
  ) {
    throw new Error(
      'Email verification is not configured.',
    );
  }

  return db.transaction(async (tx) => {
    /*
     * Lock the challenge before reading its state.
     *
     * A second request for this challenge must
     * wait until this transaction completes.
     */
    const locked = await tx.execute(sql`
      SELECT id
      FROM email_otp_challenges
      WHERE id = ${challengeId}::uuid
      FOR UPDATE
    `);

    if (locked.rows.length === 0) {
      return failedResult;
    }

    const [challenge] = await tx
      .select()
      .from(emailOtpChallenges)
      .where(
        eq(emailOtpChallenges.id, challengeId),
      )
      .limit(1);

    if (
      !challenge ||
      challenge.email !== email ||
      challenge.revokedAt !== null ||
      challenge.sentAt === null
    ) {
      return failedResult;
    }

    const now = new Date();

    if (
      !canAttemptEmailOtp(
        {
          expiresAt: challenge.expiresAt,
          consumedAt: challenge.consumedAt,
          attempts: challenge.attempts,
        },
        now,
      )
    ) {
      return failedResult;
    }

    const validCode = verifyEmailOtp(
      {
        code,
        challengeId,
        email,
        secret,
      },
      challenge.codeHash,
    );

    if (!validCode) {
      await tx
        .update(emailOtpChallenges)
        .set({
          attempts: challenge.attempts + 1,
        })
        .where(
          eq(emailOtpChallenges.id, challengeId),
        );

      return failedResult;
    }

    /*
     * Lock the user as well, coordinating session
     * creation with account status changes.
     */
    const lockedUser = await tx.execute(sql`
      SELECT id
      FROM users
      WHERE id = ${challenge.userId}::uuid
      FOR UPDATE
    `);

    if (lockedUser.rows.length === 0) {
      return failedResult;
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(
        eq(users.id, challenge.userId),
      )
      .limit(1);

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.email.toLowerCase() !== email
    ) {
      return failedResult;
    }

    /*
     * Record consumption and session creation
     * atomically in this transaction.
     */
    await tx
      .update(emailOtpChallenges)
      .set({
        consumedAt: now,
      })
      .where(
        eq(emailOtpChallenges.id, challengeId),
      );

    const token = createSessionToken();
    const expiresAt = getSessionExpiry();

    await tx.insert(sessions).values({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    return {
      success: true,
      token,
      expiresAt,
    };
  });
}
