import {
  count,
  desc,
  eq,
} from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@mossetech/db/client';
import {
  corrections,
  users,
} from '@mossetech/db/schema';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        count: 0,
        latest: null,
      },
      {
        status: 401,
      },
    );
  }

  if (user.role !== 'OWNER') {
    return NextResponse.json(
      {
        count: 0,
        latest: null,
      },
      {
        status: 403,
      },
    );
  }

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

  return NextResponse.json(
    {
      count: Number(
        countRows[0]?.value || 0,
      ),

      latest:
        latestRows[0] || null,
    },
    {
      headers: {
        'Cache-Control':
          'no-store, max-age=0',
      },
    },
  );
}
