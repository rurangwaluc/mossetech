'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { createStaffSchema } from '@mossetech/validators/staff';

import { requireOwner } from '@/lib/auth/session';
import { createStaffAccount } from './staff-service';

export type CreateStaffState = {
  error?: string;
  success?: string;
  submissionId?: string;
};

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createStaffAction(
  _previous: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  // Only the owner can create employee accounts.
  await requireOwner();

  const parsed = createStaffSchema.safeParse({
    name: formText(formData, 'name'),
    email: formText(formData, 'email'),
    phone: formText(formData, 'phone'),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ||
        'Check the employee information.',
    };
  }

  const result = await createStaffAccount(parsed.data);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath('/settings');

  return {
    success:
      `${result.name} can now sign in using email verification.`,
    submissionId: randomUUID(),
  };
}
