import { and, eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  employeePermissions,
  users,
} from '@mossetech/db/schema';

import {
  employeePermissionKeys,
  type EmployeePermission,
} from '@mossetech/validators/permissions';

export type PermissionUser = {
  id: string;
  role: 'OWNER' | 'EMPLOYEE';
  status: 'ACTIVE' | 'DISABLED';
};

const knownPermissions = new Set<string>(
  employeePermissionKeys,
);

export async function getEmployeePermissions(
  user: PermissionUser,
): Promise<EmployeePermission[]> {
  if (user.status !== 'ACTIVE') {
    return [];
  }

  if (user.role === 'OWNER') {
    return [...employeePermissionKeys];
  }

  const rows = await db
    .select({
      permission: employeePermissions.permission,
    })
    .from(employeePermissions)
    .innerJoin(
      users,
      eq(employeePermissions.employeeUserId, users.id),
    )
    .where(
      and(
        eq(employeePermissions.employeeUserId, user.id),
        eq(users.role, 'EMPLOYEE'),
        eq(users.status, 'ACTIVE'),
      ),
    );

  return rows
    .map((row) => row.permission)
    .filter(
      (permission): permission is EmployeePermission =>
        knownPermissions.has(permission),
    );
}

export async function hasEmployeePermission(
  user: PermissionUser,
  permission: EmployeePermission,
): Promise<boolean> {
  if (user.status !== 'ACTIVE') {
    return false;
  }

  if (user.role === 'OWNER') {
    return true;
  }

  const rows = await db
    .select({ id: employeePermissions.id })
    .from(employeePermissions)
    .innerJoin(
      users,
      eq(employeePermissions.employeeUserId, users.id),
    )
    .where(
      and(
        eq(employeePermissions.employeeUserId, user.id),
        eq(employeePermissions.permission, permission),
        eq(users.role, 'EMPLOYEE'),
        eq(users.status, 'ACTIVE'),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
