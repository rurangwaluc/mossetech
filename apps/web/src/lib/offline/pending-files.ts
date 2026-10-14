import { getOfflineDatabase } from './db';

import type {
  PendingOfflineFile,
} from './types';

export async function savePendingOfflineFile(
  input: {
    userId: string;
    operationId: string;
    field: string;
    file: File;
  },
) {
  const database =
    await getOfflineDatabase();

  const record: PendingOfflineFile = {
    id: crypto.randomUUID(),
    userId: input.userId,
    operationId:
      input.operationId,
    field: input.field,
    fileName: input.file.name,
    contentType:
      input.file.type ||
      'application/octet-stream',
    size: input.file.size,
    blob: input.file,
    createdAt: Date.now(),
  };

  await database.put(
    'pendingFiles',
    record,
  );

  return record;
}

export async function getPendingFilesForOperation(
  operationId: string,
) {
  const database =
    await getOfflineDatabase();

  return database.getAllFromIndex(
    'pendingFiles',
    'by-operation',
    operationId,
  );
}

export async function deletePendingOfflineFile(
  id: string,
) {
  const database =
    await getOfflineDatabase();

  await database.delete(
    'pendingFiles',
    id,
  );
}
