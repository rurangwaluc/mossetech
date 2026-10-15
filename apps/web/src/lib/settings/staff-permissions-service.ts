import { eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  employeePermissions,
  users,
} from '@mossetech/db/schema';

import {
  employeePermissionsUpdateSchema,
  type EmployeePermission,
} from '@mossetech/validators/permissions';

export type SaveStaffPermissionsResult =
  | { success: true }
  | { success: false; error: string };

export async function saveStaffPermissions(input: {
  employeeUserId: string;
  permissions: EmployeePermission[];
}): Promise<SaveStaffPermissionsResult> {
  const parsed =
    employeePermissionsUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: 'Check the selected permissions.',
    };
  }

  return db.transaction(async (tx) => {
    const [employee] = await tx
      .select({
        id: users.id,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, parsed.data.employeeUserId))
      .for('update')
      .limit(1);

    if (!employee || employee.role !== 'EMPLOYEE') {
      return {
        success: false,
        error: 'Employee account not found.',
      };
    }

    await tx
      .delete(employeePermissions)
      .where(
        eq(
          employeePermissions.employeeUserId,
          employee.id,
        ),
      );

    if (parsed.data.permissions.length > 0) {
      await tx.insert(employeePermissions).values(
        parsed.data.permissions.map((permission) => ({
          employeeUserId: employee.id,
          permission,
        })),
      );
    }

    return { success: true };
  });
}
