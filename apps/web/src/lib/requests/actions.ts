'use server';

import {
  and,
  eq,
} from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@mossetech/db/client';
import { corrections } from '@mossetech/db/schema';
import { requireOwner } from '@/lib/auth/session';

export async function rejectRequestAction(
  formData: FormData,
) {
  const owner =
    await requireOwner();

  const correctionId = String(
    formData.get('correctionId') ||
      '',
  ).trim();

  if (!correctionId) {
    redirect(
      '/requests?error=Request%20was%20not%20found.',
    );
  }

  const now = new Date();

  const rejected = await db
    .update(corrections)
    .set({
      status: 'REJECTED',
      reviewedByUserId:
        owner.id,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(
          corrections.id,
          correctionId,
        ),
        eq(
          corrections.status,
          'PENDING',
        ),
      ),
    )
    .returning({
      id: corrections.id,
      targetType:
        corrections.targetType,
      targetId:
        corrections.targetId,
    });

  if (rejected.length === 0) {
    redirect(
      '/requests?error=Request%20was%20not%20found.',
    );
  }

  const request =
    rejected[0];

  if (
    request &&
    request.targetType ===
      'EXPENSE'
  ) {
    revalidatePath(
      '/expenses',
    );

    revalidatePath(
      `/expenses/${request.targetId}`,
    );

    revalidatePath(
      `/expenses/${request.targetId}/edit`,
    );

    revalidatePath(
      '/money',
    );

    revalidatePath(
      '/reports',
    );
  }

  if (
    request &&
    request.targetType ===
      'CUSTOMER'
  ) {
    revalidatePath(
      '/customers',
    );

    revalidatePath(
      `/customers/${request.targetId}`,
    );

    revalidatePath(
      `/customers/${request.targetId}/edit`,
    );
  }

  if (
    request &&
    (
      request.targetType ===
        'SALE' ||
      request.targetType ===
        'SALE_PAYMENT'
    )
  ) {
    revalidatePath(
      `/sales/${request.targetId}`,
    );

    revalidatePath(
      `/sales/${request.targetId}/fix`,
    );

    revalidatePath(
      `/sales/${request.targetId}/payment-fix`,
    );
  }

  if (
    request &&
    request.targetType ===
      'STOCK_DAMAGE'
  ) {
    revalidatePath(
      `/stock/damaged/${request.targetId}/fix`,
    );
  }

  revalidatePath('/requests');
  revalidatePath('/products');
  revalidatePath('/stock');
  revalidatePath('/dashboard');

  redirect(
    '/requests?rejected=1',
  );
}
