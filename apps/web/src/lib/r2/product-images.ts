export const PRODUCT_IMAGE_MAX_BYTES =
  5 * 1024 * 1024;

export const PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ProductImageType =
  (typeof PRODUCT_IMAGE_TYPES)[number];

export function isProductImageType(
  value: string,
): value is ProductImageType {
  return (
    PRODUCT_IMAGE_TYPES as readonly string[]
  ).includes(value);
}

export function productImageExtension(
  contentType: ProductImageType,
) {
  if (contentType === 'image/jpeg') {
    return 'jpg';
  }

  if (contentType === 'image/png') {
    return 'png';
  }

  return 'webp';
}
