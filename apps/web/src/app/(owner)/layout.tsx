import {
  count,
  desc,
  eq,
} from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  corrections,
  users,
} from '@mossetech/db/schema';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { OfflineSyncManager } from '@/components/offline-sync-manager';
import { requireUser } from '@/lib/auth/session';

function getKigaliGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Kigali',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  );

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  let pendingRequestCount = 0;

  let latestRequest:
    | {
        id: string;
        targetType: string;
        targetLabel: string;
        requestedBy: string;
      }
    | null = null;

  if (user.role === 'OWNER') {
    const [
      countRows,
      latestRows,
    ] = await Promise.all([
      db
        .select({
          value: count(),
        })
        .from(corrections)
        .where(
          eq(
            corrections.status,
            'PENDING',
          ),
        ),

      db
        .select({
          id: corrections.id,
          targetType:
            corrections.targetType,
          targetLabel:
            corrections.targetLabel,
          requestedBy:
            users.name,
        })
        .from(corrections)
        .innerJoin(
          users,
          eq(
            corrections.requestedByUserId,
            users.id,
          ),
        )
        .where(
          eq(
            corrections.status,
            'PENDING',
          ),
        )
        .orderBy(
          desc(
            corrections.requestedAt,
          ),
        )
        .limit(1),
    ]);

    pendingRequestCount = Number(
      countRows[0]?.value || 0,
    );

    latestRequest =
      latestRows[0] || null;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--text)]">
      <AppSidebar
        userRole={user.role}
      />

      <OfflineSyncManager
        userId={user.id}
      />

      <div className="min-h-screen min-w-0 lg:pl-[220px]">
        <div className="w-full px-3 py-3 sm:px-5 sm:py-5 lg:px-7 xl:px-8">
          <div className="mx-auto w-full max-w-[1540px] space-y-4 sm:space-y-5">
            <AppHeader
              userName={user.name}
              userRole={user.role}
              dashboardGreeting={
                getKigaliGreeting()
              }
              pendingRequestCount={
                pendingRequestCount
              }
              latestRequest={
                latestRequest
              }
            />

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
