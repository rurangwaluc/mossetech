import { prepareProductImage } from './image-upload';

async function errorMessage(
  response: Response,
  fallback: string,
) {
  try {
    const body = await response.json() as {
      error?: unknown;
    };

    if (typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // Use the fallback message.
  }

  return fallback;
}

export async function uploadGalleryImage(
  productId: string,
  sourceFile: File,
) {
  const file = await prepareProductImage(sourceFile);

  const presign = await fetch('/api/media/product-gallery', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productId,
      contentType: file.type,
      size: file.size,
    }),
  });

  if (!presign.ok) {
    throw new Error(
      await errorMessage(presign, 'Gallery upload could not start.'),
    );
  }

  const data = await presign.json() as {
    uploadUrl: string;
    imageKey: string;
  };

  const upload = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!upload.ok) {
    throw new Error('Gallery photo upload failed.');
  }

  const confirm = await fetch('/api/media/product-gallery', {
    method: 'PATCH',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productId,
      imageKey: data.imageKey,
    }),
  });

  if (!confirm.ok) {
    throw new Error(
      await errorMessage(confirm, 'Gallery photo could not be saved.'),
    );
  }

  return data.imageKey;
}
