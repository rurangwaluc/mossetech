import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import {
  offlineOperations,
} from '@mossetech/db/schema';

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export class OfflineOperationConflictError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      'OfflineOperationConflictError';
  }
}

function normalizeJson(
  value: unknown,
): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        'Offline payload contains an invalid number.',
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeJson,
    );
  }

  if (
    typeof value === 'object'
  ) {
    const input =
      value as Record<
        string,
        unknown
      >;

    const output: {
      [key: string]: JsonValue;
    } = {};

    for (
      const key of Object.keys(
        input,
      ).sort()
    ) {
      const item = input[key];

      if (
        typeof item ===
          'undefined' ||
        typeof item ===
          'function' ||
        typeof item ===
          'symbol'
      ) {
        throw new Error(
          'Offline payload contains an unsupported value.',
        );
      }

      output[key] =
        normalizeJson(item);
    }

    return output;
  }

  throw new Error(
    'Offline payload contains an unsupported value.',
  );
}

function createPayloadHash(
  kind: string,
  payload: unknown,
) {
  const normalized =
    normalizeJson(payload);

  return createHash('sha256')
    .update(
      JSON.stringify({
        kind,
        payload: normalized,
      }),
    )
    .digest('hex');
}

export async function runIdempotentOfflineOperation<
  TResult extends JsonValue,
>(input: {
  operationId: string;
  userId: string;
  kind: string;
  payload: unknown;
  clientCreatedAt: Date;
  execute: (
    tx: DbTransaction,
  ) => Promise<TResult>;
}) {
  const payloadHash =
    createPayloadHash(
      input.kind,
      input.payload,
    );

  return db.transaction(
    async (tx) => {
      await tx
        .insert(
          offlineOperations,
        )
        .values({
          operationId:
            input.operationId,
          userId: input.userId,
          kind: input.kind,
          payloadHash,
          status: 'PROCESSING',
          result: null,
          clientCreatedAt:
            input.clientCreatedAt,
          updatedAt: new Date(),
        })
        .onConflictDoNothing({
          target:
            offlineOperations.operationId,
        });

      const [operation] =
        await tx
          .select()
          .from(
            offlineOperations,
          )
          .where(
            eq(
              offlineOperations.operationId,
              input.operationId,
            ),
          )
          .limit(1);

      if (!operation) {
        throw new Error(
          'Offline operation could not be created.',
        );
      }

      if (
        operation.userId !==
        input.userId
      ) {
        throw new OfflineOperationConflictError(
          'Operation belongs to a different user.',
        );
      }

      if (
        operation.kind !==
          input.kind ||
        operation.payloadHash !==
          payloadHash
      ) {
        throw new OfflineOperationConflictError(
          'Operation ID was reused with different data.',
        );
      }

      if (
        operation.status ===
        'COMPLETED'
      ) {
        return {
          replayed: true,
          result:
            operation.result as TResult,
        };
      }

      const result =
        await input.execute(tx);

      const completedAt =
        new Date();

      await tx
        .update(
          offlineOperations,
        )
        .set({
          status: 'COMPLETED',
          result,
          updatedAt:
            completedAt,
          completedAt,
        })
        .where(
          eq(
            offlineOperations.operationId,
            input.operationId,
          ),
        );

      return {
        replayed: false,
        result,
      };
    },
  );
}
