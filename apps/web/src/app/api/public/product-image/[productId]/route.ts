import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

import { getPublicProduct } from '@/lib/products/public-catalog';
import { getR2BucketName, getR2Client } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
};

type RouteProps = {
  params: Promise<{ productId: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const { productId } = await params;

  const product = await getPublicProduct(productId);

  if (!product?.imageKey) {
    return new NextResponse(null, {
      status: 404,
      headers: NO_STORE,
    });
  }

  try {
    const object = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: product.imageKey,
      }),
    );

    if (!object.Body) {
      return new NextResponse(null, {
        status: 404,
        headers: NO_STORE,
      });
    }

    const allowedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ]);

    const contentType =
      object.ContentType?.toLowerCase().split(';')[0].trim();

    if (!contentType || !allowedTypes.has(contentType)) {
      return new NextResponse(null, {
        status: 415,
        headers: NO_STORE,
      });
    }

    const bytes = await object.Body.transformToByteArray();

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Public product image retrieval failed.', error);

    return new NextResponse(null, {
      status: 502,
      headers: NO_STORE,
    });
  }
}
