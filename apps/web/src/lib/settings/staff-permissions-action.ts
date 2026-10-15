'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import {
  employeePermissionsUpdateSchema,
} from '@mossetech/validators/permissions';

import { requireOwner } from '@/lib/auth/session';
import { saveStaffPermissions } from './staff-permissions-service';

export type StaffPermissionsActionState = {
  error?: string;
  success?: string;
  submissionId?: string;
};

export async function updateStaffPermissionsAction(
  _previous: StaffPermissionsActionState,
  formData: FormData,
): Promise<StaffPermissionsActionState> {
  // Permission changes are exclusively controlled by Moses.
  await requireOwner();

  // Do not accept permission changes until the database
  // migration and authorization feature are activated.
  if (
    process.env.MOSSETECH_EMPLOYEE_PERMISSIONS_ENABLED !== 'true'
  ) {
    return {
      error: 'Permission management is not active yet.',
    };
  }

  const parsed = employeePermissionsUpdateSchema.safeParse({
    employeeUserId: formData.get('employeeUserId'),
    permissions: formData.getAll('permissions'),
  });

  if (!parsed.success) {
    return {
      error: 'Check the selected employee permissions.',
    };
  }

  const result = await saveStaffPermissions(parsed.data);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath('/settings');

  return {
    success: 'Employee permissions saved successfully.',
    submissionId: randomUUID(),
  };
}
