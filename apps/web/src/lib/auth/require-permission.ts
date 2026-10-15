import 'server-only';

import { forbidden } from 'next/navigation';

import type {
  EmployeePermission,
} from '@mossetech/validators/permissions';

import { requireUser } from './session';
import { hasEmployeePermission } from './permissions';

export async function requirePermission(
  permission: EmployeePermission,
) {
  const user = await requireUser();

  if (
    !(await hasEmployeePermission(user, permission))
  ) {
    forbidden();
  }

  return user;
}
