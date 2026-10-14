import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  emailOtpChallenges,
  users,
} from '@mossetech/db/schema';

import {
  generateEmailOtp,
  getEmailOtpExpiry,
  hashEmailOtp,
} from './email-otp';

import { sendOtpEmail } from './resend-otp-email';
import { canRequestEmailOtp } from './email-otp-request-policy';

export type RequestEmailOtpResult = {
  accepted: true;
  challengeId?: string;
};

const GENERIC_RESULT: RequestEmailOtpResult = {
  accepted: true,
};

export type RequestEmailOtpOptions = {
  deliver?: typeof sendOtpEmail;
};

export async function requestEmailOtp(
  rawEmail: string,
  options: RequestEmailOtpOptions = {},
): Promise<RequestEmailOtpResult> {
  const email = rawEmail.trim().toLowerCase();

  if (
    email.length > 180 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
  ) {
    return GENERIC_RESULT;
  }

  const secret = process.env.EMAIL_OTP_HMAC_SECRET;

  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Email verification is not configured.');
  }

  const challenge = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!candidate) {
      return null;
    }

    // Serialize requests for this account.
    await tx.execute(sql`
      SELECT id
      FROM users
      WHERE id = ${candidate.id}::uuid
      FOR UPDATE
    `);

    // Recheck status after the lock is acquired.
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, candidate.id))
      .limit(1);

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.email.toLowerCase() !== email
    ) {
      return null;
    }

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

    const history = await tx
      .select({ createdAt: emailOtpChallenges.createdAt })
      .from(emailOtpChallenges)
      .where(
        and(
          eq(emailOtpChallenges.userId, user.id),
          gte(emailOtpChallenges.createdAt, dayAgo),
        ),
      )
      .orderBy(desc(emailOtpChallenges.createdAt))
      .limit(16);

    if (!canRequestEmailOtp(history, now)) {
      return null;
    }

    // A replacement code invalidates previous challenges.
    await tx
      .update(emailOtpChallenges)
      .set({ revokedAt: now })
      .where(
        and(
          eq(emailOtpChallenges.userId, user.id),
          isNull(emailOtpChallenges.revokedAt),
          isNull(emailOtpChallenges.consumedAt),
        ),
      );

    const code = generateEmailOtp();
    const challengeId = randomUUID();

    await tx.insert(emailOtpChallenges).values({
      id: challengeId,
      userId: user.id,
      email,
      codeHash: hashEmailOtp({
        code,
        challengeId,
        email,
        secret,
      }),
      expiresAt: getEmailOtpExpiry(now),
      sentAt: null,
    });

    return { challengeId, email, code };
  });

  if (!challenge) {
    return GENERIC_RESULT;
  }

  try {
    await (options.deliver ?? sendOtpEmail)(challenge);

    const finalized = await db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ userId: emailOtpChallenges.userId })
        .from(emailOtpChallenges)
        .where(
          eq(emailOtpChallenges.id, challenge.challengeId),
        )
        .limit(1);

      if (!candidate) {
        return false;
      }

      await tx.execute(sql`
        SELECT id
        FROM users
        WHERE id = ${candidate.userId}::uuid
        FOR UPDATE
      `);

      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, candidate.userId))
        .limit(1);

      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.email.toLowerCase() !== challenge.email
      ) {
        return false;
      }

      const [updated] = await tx
        .update(emailOtpChallenges)
        .set({ sentAt: new Date() })
        .where(
          and(
            eq(emailOtpChallenges.id, challenge.challengeId),
            isNull(emailOtpChallenges.sentAt),
            isNull(emailOtpChallenges.revokedAt),
            isNull(emailOtpChallenges.consumedAt),
            gte(emailOtpChallenges.expiresAt, new Date()),
          ),
        )
        .returning({ id: emailOtpChallenges.id });

      return Boolean(updated);
    });

    if (!finalized) {
      return GENERIC_RESULT;
    }

    return {
      accepted: true,
      challengeId: challenge.challengeId,
    };
  } catch {
    await db
      .update(emailOtpChallenges)
      .set({ revokedAt: new Date() })
      .where(eq(emailOtpChallenges.id, challenge.challengeId));

    return GENERIC_RESULT;
  }
}
