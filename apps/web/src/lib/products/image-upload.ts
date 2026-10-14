import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_TYPES,
} from '@/lib/r2/product-images';

const MAX_SOURCE_BYTES =
  20 * 1024 * 1024;

const MAX_DIMENSION = 1600;

async function responseError(
  response: Response,
  fallback: string,
) {
  try {
    const body =
      (await response.json()) as {
        error?: unknown;
      };

    if (
      typeof body.error ===
      'string'
    ) {
      return body.error;
    }
  } catch {
    // Use fallback below.
  }

  return fallback;
}

export async function prepareProductImage(
  file: File,
) {
  if (
    !(
      PRODUCT_IMAGE_TYPES as
        readonly string[]
    ).includes(file.type)
  ) {
    throw new Error(
      'Use a JPG, PNG, or WebP image.',
    );
  }

  if (
    file.size >
    MAX_SOURCE_BYTES
  ) {
    throw new Error(
      'Choose an image smaller than 20 MB.',
    );
  }

  let bitmap:
    ImageBitmap;

  try {
    bitmap =
      await createImageBitmap(
        file,
      );
  } catch {
    if (
      file.size <=
      PRODUCT_IMAGE_MAX_BYTES
    ) {
      return file;
    }

    throw new Error(
      'This image could not be prepared.',
    );
  }

  const scale =
    Math.min(
      1,
      MAX_DIMENSION /
        Math.max(
          bitmap.width,
          bitmap.height,
        ),
    );

  const width =
    Math.max(
      1,
      Math.round(
        bitmap.width *
          scale,
      ),
    );

  const height =
    Math.max(
      1,
      Math.round(
        bitmap.height *
          scale,
      ),
    );

  const canvas =
    document.createElement(
      'canvas',
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext(
      '2d',
    );

  if (!context) {
    bitmap.close();

    throw new Error(
      'This image could not be prepared.',
    );
  }

  context.drawImage(
    bitmap,
    0,
    0,
    width,
    height,
  );

  bitmap.close();

  const blob =
    await new Promise<
      Blob | null
    >((resolve) => {
      canvas.toBlob(
        resolve,
        'image/webp',
        0.86,
      );
    });

  if (!blob) {
    throw new Error(
      'This image could not be prepared.',
    );
  }

  if (
    blob.size >
    PRODUCT_IMAGE_MAX_BYTES
  ) {
    throw new Error(
      'The prepared image is still too large. Choose another photo.',
    );
  }

  const baseName =
    file.name
      .replace(
        /\.[^.]+$/,
        '',
      )
      .trim() ||
    'product';

  return new File(
    [blob],
    `${baseName}.webp`,
    {
      type:
        'image/webp',
    },
  );
}

export async function uploadProductImage(
  productId: string,
  file: File,
  reason?: string,
) {
  const presign =
    await fetch(
      '/api/media/product-image',
      {
        method: 'POST',
        credentials:
          'same-origin',
        cache:
          'no-store',
        headers: {
          'Content-Type':
            'application/json',
          Accept:
            'application/json',
        },
        body:
          JSON.stringify({
            productId,
            contentType:
              file.type,
            size:
              file.size,
          }),
      },
    );

  if (!presign.ok) {
    throw new Error(
      await responseError(
        presign,
        'Photo upload could not start.',
      ),
    );
  }

  const data =
    (await presign.json()) as {
      uploadUrl: string;
      imageKey: string;
    };

  const upload =
    await fetch(
      data.uploadUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            file.type,
        },
        body: file,
      },
    );

  if (!upload.ok) {
    throw new Error(
      'Photo upload failed. Try again.',
    );
  }

  const confirm =
    await fetch(
      '/api/media/product-image',
      {
        method: 'PATCH',
        credentials:
          'same-origin',
        cache:
          'no-store',
        headers: {
          'Content-Type':
            'application/json',
          Accept:
            'application/json',
        },
        body:
          JSON.stringify({
            productId,
            imageKey:
              data.imageKey,
            reason:
              reason?.trim() ||
              undefined,
          }),
      },
    );

  if (!confirm.ok) {
    throw new Error(
      await responseError(
        confirm,
        'Photo could not be saved.',
      ),
    );
  }

  return data.imageKey;
}
