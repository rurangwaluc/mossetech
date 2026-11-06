'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@mossetech/db/client';
import { requireOwner } from '@/lib/auth/session';
import {
  executeProductReturnTransaction,
  type ReturnTransactionLine,
} from './return-transaction';

export type ProductReturnState = {
  error?: string;
  success?: string;
};

type ReturnLine = ReturnTransactionLine;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLines(value: FormDataEntryValue | null): ReturnLine[] {
  if (typeof value !== 'string' || value.length > 20000) {
    throw new Error('Select returned products.');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid returned-product selection.');
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 40) {
    throw new Error('Select between 1 and 40 return lines.');
  }

  const seen = new Set<string>();

  return parsed.map((entry: unknown): ReturnLine => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid return line.');
    }

    const line = entry as Record<string, unknown>;

    if (
      typeof line.saleItemId !== 'string' ||
      !UUID.test(line.saleItemId) ||
      typeof line.quantity !== 'number' ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      (line.condition !== 'RESTOCK' && line.condition !== 'DAMAGED')
    ) {
      throw new Error('Check returned products and quantities.');
    }

    if (seen.has(line.saleItemId)) {
      throw new Error('A sale item was selected twice.');
    }

    seen.add(line.saleItemId);

    return {
      saleItemId: line.saleItemId,
      quantity: line.quantity,
      condition: line.condition,
    };
  });
}

export async function recordProductReturnAction(
  _previous: ProductReturnState,
  formData: FormData,
): Promise<ProductReturnState> {
  const owner = await requireOwner();

  const saleId = String(formData.get('saleId') || '').trim();
  const idempotencyKey =
    String(formData.get('idempotencyKey') || '').trim();
  const reason = String(formData.get('reason') || '').trim();

  if (!UUID.test(saleId) || !UUID.test(idempotencyKey)) {
    return { error: 'Invalid sale or return request.' };
  }

  if (!reason || reason.length > 2000) {
    return { error: 'Enter a return reason.' };
  }

  let requested: ReturnLine[];

  try {
    requested = parseLines(formData.get('returnItems'));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid return.',
    };
  }

  try {
    const result = await db.transaction(async (tx) =>
        executeProductReturnTransaction(tx, {
          ownerId: owner.id,
          saleId,
          idempotencyKey,
          reason,
          requested,
          cashRefundConfirmed: formData.get('cashRefundConfirmed'),
          refundMethod: formData.get('refundMethod'),
          cashRefundExpectedAmount: formData.get('cashRefundExpectedAmount'),
          customerCreditConfirmed: formData.get('customerCreditConfirmed'),
          customerCreditExpectedAmount: formData.get('customerCreditExpectedAmount'),
          settlementMethod: formData.get('settlementMethod'),
        }),
      );

    for (const path of [
      `/sales/${saleId}`,
      `/debts/${saleId}`,
      '/sales',
      '/debts',
      '/stock',
      '/products',
      '/reports',
      '/dashboard',
      '/money',
      '/customers',
    ]) {
      revalidatePath(path);
    }

    return {
      success:
        result === 'already-recorded'
          ? 'This return was already recorded.'
          : 'Product return recorded successfully.',
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Product return could not be recorded.',
    };
  }
}
