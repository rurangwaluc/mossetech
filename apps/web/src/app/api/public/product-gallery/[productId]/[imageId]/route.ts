import { GetObjectCommand } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@mossetech/db/client';
import { productImages } from '@mossetech/db/schema';
import { getPublicProduct } from '@/lib/products/public-catalog';
import { getR2BucketName, getR2Client } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
};

type RouteProps = {
  params: Promise<{
    productId: string;
    imageId: string;
  }>;
};

function unavailable(status = 404) {
  return new NextResponse(null, {
    status,
    headers: NO_STORE,
  });
}

export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const { productId, imageId } = await params;

  if (!UUID.test(productId) || !UUID.test(imageId)) {
    return unavailable();
  }

  // Use the same published/active/in-stock/price checks
  // as the existing public catalog and main image API.
  const product = await getPublicProduct(productId);

  if (!product) {
    return unavailable();
  }

  const [image] = await db
    .select({
      imageKey: productImages.imageKey,
    })
    .from(productImages)
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.productId, product.id),
      ),
    )
    .limit(1);

  if (!image) {
    return unavailable();
  }

  try {
    const object = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: image.imageKey,
      }),
    );

    if (!object.Body) {
      return unavailable();
    }

    const contentType =
      object.ContentType?.toLowerCase().split(';')[0].trim();

    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp'
    ) {
      return unavailable(415);
    }

    // Limit the amount of image data buffered by the server.
    if (
      typeof object.ContentLength === 'number' &&
      (object.ContentLength <= 0 ||
        object.ContentLength > 5 * 1024 * 1024)
    ) {
      return unavailable(502);
    }

    const bytes = await object.Body.transformToByteArray();

    if (
      bytes.length === 0 ||
      bytes.length > 5 * 1024 * 1024
    ) {
      return unavailable(502);
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': contentType,
      },
    });
  } catch {
    return unavailable(502);
  }
}
