import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import { users } from '@mossetech/db/schema';
import {
  createStaffSchema,
  type CreateStaffInput,
} from '@mossetech/validators/staff';

export type StaffCreationResult =
  | { success: true; name: string }
  | { success: false; error: string };

export async function createStaffAccount(
  input: CreateStaffInput,
): Promise<StaffCreationResult> {
  const parsed = createStaffSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ||
        'Check the employee information.',
    };
  }

  const { name, email, phone } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing.length > 0) {
    return {
      success: false,
      error: 'This email address already has an account.',
    };
  }

  // The legacy database requires a hash.
  // This random value is never used for sign-in.
  // Employees authenticate exclusively using email OTP.
  const passwordHash = await bcrypt.hash(
    randomBytes(48).toString('hex'),
    12,
  );

  try {
    const created = await db
      .insert(users)
      .values({
        name,
        email,
        phone: phone || null,
        passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      })
      .onConflictDoNothing({
        target: users.email,
      })
      .returning({ id: users.id });

    if (created.length === 0) {
      return {
        success: false,
        error: 'This email address already has an account.',
      };
    }
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : null;

    if (code === '23505') {
      return {
        success: false,
        error: 'This email address already has an account.',
      };
    }

    throw error;
  }

  return { success: true, name };
}
