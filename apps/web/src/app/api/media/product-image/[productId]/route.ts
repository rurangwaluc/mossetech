import {
  GetObjectCommand,
} from '@aws-sdk/client-s3';

import {
  getSignedUrl,
} from '@aws-sdk/s3-request-presigner';

import {
  and,
  eq,
} from 'drizzle-orm';

import {
  NextResponse,
} from 'next/server';

import {
  db,
} from '@mossetech/db/client';

import {
  products,
} from '@mossetech/db/schema';

import {
  getCurrentUser,
} from '@/lib/auth/session';

import {
  getR2BucketName,
  getR2Client,
} from '@/lib/r2/client';

export const runtime = 'nodejs';

const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteProps = {
  params: Promise<{
    productId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const user =
    await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          'Your session has expired.',
      },
      {
        status: 401,
      },
    );
  }

  const {
    productId,
  } = await params;

  if (
    !PRODUCT_ID_PATTERN.test(
      productId,
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid product.',
      },
      {
        status: 400,
      },
    );
  }

  const [product] =
    await db
      .select({
        imageKey:
          products.imageKey,
      })
      .from(products)
      .where(
        and(
          eq(
            products.id,
            productId,
          ),
          eq(
            products.itemType,
            'PRODUCT',
          ),
          eq(
            products.status,
            'ACTIVE',
          ),
        ),
      )
      .limit(1);

  if (
    !product?.imageKey
  ) {
    return NextResponse.json(
      {
        error:
          'Product photo not found.',
      },
      {
        status: 404,
      },
    );
  }

  const url =
    await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({
        Bucket:
          getR2BucketName(),
        Key:
          product.imageKey,
      }),
      {
        expiresIn: 300,
      },
    );

  const response =
    NextResponse.redirect(
      url,
      307,
    );

  response.headers.set(
    'Cache-Control',
    'private, no-store, max-age=0, must-revalidate',
  );

  response.headers.set(
    'Pragma',
    'no-cache',
  );

  response.headers.set(
    'Expires',
    '0',
  );

  return response;
}
