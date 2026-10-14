import { getOfflineDatabase } from './db';

import type {
  OfflineOperation,
  OfflineOperationKind,
} from './types';

const STALE_SYNCING_AFTER =
  2 * 60 * 1000;

const COMPLETED_RETENTION =
  7 * 24 * 60 * 60 * 1000;

function emitOutboxChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      'bloom-kigali:outbox-changed',
    ),
  );
}

export async function enqueueOfflineOperation(
  input: {
    operationId?: string;
    userId: string;
    kind: OfflineOperationKind;
    payload: unknown;
  },
) {
  const database =
    await getOfflineDatabase();

  const now = Date.now();

  const operation: OfflineOperation = {
    operationId:
      input.operationId ||
      crypto.randomUUID(),
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: 0,
    lastError: null,
    completedAt: null,
  };

  await database.put(
    'outbox',
    operation,
  );

  emitOutboxChanged();

  return operation;
}

export async function getOfflineOperation(
  operationId: string,
) {
  const database =
    await getOfflineDatabase();

  return database.get(
    'outbox',
    operationId,
  );
}

export async function removeOfflineOperation(
  operationId: string,
) {
  const database =
    await getOfflineDatabase();

  await database.delete(
    'outbox',
    operationId,
  );

  emitOutboxChanged();
}

export async function getSyncableOperations(
  userId: string,
) {
  const database =
    await getOfflineDatabase();

  const now = Date.now();

  const operations =
    await database.getAllFromIndex(
      'outbox',
      'by-user',
      userId,
    );

  return operations
    .filter((operation) => {
      if (
        operation.status ===
          'completed' ||
        operation.status ===
          'syncing'
      ) {
        return false;
      }

      if (
        operation.nextAttemptAt ===
        null
      ) {
        return false;
      }

      return (
        operation.nextAttemptAt <= now
      );
    })
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt,
    );
}

async function updateOperation(
  operationId: string,
  updater: (
    operation: OfflineOperation,
  ) => OfflineOperation,
) {
  const database =
    await getOfflineDatabase();

  const operation =
    await database.get(
      'outbox',
      operationId,
    );

  if (!operation) {
    return;
  }

  await database.put(
    'outbox',
    updater(operation),
  );

  emitOutboxChanged();
}

export async function markOperationSyncing(
  operationId: string,
) {
  const now = Date.now();

  await updateOperation(
    operationId,
    (operation) => ({
      ...operation,
      status: 'syncing',
      updatedAt: now,
      lastError: null,
    }),
  );
}

export async function markOperationCompleted(
  operationId: string,
) {
  const now = Date.now();

  await updateOperation(
    operationId,
    (operation) => ({
      ...operation,
      status: 'completed',
      updatedAt: now,
      nextAttemptAt: null,
      lastError: null,
      completedAt: now,
    }),
  );
}

export async function markOperationFailed(
  operationId: string,
  error: string,
  nextAttemptAt: number | null,
) {
  const now = Date.now();

  await updateOperation(
    operationId,
    (operation) => ({
      ...operation,
      status: 'failed',
      attempts:
        operation.attempts + 1,
      updatedAt: now,
      nextAttemptAt,
      lastError: error,
      completedAt: null,
    }),
  );
}

export async function resetStaleSyncingOperations(
  userId: string,
) {
  const database =
    await getOfflineDatabase();

  const operations =
    await database.getAllFromIndex(
      'outbox',
      'by-user',
      userId,
    );

  const now = Date.now();

  const stale = operations.filter(
    (operation) =>
      operation.status ===
        'syncing' &&
      now - operation.updatedAt >=
        STALE_SYNCING_AFTER,
  );

  if (stale.length === 0) {
    return;
  }

  const transaction =
    database.transaction(
      'outbox',
      'readwrite',
    );

  await Promise.all(
    stale.map((operation) =>
      transaction.store.put({
        ...operation,
        status: 'pending',
        updatedAt: now,
        nextAttemptAt: 0,
      }),
    ),
  );

  await transaction.done;

  emitOutboxChanged();
}

export async function cleanupCompletedOperations(
  userId: string,
) {
  const database =
    await getOfflineDatabase();

  const operations =
    await database.getAllFromIndex(
      'outbox',
      'by-user',
      userId,
    );

  const cutoff =
    Date.now() -
    COMPLETED_RETENTION;

  const expired =
    operations.filter(
      (operation) =>
        operation.status ===
          'completed' &&
        operation.completedAt !==
          null &&
        operation.completedAt <
          cutoff,
    );

  if (expired.length === 0) {
    return;
  }

  const transaction =
    database.transaction(
      'outbox',
      'readwrite',
    );

  await Promise.all(
    expired.map((operation) =>
      transaction.store.delete(
        operation.operationId,
      ),
    ),
  );

  await transaction.done;

  emitOutboxChanged();
}

export async function getOutboxSummary(
  userId: string,
) {
  const database =
    await getOfflineDatabase();

  const operations =
    await database.getAllFromIndex(
      'outbox',
      'by-user',
      userId,
    );

  return {
    pending: operations.filter(
      (operation) =>
        operation.status ===
          'pending',
    ).length,

    syncing: operations.filter(
      (operation) =>
        operation.status ===
          'syncing',
    ).length,

    failed: operations.filter(
      (operation) =>
        operation.status ===
          'failed',
    ).length,
  };
}

export async function retryOfflineOperation(
  operationId: string,
) {
  const database =
    await getOfflineDatabase();

  const operation =
    await database.get(
      'outbox',
      operationId,
    );

  if (
    !operation ||
    operation.status !== 'failed'
  ) {
    return false;
  }

  await database.put(
    'outbox',
    {
      ...operation,
      status: 'pending',
      updatedAt: Date.now(),
      nextAttemptAt: 0,
      lastError: null,
      completedAt: null,
    },
  );

  emitOutboxChanged();

  return true;
}

export async function retryFailedOfflineOperations(
  userId: string,
) {
  const database =
    await getOfflineDatabase();

  const operations =
    await database.getAllFromIndex(
      'outbox',
      'by-user',
      userId,
    );

  const failed =
    operations.filter(
      (operation) =>
        operation.status === 'failed',
    );

  if (failed.length === 0) {
    return 0;
  }

  const transaction =
    database.transaction(
      'outbox',
      'readwrite',
    );

  const now = Date.now();

  await Promise.all(
    failed.map((operation) =>
      transaction.store.put({
        ...operation,
        status: 'pending',
        updatedAt: now,
        nextAttemptAt: 0,
        lastError: null,
        completedAt: null,
      }),
    ),
  );

  await transaction.done;

  emitOutboxChanged();

  return failed.length;
}
