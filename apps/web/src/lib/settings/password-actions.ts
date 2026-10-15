'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@mossetech/db/client';
import { sessions, users } from '@mossetech/db/schema';
import {
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
