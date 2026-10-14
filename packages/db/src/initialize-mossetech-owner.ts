import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';

import { db, queryClient } from './client.ts';
import { businessSettings, users } from './schema.ts';

const OWNER_NAME = 'Moses';
const OWNER_EMAIL = 'mossetechltd@gmail.com';
const BUSINESS_NAME = 'Mosse Tech Ltd';

async function main() {
  if (process.env.CONFIRM_MOSSETECH_OWNER_INIT !== 'YES') {
    throw new Error('Explicit initialization confirmation required.');
  }

  const passwordHash = await bcrypt.hash(
    randomBytes(48).toString('hex'),
    12,
  );

  await db.transaction(async (tx) => {
    // Prevent concurrent initialization attempts.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(62009901)
    `);

    const existingUsers = await tx
      .select({ id: users.id })
      .from(users)
      .limit(1);

    const existingSettings = await tx
      .select({ id: businessSettings.id })
      .from(businessSettings)
      .limit(1);

    if (existingUsers.length || existingSettings.length) {
      throw new Error(
        'Initialization refused: existing business data found.',
      );
    }

    await tx.insert(users).values({
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    await tx.insert(businessSettings).values({
      businessName: BUSINESS_NAME,
      ownerName: OWNER_NAME,
      currency: 'RWF',
    });
  });

  console.log('PASS: Mosse Tech owner initialized.');
  console.log('PASS: Business settings initialized.');
  console.log('PASS: No usable password generated.');
}

main()
  .catch(() => {
    console.error(
      'STOP: Owner initialization failed or was refused.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
