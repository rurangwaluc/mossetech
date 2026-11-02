const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function productSlug(name: string): string {
  return name
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '') || 'product';
}

export function publicProductPath(
  product: { id: string; slug: string | null },
): string {
  if (product.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) {
    return `/catalog/${product.slug}`;
  }

  // Temporary compatibility until existing products have slugs.
  return `/catalog/${product.id}`;
}

export function isProductUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
