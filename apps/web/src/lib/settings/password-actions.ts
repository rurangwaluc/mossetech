'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@mossetech/db/client';
import { sessions, users } from '@mossetech/db/schema';
import {
  changeOwnPasswordSchema,
  resetStaffPasswordSchema,
  updateStaffProfileSchema,
  updateStaffStatusSchema,
} from '@mossetech/validators/password';
import { requireOwner } from '@/lib/auth/session';

export type PasswordActionState = {
  error?: string;
  success?: string;
};

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export async function changeOwnerPasswordAction(
  _previousState: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const owner = await requireOwner();

  const parsed = changeOwnPasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Check the password form.',
    };
  }

  const currentOwner = await db.query.users.findFirst({
    where: eq(users.id, owner.id),
  });

  if (!currentOwner || currentOwner.role !== 'OWNER') {
    return {
      error: 'Owner account was not found.',
    };
  }

  const currentPasswordMatches = await bcrypt.compare(
    parsed.data.currentPassword,
    currentOwner.passwordHash,
  );

  if (!currentPasswordMatches) {
    return {
      error: 'Current password is not correct.',
    };
  }

  const samePassword = await bcrypt.compare(parsed.data.newPassword, currentOwner.passwordHash);

  if (samePassword) {
    return {
      error: 'New password must be different from the current password.',
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, owner.id));

  revalidatePath('/settings');

  return {
    success: 'Owner password changed.',
  };
}

export async function resetStaffPasswordAction(
  _previousState: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  await requireOwner();

  const parsed = resetStaffPasswordSchema.safeParse({
    staffUserId: formData.get('staffUserId'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Check the staff password form.',
    };
  }

  const staff = await db.query.users.findFirst({
    where: eq(users.id, parsed.data.staffUserId),
  });

  if (!staff || staff.role !== 'EMPLOYEE') {
    return {
      error: 'Staff account was not found.',
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        status: 'ACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(users.id, staff.id));

    await tx.delete(sessions).where(eq(sessions.userId, staff.id));
  });

  revalidatePath('/settings');

  return {
    success: `Password reset for ${staff.name}.`,
  };
}

export async function updateStaffProfileAction(formData: FormData) {
  await requireOwner();

  const parsed = updateStaffProfileSchema.safeParse({
    staffUserId: formData.get('staffUserId'),
    name: formData.get('name'),
    phone: formData.get('phone') || undefined,
  });

  if (!parsed.success) {
    revalidatePath('/settings');
    return;
  }

  const staff = await db.query.users.findFirst({
    where: eq(users.id, parsed.data.staffUserId),
  });

  if (!staff || staff.role !== 'EMPLOYEE') {
    revalidatePath('/settings');
    return;
  }

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      phone: cleanOptional(parsed.data.phone),
      updatedAt: new Date(),
    })
    .where(eq(users.id, staff.id));

  revalidatePath('/settings');
}

export async function updateStaffStatusAction(formData: FormData) {
  await requireOwner();

  const parsed = updateStaffStatusSchema.safeParse({
    staffUserId: formData.get('staffUserId'),
    status: formData.get('status'),
  });

  if (!parsed.success) {
    revalidatePath('/settings');
    return;
  }

  const staff = await db.query.users.findFirst({
    where: eq(users.id, parsed.data.staffUserId),
  });

  if (!staff || staff.role !== 'EMPLOYEE') {
    revalidatePath('/settings');
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        status: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, staff.id));

    if (parsed.data.status === 'DISABLED') {
      await tx.delete(sessions).where(eq(sessions.userId, staff.id));
    }
  });

  revalidatePath('/settings');
}
