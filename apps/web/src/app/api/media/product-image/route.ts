import {
  randomUUID,
} from 'node:crypto';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
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
  revalidatePath,
} from 'next/cache';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  products,
} from '@mossetech/db/schema';

import {
  getCurrentUser,
} from '@/lib/auth/session';
import { hasEmployeePermission } from '@/lib/auth/permissions';

import {
  getR2BucketName,
  getR2Client,
} from '@/lib/r2/client';

import {
  isProductImageType,
  productImageExtension,
  PRODUCT_IMAGE_MAX_BYTES,
} from '@/lib/r2/product-images';

export const runtime = 'nodejs';

const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PresignBody = {
  productId?: unknown;
  contentType?: unknown;
  size?: unknown;
};

type ConfirmBody = {
  productId?: unknown;
  imageKey?: unknown;
  reason?: unknown;
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

async function currentUser() {
  const user =
    await getCurrentUser();

  return user;
}

async function canChangeProductImage(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
) {
  if (
    process.env.MOSSETECH_EMPLOYEE_PERMISSIONS_ENABLED !== 'true'
  ) {
    return true;
  }

  if (user.role === 'OWNER') {
    return true;
  }

  // Product photos belong to existing product records.
  // Creating products alone does not authorize editing them.
  return hasEmployeePermission(user, 'products.edit');
}

export async function POST(
  request: Request,
) {
  const user =
    await currentUser();

  if (!user) {
    return errorResponse(
      'Your session has expired.',
      401,
    );
  }

  if (!(await canChangeProductImage(user))) {
    return errorResponse(
      'You do not have permission to change product photos.',
      403,
    );
  }

  let body: PresignBody;

  try {
    body =
      await request.json();
  } catch {
    return errorResponse(
      'Invalid upload request.',
      400,
    );
  }

  if (
    typeof body.productId !==
      'string' ||
    !PRODUCT_ID_PATTERN.test(
      body.productId,
    )
  ) {
    return errorResponse(
      'Invalid product.',
      400,
    );
  }

  if (
    typeof body.contentType !==
      'string' ||
    !isProductImageType(
      body.contentType,
    )
  ) {
    return errorResponse(
      'Use a JPG, PNG, or WebP image.',
      400,
    );
  }

  if (
    typeof body.size !==
      'number' ||
    !Number.isFinite(
      body.size,
    ) ||
    body.size <= 0 ||
    body.size >
      PRODUCT_IMAGE_MAX_BYTES
  ) {
    return errorResponse(
      'Image must be 5 MB or smaller.',
      400,
    );
  }

  const [product] =
    await db
      .select({
        id:
          products.id,
        imageKey:
          products.imageKey,
      })
      .from(products)
      .where(
        and(
          eq(
            products.id,
            body.productId,
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

  if (!product) {
    return errorResponse(
      'Product not found.',
      404,
    );
  }

  if (product.imageKey && user.role !== 'OWNER') {
    return errorResponse(
      'Only the owner can replace an existing product photo.',
      403,
    );
  }

  const extension =
    productImageExtension(
      body.contentType,
    );

  const imageKey =
    `products/${product.id}/${randomUUID()}.${extension}`;

  const uploadUrl =
    await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket:
          getR2BucketName(),
        Key:
          imageKey,
        ContentType:
          body.contentType,
      }),
      {
        expiresIn: 300,
      },
    );

  return NextResponse.json({
    uploadUrl,
    imageKey,
    expiresIn: 300,
  });
}

export async function PATCH(
  request: Request,
) {
  const user =
    await currentUser();

  if (!user) {
    return errorResponse(
      'Your session has expired.',
      401,
    );
  }

  if (!(await canChangeProductImage(user))) {
    return errorResponse(
      'You do not have permission to change product photos.',
      403,
    );
  }

  let body: ConfirmBody;

  try {
    body =
      await request.json();
  } catch {
    return errorResponse(
      'Invalid image confirmation.',
      400,
    );
  }

  if (
    typeof body.productId !==
      'string' ||
    !PRODUCT_ID_PATTERN.test(
      body.productId,
    )
  ) {
    return errorResponse(
      'Invalid product.',
      400,
    );
  }

  if (
    typeof body.imageKey !==
      'string' ||
    !body.imageKey.startsWith(
      `products/${body.productId}/`,
    )
  ) {
    return errorResponse(
      'Invalid product image.',
      400,
    );
  }

  const imageKey =
    body.imageKey;

  const reason =
    typeof body.reason ===
    'string'
      ? body.reason.trim()
      : '';

  if (
    reason &&
    reason.length < 3
  ) {
    return errorResponse(
      'Tell us why you are changing this.',
      400,
    );
  }

  const [product] =
    await db
      .select({
        id:
          products.id,
        name:
          products.name,
        imageKey:
          products.imageKey,
      })
      .from(products)
      .where(
        and(
          eq(
            products.id,
            body.productId,
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

  if (!product) {
    return errorResponse(
      'Product not found.',
      404,
    );
  }

  if (
    product.imageKey &&
    user.role !== 'OWNER'
  ) {
    return errorResponse(
      'Only the owner can replace an existing product photo.',
      403,
    );
  }

  if (
    product.imageKey &&
    user.role === 'OWNER' &&
    reason.length < 3
  ) {
    return errorResponse(
      'Tell us why you are changing this.',
      400,
    );
  }

  const client =
    getR2Client();

  const bucketName =
    getR2BucketName();

  let uploadedObject;

  try {
    uploadedObject =
      await client.send(
        new HeadObjectCommand({
          Bucket:
            bucketName,
          Key:
            imageKey,
        }),
      );
  } catch {
    return errorResponse(
      'The uploaded image could not be verified.',
      400,
    );
  }

  if (
    typeof uploadedObject.ContentLength !==
      'number' ||
    uploadedObject.ContentLength <=
      0 ||
    uploadedObject.ContentLength >
      PRODUCT_IMAGE_MAX_BYTES
  ) {
    return errorResponse(
      'The uploaded image has an invalid size.',
      400,
    );
  }

  if (
    !uploadedObject.ContentType ||
    !isProductImageType(
      uploadedObject.ContentType,
    )
  ) {
    return errorResponse(
      'The uploaded file is not a supported product image.',
      400,
    );
  }

  const oldImageKey =
    product.imageKey;

  await db.transaction(
    async (tx) => {
      await tx
        .update(products)
        .set({
          imageKey:
            imageKey,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            products.id,
            product.id,
          ),
        );

      if (reason) {
        const now =
          new Date();

        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'PRODUCT',

            targetId:
              product.id,

            targetLabel:
              product.name,

            requestedByUserId:
              user.id,

            reviewedByUserId:
              user.id,

            status:
              'APPLIED',

            beforeValues: {
              imageKey:
                oldImageKey,
            },

            afterValues: {
              imageKey:
                imageKey,
            },

            reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      }
    },
  );

  revalidatePath(
    '/products',
  );

  revalidatePath(
    `/products/${product.id}`,
  );

  revalidatePath(
    `/products/${product.id}/edit`,
  );

  revalidatePath(
    '/stock',
  );

  if (
    oldImageKey &&
    oldImageKey !==
      imageKey
  ) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket:
            bucketName,
          Key:
            oldImageKey,
        }),
      );
    } catch {
      /*
       * The database already points to the new
       * verified image. A failed cleanup must
       * not roll that successful change back.
       */
    }
  }

  return NextResponse.json({
    ok: true,
    imageKey:
      imageKey,
  });
}
