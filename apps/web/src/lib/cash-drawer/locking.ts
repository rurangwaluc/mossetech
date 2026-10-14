import {
  and,
  desc,
  eq,
  sql,
} from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  cashDrawers,
} from '@mossetech/db/schema';

import {
  getExpectedDrawerCash,
} from './calculations';

export type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

/**
 * Lock the currently open physical cash drawer for the
 * remainder of the caller's transaction.
 *
 * Every online operation that changes the current drawer
 * must obtain this lock before reading its movements or
 * writing a new movement.
 */
export async function lockCurrentOpenDrawer(
  tx: DbTransaction,
) {
  const [candidate] =
    await tx
      .select()
      .from(cashDrawers)
      .where(
        eq(
          cashDrawers.status,
          'OPEN',
        ),
      )
      .orderBy(
        desc(
          cashDrawers.openedAt,
        ),
      )
      .limit(1);

  if (!candidate) {
    return null;
  }

  await tx.execute(sql`
    SELECT id
    FROM cash_drawers
    WHERE id = ${candidate.id}
    FOR UPDATE
  `);

  /*
   * The row may have been closed while this transaction
   * was waiting for the lock. Re-read it after the lock.
   */
  const [drawer] =
    await tx
      .select()
      .from(cashDrawers)
      .where(
        and(
          eq(
            cashDrawers.id,
            candidate.id,
          ),
          eq(
            cashDrawers.status,
            'OPEN',
          ),
        ),
      )
      .limit(1);

  return drawer ?? null;
}

export async function getLockedCurrentDrawerState(
  tx: DbTransaction,
) {
  const drawer =
    await lockCurrentOpenDrawer(
      tx,
    );

  if (!drawer) {
    return null;
  }

  const movements =
    await tx
      .select()
      .from(
        cashDrawerMovements,
      )
      .where(
        eq(
          cashDrawerMovements.drawerId,
          drawer.id,
        ),
      );

  return {
    drawer,
    movements,
    expectedCash:
      getExpectedDrawerCash(
        drawer,
        movements,
      ),
  };
}
