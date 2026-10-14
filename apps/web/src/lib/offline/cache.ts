import { getOfflineDatabase } from './db';

export async function cacheOfflineRecord(
  input: {
    userId: string;
    namespace: string;
    recordId: string;
    data: unknown;
  },
) {
  const database =
    await getOfflineDatabase();

  const key =
    `${input.userId}:${input.namespace}:${input.recordId}`;

  await database.put(
    'cachedRecords',
    {
      key,
      userId: input.userId,
      namespace: input.namespace,
      recordId: input.recordId,
      data: input.data,
      updatedAt: Date.now(),
    },
  );
}

export async function getCachedOfflineRecord(
  input: {
    userId: string;
    namespace: string;
    recordId: string;
  },
) {
  const database =
    await getOfflineDatabase();

  const key =
    `${input.userId}:${input.namespace}:${input.recordId}`;

  return database.get(
    'cachedRecords',
    key,
  );
}

export async function getCachedOfflineRecords(
  userId: string,
  namespace: string,
) {
  const database =
    await getOfflineDatabase();

  return database.getAllFromIndex(
    'cachedRecords',
    'by-user-namespace',
    [
      userId,
      namespace,
    ],
  );
}
