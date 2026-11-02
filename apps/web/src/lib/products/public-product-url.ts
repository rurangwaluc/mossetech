const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function productSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '') || 'product';
}

export function publicProductPath(
  product: { id: string; name: string },
): string {
  return `/catalog/${productSlug(product.name)}-${product.id}`;
}

export function isProductUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
