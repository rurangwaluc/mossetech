/*
 * Production enforcement remains disabled.
 *
 * Isolated integration tests may exercise the new policy
 * only against the dedicated local pricing-test database.
 * This must never activate against production Supabase.
 */
const databaseUrl = process.env.DATABASE_URL;

function isolatedPricingTestEnabled(): boolean {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.MOSSETECH_PRICING_TEST !== '1' ||
    !databaseUrl
  ) {
    return false;
  }

  try {
    const target = new URL(databaseUrl);

    return (
      target.hostname === '127.0.0.1' &&
      target.port === '55434' &&
      target.pathname === '/mossetech_pricing_test' &&
      target.username === 'mossetech_test'
    );
  } catch {
    return false;
  }
}

export const minimumPriceEnforcementEnabled =
  isolatedPricingTestEnabled();
