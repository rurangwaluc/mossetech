import {
  NextResponse,
} from 'next/server';

import {
  getCurrentUser,
} from '@/lib/auth/session';

import {
  OfflineOperationConflictError,
  runIdempotentOfflineOperation,
} from '@/lib/offline/server';

import {
  OFFLINE_OPERATION_KINDS,
  type OfflineOperationKind,
} from '@/lib/offline/types';

import {
  executeProductCreateSync,
  executeProductUpdateSync,
  ProductSyncError,
} from '@/lib/products/sync-server';

import {
  executeStockDamageSync,
  executeStockReceiveSync,
  StockSyncError,
} from '@/lib/stock/sync-server';

import {
  executeSaleCreateSync,
  SaleSyncError,
} from '@/lib/sales/sync-server';

import {
  DebtPaymentSyncError,
  executeDebtPaymentSync,
} from '@/lib/debts/sync-server';

export const runtime =
  'nodejs';

const MAX_BODY_LENGTH =
  512 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SyncBody = {
  operationId?: unknown;
  kind?: unknown;
  payload?: unknown;
  createdAt?: unknown;
};

function errorResponse(
  error: string,
  status: number,
) {
  return NextResponse.json(
    {
      error,
    },
    {
      status,
    },
  );
}

function isOfflineOperationKind(
  value: unknown,
): value is OfflineOperationKind {
  return (
    typeof value ===
      'string' &&
    (
      OFFLINE_OPERATION_KINDS as
        readonly string[]
    ).includes(value)
  );
}

export async function POST(
  request: Request,
) {
  const user =
    await getCurrentUser();

  if (!user) {
    return errorResponse(
      'Your session has expired.',
      401,
    );
  }

  const rawBody =
    await request.text();

  if (
    rawBody.length >
    MAX_BODY_LENGTH
  ) {
    return errorResponse(
      'Sync request is too large.',
      413,
    );
  }

  let body: SyncBody;

  try {
    body =
      JSON.parse(
        rawBody,
      ) as SyncBody;
  } catch {
    return errorResponse(
      'Invalid sync request.',
      400,
    );
  }

  if (
    typeof body.operationId !==
      'string' ||
    !UUID_PATTERN.test(
      body.operationId,
    )
  ) {
    return errorResponse(
      'Invalid operation ID.',
      400,
    );
  }

  if (
    !isOfflineOperationKind(
      body.kind,
    )
  ) {
    return errorResponse(
      'Invalid operation type.',
      400,
    );
  }

  if (
    typeof body.createdAt !==
      'number' ||
    !Number.isFinite(
      body.createdAt,
    ) ||
    body.createdAt <= 0
  ) {
    return errorResponse(
      'Invalid operation time.',
      400,
    );
  }

  const clientCreatedAt =
    new Date(
      body.createdAt,
    );

  if (
    Number.isNaN(
      clientCreatedAt.getTime(),
    )
  ) {
    return errorResponse(
      'Invalid operation time.',
      400,
    );
  }

  try {
    if (
      body.kind ===
      'PRODUCT_CREATE'
    ) {
      const execution =
        await runIdempotentOfflineOperation({
          operationId:
            body.operationId,

          userId:
            user.id,

          kind:
            body.kind,

          payload:
            body.payload,

          clientCreatedAt,

          execute:
            async (tx) =>
              executeProductCreateSync(
                tx,
                body.payload,
              ),
        });

      return NextResponse.json({
        ok: true,
        replayed:
          execution.replayed,
        result:
          execution.result,
      });
    }

    if (
      body.kind ===
      'PRODUCT_UPDATE'
    ) {
      const execution =
        await runIdempotentOfflineOperation({
          operationId:
            body.operationId,

          userId:
            user.id,

          kind:
            body.kind,

          payload:
            body.payload,

          clientCreatedAt,

          execute:
            async (tx) =>
              executeProductUpdateSync(
                tx,
                user,
                body.payload,
              ),
        });

      return NextResponse.json({
        ok: true,
        replayed:
          execution.replayed,
        result:
          execution.result,
      });
    }

    if (
      body.kind ===
      'STOCK_RECEIVE'
    ) {
      const execution =
        await runIdempotentOfflineOperation({
          operationId:
            body.operationId,

          userId:
            user.id,

          kind:
            body.kind,

          payload:
            body.payload,

          clientCreatedAt,

          execute:
            async (tx) =>
              executeStockReceiveSync(
                tx,
                user,
                body.payload,
                clientCreatedAt,
              ),
        });

      return NextResponse.json({
        ok: true,
        replayed:
          execution.replayed,
        result:
          execution.result,
      });
    }

    if (
      body.kind ===
      'STOCK_DAMAGE'
    ) {
      const execution =
        await runIdempotentOfflineOperation({
          operationId:
            body.operationId,

          userId:
            user.id,

          kind:
            body.kind,

          payload:
            body.payload,

          clientCreatedAt,

          execute:
            async (tx) =>
              executeStockDamageSync(
                tx,
                user,
                body.payload,
                clientCreatedAt,
              ),
        });

      return NextResponse.json({
        ok: true,
        replayed:
          execution.replayed,
        result:
          execution.result,
      });
    }

    if (
      body.kind ===
      'DEBT_PAYMENT'
    ) {
      const execution =
        await runIdempotentOfflineOperation({
          operationId:
            body.operationId,

          userId:
            user.id,

          kind:
            body.kind,

          payload:
            body.payload,

          clientCreatedAt,

          execute:
            async (tx) =>
              executeDebtPaymentSync(
                tx,
                user,
                body.payload,
                clientCreatedAt,
              ),
        });

      return NextResponse.json({
        ok: true,

        replayed:
          execution.replayed,

        result:
          execution.result,
      });
    }

    if (
      body.kind ===
      'SALE_CREATE'
    ) {
      const execution =
        await runIdempotentOfflineOperation({
          operationId:
            body.operationId,

          userId:
            user.id,

          kind:
            body.kind,

          payload:
            body.payload,

          clientCreatedAt,

          execute:
            async (tx) =>
              executeSaleCreateSync(
                tx,
                user,
                body.payload,
                clientCreatedAt,
              ),
        });

      return NextResponse.json({
        ok: true,

        replayed:
          execution.replayed,

        result:
          execution.result,
      });
    }

    return errorResponse(
      'Offline sync for this action is not enabled yet.',
      422,
    );
  } catch (error) {
    if (
      error instanceof
        ProductSyncError ||
      error instanceof
        StockSyncError ||
      error instanceof
        SaleSyncError ||
      error instanceof
        DebtPaymentSyncError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      OfflineOperationConflictError
    ) {
      return errorResponse(
        error.message,
        409,
      );
    }

    throw error;
  }
}
