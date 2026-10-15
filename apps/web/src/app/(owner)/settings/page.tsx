import { eq } from 'drizzle-orm';
import { requireOwner } from '@/lib/auth/session';
import { db } from '@mossetech/db/client';
import { users } from '@mossetech/db/schema';
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
        staffUsers={staffUsers}
      />
    </section>
  );
}
