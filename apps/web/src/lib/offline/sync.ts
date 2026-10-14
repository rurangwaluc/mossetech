import {
  deletePendingOfflineFile,
  getPendingFilesForOperation,
} from './pending-files';

import {
  getSyncableOperations,
  markOperationCompleted,
  markOperationFailed,
  markOperationSyncing,
} from './outbox';

import type {
  OfflineOperation,
} from './types';

import {
  uploadProductImage,
} from '@/lib/products/image-upload';

const SYNC_ENDPOINT =
  '/api/sync/outbox';

const activeSyncs =
  new Map<
    string,
    Promise<number>
  >();

function emitSyncState(
  state:
    | 'offline'
    | 'idle'
    | 'syncing'
    | 'error',
) {
  if (
    typeof window ===
    'undefined'
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      'bloom-kigali:sync-state',
      {
        detail: {
          state,
        },
      },
    ),
  );
}

function retryDelay(
  previousAttempts: number,
) {
  const exponent =
    Math.min(
      previousAttempts,
      8,
    );

  return Math.min(
    30 * 60 * 1000,
    5_000 *
      2 ** exponent,
  );
}

async function responseError(
  response: Response,
) {
  try {
    const data =
      (await response.json()) as {
        error?: unknown;
      };

    if (
      typeof data.error ===
      'string'
    ) {
      return data.error;
    }
  } catch {
    // Fall back below.
  }

  return `Sync failed with HTTP ${response.status}.`;
}

function productFileContext(
  operation:
    OfflineOperation,
) {
  if (
    operation.kind !==
      'PRODUCT_CREATE' &&
    operation.kind !==
      'PRODUCT_UPDATE'
  ) {
    return null;
  }

  if (
    !operation.payload ||
    typeof operation.payload !==
      'object' ||
    Array.isArray(
      operation.payload,
    )
  ) {
    throw new Error(
      'Product sync data is invalid.',
    );
  }

  const payload =
    operation.payload as Record<
      string,
      unknown
    >;

  if (
    typeof payload.productId !==
      'string'
  ) {
    throw new Error(
      'Product sync is missing its product ID.',
    );
  }

  const reason =
    operation.kind ===
      'PRODUCT_UPDATE' &&
    typeof payload.reason ===
      'string'
      ? payload.reason
      : undefined;

  return {
    productId:
      payload.productId,

    reason,
  };
}

async function syncPendingProductFiles(
  operation:
    OfflineOperation,
) {
  const context =
    productFileContext(
      operation,
    );

  if (!context) {
    return;
  }

  const pendingFiles =
    await getPendingFilesForOperation(
      operation.operationId,
    );

  const photos =
    pendingFiles.filter(
      (file) =>
        file.field ===
        'productPhoto',
    );

  for (
    const pending of photos
  ) {
    const file =
      new File(
        [
          pending.blob,
        ],
        pending.fileName,
        {
          type:
            pending.contentType,
        },
      );

    await uploadProductImage(
      context.productId,
      file,
      context.reason,
    );

    await deletePendingOfflineFile(
      pending.id,
    );
  }
}

async function performSync(
  userId: string,
) {
  if (
    typeof window ===
    'undefined'
  ) {
    return 0;
  }

  if (!navigator.onLine) {
    emitSyncState(
      'offline',
    );

    return 0;
  }

  const operations =
    await getSyncableOperations(
      userId,
    );

  if (
    operations.length ===
    0
  ) {
    emitSyncState(
      'idle',
    );

    return 0;
  }

  emitSyncState(
    'syncing',
  );

  let completedCount =
    0;

  for (
    const operation of
      operations
  ) {
    await markOperationSyncing(
      operation.operationId,
    );

    try {
      const response =
        await fetch(
          SYNC_ENDPOINT,
          {
            method:
              'POST',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                operationId:
                  operation.operationId,

                kind:
                  operation.kind,

                payload:
                  operation.payload,

                createdAt:
                  operation.createdAt,
              }),
          },
        );

      if (response.ok) {
        /*
         * Finish any queued product photo first.
         * The UI must refresh only after imageKey
         * has been updated by the photo pipeline.
         */
        await syncPendingProductFiles(
          operation,
        );

        await markOperationCompleted(
          operation.operationId,
        );

        completedCount +=
          1;

        window.dispatchEvent(
          new CustomEvent(
            'bloom-kigali:data-committed',
          ),
        );

        continue;
      }

      const error =
        await responseError(
          response,
        );

      if (
        response.status ===
          400 ||
        response.status ===
          404 ||
        response.status ===
          409 ||
        response.status ===
          422
      ) {
        await markOperationFailed(
          operation.operationId,
          error,
          null,
        );

        continue;
      }

      if (
        response.status ===
          401 ||
        response.status ===
          403
      ) {
        await markOperationFailed(
          operation.operationId,
          error,
          Date.now() +
            60_000,
        );

        emitSyncState(
          'error',
        );

        return completedCount;
      }

      await markOperationFailed(
        operation.operationId,
        error,
        Date.now() +
          retryDelay(
            operation.attempts,
          ),
      );
    } catch (error) {
      const message =
        error instanceof
          Error
          ? error.message
          : 'Network sync failed.';

      await markOperationFailed(
        operation.operationId,
        message,
        Date.now() +
          retryDelay(
            operation.attempts,
          ),
      );

      if (
        !navigator.onLine
      ) {
        emitSyncState(
          'offline',
        );

        return completedCount;
      }
    }
  }

  emitSyncState(
    'idle',
  );

  return completedCount;
}

export function runOutboxSync(
  userId: string,
) {
  const existing =
    activeSyncs.get(
      userId,
    );

  if (existing) {
    return existing;
  }

  const syncPromise =
    performSync(
      userId,
    ).finally(
      () => {
        activeSyncs.delete(
          userId,
        );
      },
    );

  activeSyncs.set(
    userId,
    syncPromise,
  );

  return syncPromise;
}
