export const OTP_REQUEST_COOLDOWN_MS = 60_000;
export const OTP_REQUEST_HOURLY_LIMIT = 5;
export const OTP_REQUEST_DAILY_LIMIT = 15;

export type OtpRequestHistory = {
  createdAt: Date;
};

export function canRequestEmailOtp(
  history: OtpRequestHistory[],
  now: Date = new Date(),
): boolean {
  const timestamps = history
    .map((item) => item.createdAt.getTime())
    .filter((timestamp) =>
      Number.isFinite(timestamp) &&
      timestamp <= now.getTime()
    );

  const lastRequest = Math.max(
    0,
    ...timestamps,
  );

  if (
    lastRequest > 0 &&
    now.getTime() - lastRequest <
      OTP_REQUEST_COOLDOWN_MS
  ) {
    return false;
  }

  const hourlyCount = timestamps.filter(
    (timestamp) =>
      now.getTime() - timestamp < 60 * 60_000
  ).length;

  if (hourlyCount >= OTP_REQUEST_HOURLY_LIMIT) {
    return false;
  }

  const dailyCount = timestamps.filter(
    (timestamp) =>
      now.getTime() - timestamp < 24 * 60 * 60_000
  ).length;

  return dailyCount < OTP_REQUEST_DAILY_LIMIT;
}
