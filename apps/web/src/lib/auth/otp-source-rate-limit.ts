import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';

export const OTP_SOURCE_WINDOW_MS = 15 * 60_000;
export const OTP_SOURCE_MAX_REQUESTS = 20;

export function hashOtpRequestSource(
  source: string,
  secret: string,
): string {
  if (
    !source.trim() ||
    Buffer.byteLength(secret, 'utf8') < 32
  ) {
    throw new Error('OTP request protection is not configured.');
  }

  return createHmac('sha256', secret)
    .update('mossetech:otp-source:v1\0')
    .update(source.trim())
    .digest('hex');
}

export async function checkOtpSourceRateLimit(
  source: string,
): Promise<boolean> {
  const secret = process.env.OTP_RATE_LIMIT_SECRET;

  if (!secret) {
    throw new Error('OTP request protection is not configured.');
  }

  const sourceHash = hashOtpRequestSource(source, secret);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + OTP_SOURCE_WINDOW_MS,
  );

  const result = await db.execute(sql`
    INSERT INTO otp_request_source_limits (
      source_hash,
      window_start,
      request_count,
      expires_at
    )
    VALUES (
      ${sourceHash},
      ${now},
      1,
      ${expiresAt}
    )
    ON CONFLICT (source_hash)
    DO UPDATE SET
      window_start = CASE
        WHEN otp_request_source_limits.expires_at <= ${now}
          THEN ${now}
        ELSE otp_request_source_limits.window_start
      END,
      request_count = CASE
        WHEN otp_request_source_limits.expires_at <= ${now}
          THEN 1
        ELSE otp_request_source_limits.request_count + 1
      END,
      expires_at = CASE
        WHEN otp_request_source_limits.expires_at <= ${now}
          THEN ${expiresAt}
        ELSE otp_request_source_limits.expires_at
      END
    RETURNING request_count
  `);

  const count = Number(result.rows[0]?.request_count);

  if (!Number.isFinite(count)) {
    throw new Error('OTP request rate limit could not be verified.');
  }

  return count <= OTP_SOURCE_MAX_REQUESTS;
}
