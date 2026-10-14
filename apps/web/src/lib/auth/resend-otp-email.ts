/**
 * Server-side delivery adapter for Mosse Tech email OTP.
 *
 * This does not create login sessions, verify codes,
 * or expose an unauthenticated email-sending endpoint.
 */

export type OtpEmailDelivery = {
  email: string;
  code: string;
  challengeId: string;
};

export type EmailTransportOptions = {
  apiKey?: string;
  from?: string;
  transport?: typeof fetch;
};

export const MOSSE_TECH_OTP_SENDER =
  'Mosse Tech <login@mossetech.store>';

const RESEND_SEND_URL =
  'https://api.resend.com/emails';

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_ERROR =
  'Verification email could not be delivered.';

export async function sendOtpEmail(
  {
    email,
    code,
    challengeId,
  }: OtpEmailDelivery,
  options: EmailTransportOptions = {},
): Promise<{ providerMessageId: string }> {
  const recipient = email.trim().toLowerCase();

  if (
    recipient.length > 180 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
      recipient,
    ) ||
    !/^\d{6}$/.test(code) ||
    !ID_PATTERN.test(challengeId)
  ) {
    throw new Error(
      'Invalid verification email request.',
    );
  }

  const apiKey =
    options.apiKey ?? process.env.RESEND_API_KEY;

  const from =
    options.from ?? process.env.RESEND_FROM_EMAIL;

  if (
    !apiKey?.startsWith('re_') ||
    from !== MOSSE_TECH_OTP_SENDER
  ) {
    throw new Error(
      'Verification email service is not configured.',
    );
  }

  const text =
    `Your Mosse Tech sign-in code is ${code}.\n` +
    'This code expires in 5 minutes.\n' +
    'If you did not request this code, ' +
    'you can ignore this email.';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:32px;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#152437">
  <div style="max-width:480px;margin:0 auto;padding:32px;background:#ffffff;border:1px solid #dae4ee">
    <p style="margin:0;color:#0068b8;font-size:12px;font-weight:700;letter-spacing:1.5px">MOSSE TECH</p>
    <h1 style="margin:24px 0 12px;font-size:24px">Your sign-in code</h1>
    <p style="line-height:1.6">Use this code to access your Mosse Tech workspace:</p>
    <p style="font-size:36px;letter-spacing:8px;font-weight:700;margin:28px 0">${code}</p>
    <p style="line-height:1.6">This code expires in 5 minutes.</p>
    <p style="font-size:13px;color:#586a7d;line-height:1.6">If you did not request this code, you can ignore this email.</p>
  </div>
</body>
</html>`;

  let response: Response;

  try {
    response = await (
      options.transport ?? fetch
    )(
      RESEND_SEND_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key':
            `mossetech-otp/${challengeId.toLowerCase()}`,
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: 'Your Mosse Tech sign-in code',
          text,
          html,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    // Do not leak provider errors or credentials.
    throw new Error(GENERIC_ERROR);
  }

  if (!response.ok) {
    throw new Error(GENERIC_ERROR);
  }

  let result: unknown;

  try {
    result = await response.json();
  } catch {
    throw new Error(GENERIC_ERROR);
  }

  if (
    !result ||
    typeof result !== 'object' ||
    !('id' in result) ||
    typeof result.id !== 'string' ||
    result.id.length < 1
  ) {
    throw new Error(GENERIC_ERROR);
  }

  return {
    providerMessageId: result.id,
  };
}
