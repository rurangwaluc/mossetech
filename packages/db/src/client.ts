import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Add it to your environment before using the database.',
  );
}

const isVercel =
  process.env.VERCEL === '1';

const caCertificate =
  process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');

const connectionUrl = new URL(databaseUrl);

if (caCertificate) {
  // node-postgres may replace an explicit ssl object when
  // SSL parameters are also present in the connection URL.
  // The CA must remain authoritative for verification.
  for (const key of [
    'sslmode',
    'sslrootcert',
    'sslcert',
    'sslkey',
  ]) {
    connectionUrl.searchParams.delete(key);
  }
}

const queryClient = new Pool({
  connectionString: connectionUrl.toString(),
  ...(caCertificate
    ? {
        ssl: {
          ca: caCertificate,
          rejectUnauthorized: true,
          servername: connectionUrl.hostname,
        },
      }
    : {}),

  /*
   * Production runs on serverless infrastructure.
   * Supabase transaction pooling handles concurrency
   * across Vercel instances, so each runtime only
   * needs one database connection.
   *
   * During local development we keep that connection
   * alive for much longer. Opening a fresh encrypted
   * connection to the remote Supabase pooler can take
   * several seconds, which otherwise makes normal
   * page navigation feel unnecessarily slow.
   */
  max: 1,

  connectionTimeoutMillis:
    10_000,

  idleTimeoutMillis:
    isVercel
      ? 10_000
      : 5 * 60_000,
});

if (isVercel) {
  attachDatabasePool(
    queryClient,
  );
}

export const db =
  drizzle(queryClient, {
    schema,
  });

export {
  queryClient,
};
