import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';

import type {
  CachedOfflineRecord,
  OfflineMetaRecord,
  OfflineOperation,
  OfflineOperationStatus,
  PendingOfflineFile,
} from './types';

const DATABASE_NAME =
  'bloom-kigali-offline';

const DATABASE_VERSION = 1;

interface BloomOfflineDatabase
  extends DBSchema {
  outbox: {
    key: string;
    value: OfflineOperation;
    indexes: {
      'by-user': string;
      'by-user-status': [
        string,
        OfflineOperationStatus,
      ];
      'by-user-created': [
        string,
        number,
      ];
    };
  };

  pendingFiles: {
    key: string;
    value: PendingOfflineFile;
    indexes: {
      'by-user': string;
      'by-operation': string;
    };
  };

  cachedRecords: {
    key: string;
    value: CachedOfflineRecord;
    indexes: {
      'by-user': string;
      'by-user-namespace': [
        string,
        string,
      ];
    };
  };

  meta: {
    key: string;
    value: OfflineMetaRecord;
  };
}

let databasePromise:
  | Promise<
      IDBPDatabase<BloomOfflineDatabase>
    >
  | null = null;

export function getOfflineDatabase() {
  if (typeof window === 'undefined') {
    throw new Error(
      'Offline database is only available in the browser.',
    );
  }

  if (!databasePromise) {
    databasePromise =
      openDB<BloomOfflineDatabase>(
        DATABASE_NAME,
        DATABASE_VERSION,
        {
          upgrade(database) {
            if (
              !database.objectStoreNames.contains(
                'outbox',
              )
            ) {
              const store =
                database.createObjectStore(
                  'outbox',
                  {
                    keyPath: 'operationId',
                  },
                );

              store.createIndex(
                'by-user',
                'userId',
              );

              store.createIndex(
                'by-user-status',
                [
                  'userId',
                  'status',
                ],
              );

              store.createIndex(
                'by-user-created',
                [
                  'userId',
                  'createdAt',
                ],
              );
            }

            if (
              !database.objectStoreNames.contains(
                'pendingFiles',
              )
            ) {
              const store =
                database.createObjectStore(
                  'pendingFiles',
                  {
                    keyPath: 'id',
                  },
                );

              store.createIndex(
                'by-user',
                'userId',
              );

              store.createIndex(
                'by-operation',
                'operationId',
              );
            }

            if (
              !database.objectStoreNames.contains(
                'cachedRecords',
              )
            ) {
              const store =
                database.createObjectStore(
                  'cachedRecords',
                  {
                    keyPath: 'key',
                  },
                );

              store.createIndex(
                'by-user',
                'userId',
              );

              store.createIndex(
                'by-user-namespace',
                [
                  'userId',
                  'namespace',
                ],
              );
            }

            if (
              !database.objectStoreNames.contains(
                'meta',
              )
            ) {
              database.createObjectStore(
                'meta',
                {
                  keyPath: 'key',
                },
              );
            }
          },
        },
      );
  }

  return databasePromise;
}
