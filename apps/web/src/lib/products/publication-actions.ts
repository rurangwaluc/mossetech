'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@mossetech/db/client';
import { requireOwner } from '@/lib/auth/session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setProductPublicationAction(
  formData: FormData,
) {
  await requireOwner();

  const productId = String(
    formData.get('productId') ?? '',
  ).trim();

  const requestedState = String(
    formData.get('isPublished') ?? '',
  );

  if (!UUID_PATTERN.test(productId)) {
    throw new Error('Invalid product.');
  }

  if (
    requestedState !== 'true' &&
    requestedState !== 'false'
  ) {
    throw new Error('Invalid publication state.');
  }

  const shouldPublish = requestedState === 'true';

  const result = await db.execute(sql`
    UPDATE products
    SET
      is_published = ${shouldPublish},
      updated_at = NOW()
    WHERE id = ${productId}
      AND item_type = 'PRODUCT'
      AND status = 'ACTIVE'
    RETURNING id
  `);

  if (result.rows.length !== 1) {
    throw new Error(
      'Product not found or not eligible for publication.',
    );
  }

  revalidatePath('/products');
  revalidatePath(`/products/\${productId}`);
  revalidatePath('/catalog');
  revalidatePath(`/catalog/\${productId}`);
}
