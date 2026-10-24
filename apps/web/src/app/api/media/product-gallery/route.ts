import { randomUUID } from 'node:crypto';
import {
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { db } from '@mossetech/db/client';
import { productImages, products } from '@mossetech/db/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { getR2BucketName, getR2Client } from '@/lib/r2/client';
import {
  PRODUCT_IMAGE_MAX_BYTES,
  isProductImageType,
  productImageExtension,
} from '@/lib/r2/product-images';

export const runtime = 'nodejs';

const MAX_ADDITIONAL_IMAGES = 7;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function requireProduct(productId: string) {
  if (!UUID.test(productId)) return null;

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.itemType, 'PRODUCT'),
        eq(products.status, 'ACTIVE'),
      ),
    )
    .limit(1);

  return product ?? null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) return fail('Your session has expired.', 401);
  if (user.role !== 'OWNER') {
    return fail('Only the owner can manage product galleries.', 403);
  }

  let body: {
    productId?: unknown;
    contentType?: unknown;
    size?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return fail('Invalid upload request.', 400);
  }

  if (
    typeof body.productId !== 'string' ||
    !(await requireProduct(body.productId))
  ) {
    return fail('Product not found.', 404);
  }

  if (
    typeof body.contentType !== 'string' ||
    !isProductImageType(body.contentType)
  ) {
    return fail('Use a JPG, PNG, or WebP image.', 400);
  }

  if (
    typeof body.size !== 'number' ||
    !Number.isFinite(body.size) ||
    body.size <= 0 ||
    body.size > PRODUCT_IMAGE_MAX_BYTES
  ) {
    return fail('Image must be 5 MB or smaller.', 400);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(productImages)
    .where(eq(productImages.productId, body.productId));

  if (count >= MAX_ADDITIONAL_IMAGES) {
    return fail('This product already has seven additional photos.', 409);
  }

  const imageKey =
    `products/${body.productId}/gallery/${randomUUID()}.${productImageExtension(body.contentType)}`;

  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: imageKey,
      ContentType: body.contentType,
    }),
    { expiresIn: 300 },
  );

  return NextResponse.json({ uploadUrl, imageKey });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) return fail('Your session has expired.', 401);
  if (user.role !== 'OWNER') {
    return fail('Only the owner can manage product galleries.', 403);
  }

  let body: {
    productId?: unknown;
    imageKey?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return fail('Invalid image confirmation.', 400);
  }

  if (
    typeof body.productId !== 'string' ||
    !(await requireProduct(body.productId)) ||
    typeof body.imageKey !== 'string' ||
    !body.imageKey.startsWith(`products/${body.productId}/gallery/`) ||
    !/^products\/[0-9a-f-]{36}\/gallery\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(body.imageKey)
  ) {
    return fail('Invalid product image.', 400);
  }

  let object;

  try {
    object = await getR2Client().send(
      new HeadObjectCommand({
        Bucket: getR2BucketName(),
        Key: body.imageKey,
      }),
    );
  } catch {
    return fail('Uploaded image could not be verified.', 400);
  }

  if (
    !object.ContentLength ||
    object.ContentLength > PRODUCT_IMAGE_MAX_BYTES ||
    !object.ContentType ||
    !isProductImageType(object.ContentType)
  ) {
    return fail('Uploaded image is invalid.', 400);
  }

  try {
    await db.transaction(async (tx) => {
      // Serialize gallery changes for this particular product.
      // Concurrent confirmations cannot exceed the gallery limit.
      const [lockedProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, body.productId as string),
            eq(products.itemType, 'PRODUCT'),
            eq(products.status, 'ACTIVE'),
          ),
        )
        .for('update');

      if (!lockedProduct) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const [existing] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.imageKey, body.imageKey as string))
        .limit(1);

      if (existing) return;

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::integer` })
        .from(productImages)
        .where(eq(productImages.productId, body.productId as string));

      if (count >= MAX_ADDITIONAL_IMAGES) {
        throw new Error('GALLERY_FULL');
      }

      await tx.insert(productImages).values({
        productId: body.productId as string,
        imageKey: body.imageKey as string,
        position: count + 1,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'GALLERY_FULL') {
      return fail('This product already has seven additional photos.', 409);
    }
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      return fail('Product not found.', 404);
    }
    throw error;
  }

  revalidatePath('/products');
  revalidatePath(`/products/${body.productId}`);
  revalidatePath(`/products/${body.productId}/edit`);

  return NextResponse.json({ ok: true });
}
