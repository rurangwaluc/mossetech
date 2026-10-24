import { GetObjectCommand } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@mossetech/db/client';
import { productImages, products } from '@mossetech/db/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { getR2BucketName, getR2Client } from '@/lib/r2/client';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{
    productId: string;
    imageId: string;
  }>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Your session has expired.' },
      { status: 401 },
    );
  }

  const { productId, imageId } = await params;

  if (!UUID.test(productId) || !UUID.test(imageId)) {
    return NextResponse.json(
      { error: 'Invalid product photo.' },
      { status: 400 },
    );
  }

  const [image] = await db
    .select({
      imageKey: productImages.imageKey,
    })
    .from(productImages)
    .innerJoin(
      products,
      eq(productImages.productId, products.id),
    )
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.productId, productId),
        eq(products.itemType, 'PRODUCT'),
        eq(products.status, 'ACTIVE'),
      ),
    )
    .limit(1);

  if (!image) {
    return NextResponse.json(
      { error: 'Product photo not found.' },
      { status: 404 },
    );
  }

  try {
    const object = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: image.imageKey,
      }),
    );

    if (!object.Body) {
      return NextResponse.json(
        { error: 'Product photo is unavailable.' },
        { status: 404 },
      );
    }

    const bytes = await object.Body.transformToByteArray();

    if (
      bytes.length === 0 ||
      bytes.length > 5 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: 'Invalid product photo.' },
        { status: 502 },
      );
    }

    const contentType = object.ContentType;

    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp'
    ) {
      return NextResponse.json(
        { error: 'Unsupported product photo.' },
        { status: 502 },
      );
    }

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Product photo could not be loaded.' },
      { status: 502 },
    );
  }
}
