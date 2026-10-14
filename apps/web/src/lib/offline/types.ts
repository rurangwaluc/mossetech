export const OFFLINE_OPERATION_KINDS = [
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'STOCK_RECEIVE',
  'STOCK_DAMAGE',
  'SALE_CREATE',
  'DEBT_PAYMENT',
  'CUSTOMER_CREATE',
  'EXPENSE_CREATE',
] as const;

export type OfflineOperationKind =
  (typeof OFFLINE_OPERATION_KINDS)[number];

export type OfflineOperationStatus =
  | 'pending'
  | 'syncing'
  | 'failed'
  | 'completed';

export type OfflineOperation = {
  operationId: string;
  userId: string;
  kind: OfflineOperationKind;
  payload: unknown;
  status: OfflineOperationStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  completedAt: number | null;
};

export type PendingOfflineFile = {
  id: string;
  userId: string;
  operationId: string;
  field: string;
  fileName: string;
  contentType: string;
  size: number;
  blob: Blob;
  createdAt: number;
};

export type CachedOfflineRecord = {
  key: string;
  userId: string;
  namespace: string;
  recordId: string;
  data: unknown;
  updatedAt: number;
};

export type OfflineMetaRecord = {
  key: string;
  value:
    | string
    | number
    | boolean
    | null;
};
