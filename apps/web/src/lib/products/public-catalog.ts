import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  lte,
  or,
} from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import { products } from '@mossetech/db/schema';

const PUBLIC_PRODUCT_COLUMNS = {
  id: products.id,
  name: products.name,
  category: products.category,
  brand: products.brand,
  model: products.model,
  condition: products.condition,
  specifications: products.specifications,
  compatibility: products.compatibility,
  notes: products.notes,
  unit: products.unit,
  sellingPrice: products.sellingPrice,
  quantity: products.quantity,
  imageKey: products.imageKey,
} as const;

const publicProductFilter = and(
  eq(products.itemType, 'PRODUCT'),
  eq(products.status, 'ACTIVE'),
  gt(products.quantity, 0),
  gt(products.sellingPrice, '0'),
  eq(products.isPublished, true),
);

export const CATALOG_PAGE_SIZE = 12;

export type CatalogFilters = {
  q?: string;
  category?: string;
  sort?: string;
  min?: string;
  max?: string;
  page?: string;
};

function validPrice(value?: string) {
  if (!value || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) {
    return null;
  }

  return Number(value);
}

export async function getPublicCatalog(
  filters: CatalogFilters = {},
) {
  const query = (filters.q ?? '').trim().slice(0, 100);
  const category = (filters.category ?? '').trim().slice(0, 100);
  const min = validPrice(filters.min);
  const max = validPrice(filters.max);

  const requestedPage = Number(filters.page ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1;

  const searchPattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;

  const where = and(
    publicProductFilter,
    query
      ? or(
          ilike(products.name, searchPattern),
          ilike(products.brand, searchPattern),
          ilike(products.model, searchPattern),
          ilike(products.compatibility, searchPattern),
        )
      : undefined,
    category ? eq(products.category, category) : undefined,
    min !== null ? gte(products.sellingPrice, String(min)) : undefined,
    max !== null ? lte(products.sellingPrice, String(max)) : undefined,
  );

  const [totalResult, categories] = await Promise.all([
    db
      .select({ value: count() })
      .from(products)
      .where(where),
    db
      .select({ category: products.category })
      .from(products)
      .where(publicProductFilter)
      .groupBy(products.category)
      .orderBy(asc(products.category)),
  ]);

  const total = totalResult[0]?.value ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(total / CATALOG_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);

  const sort = filters.sort ?? 'newest';

  const ordering =
    sort === 'price-asc'
      ? [asc(products.sellingPrice), asc(products.id)]
      : sort === 'price-desc'
        ? [desc(products.sellingPrice), asc(products.id)]
        : sort === 'name'
          ? [asc(products.name), asc(products.id)]
          : [desc(products.createdAt), desc(products.id)];

  const items = await db
    .select(PUBLIC_PRODUCT_COLUMNS)
    .from(products)
    .where(where)
    .orderBy(...ordering)
    .limit(CATALOG_PAGE_SIZE)
    .offset((currentPage - 1) * CATALOG_PAGE_SIZE);

  return {
    items,
    categories,
    total,
    page: currentPage,
    totalPages,
  };
}

export async function getPublicProduct(productId: string) {
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!UUID_PATTERN.test(productId)) {
    return null;
  }

  const [product] = await db
    .select(PUBLIC_PRODUCT_COLUMNS)
    .from(products)
    .where(
      and(
        publicProductFilter,
        eq(products.id, productId),
      ),
    )
    .limit(1);

  return product ?? null;
}
