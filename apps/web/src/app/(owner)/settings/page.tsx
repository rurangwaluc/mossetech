import { eq, inArray } from 'drizzle-orm';
import { requireOwner } from '@/lib/auth/session';
import { db } from '@mossetech/db/client';
import {
  employeePermissions,
  users,
} from '@mossetech/db/schema';
import {
  employeePermissionSchema,
  type EmployeePermission,
} from '@mossetech/validators/permissions';
import { SettingsWorkspace } from './settings-workspace';

export default async function SettingsPage() {
  const owner =
    await requireOwner();

  const [
    settings,
    staffUsers,
    ownerRows,
  ] = await Promise.all([
    db.query.businessSettings.findFirst(),

    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: users.status,
      })
      .from(users)
      .where(
        eq(
          users.role,
          'EMPLOYEE',
        ),
      ),

    db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(
        eq(
          users.id,
          owner.id,
        ),
      )
      .limit(1),
  ]);

  // Permissions are enabled only when their database migration
  // and server-side enforcement are ready together.
  const permissionsEnabled =
    process.env.MOSSETECH_EMPLOYEE_PERMISSIONS_ENABLED === 'true';

  const permissionRows = permissionsEnabled && staffUsers.length
    ? await db
        .select({
          employeeUserId: employeePermissions.employeeUserId,
          permission: employeePermissions.permission,
        })
        .from(employeePermissions)
        .where(
          inArray(
            employeePermissions.employeeUserId,
            staffUsers.map((staff) => staff.id),
          ),
        )
    : [];

  const permissionsByEmployee = new Map<
    string,
    EmployeePermission[]
  >();

  for (const row of permissionRows) {
    const parsed = employeePermissionSchema.safeParse(
      row.permission,
    );

    if (!parsed.success) {
      continue;
    }

    const current =
      permissionsByEmployee.get(row.employeeUserId) ?? [];

    current.push(parsed.data);

    permissionsByEmployee.set(
      row.employeeUserId,
      current,
    );
  }

  const staffWithPermissions = staffUsers.map((staff) => ({
    ...staff,
    permissions: permissionsByEmployee.get(staff.id) ?? [],
  }));

  const ownerAccount =
    ownerRows[0];

  const safeSettings = {
    businessName:
      settings?.businessName ||
      'Mosse Tech Ltd',

    phone:
      settings?.phone ||
      '',

    address:
      settings?.address ||
      '',
  };

  const safeOwner = {
    name:
      ownerAccount?.name ||
      owner.name ||
      'Owner',

    email:
      ownerAccount?.email ||
      '',

    phone:
      ownerAccount?.phone ||
      '',
  };

  return (
    <section>
      <SettingsWorkspace
        settings={safeSettings}
        owner={safeOwner}
        staffUsers={staffWithPermissions}
        permissionsEnabled={permissionsEnabled}
      />
    </section>
  );
}
