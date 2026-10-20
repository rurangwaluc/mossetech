import { requirePermission } from '@/lib/auth/require-permission';
import { notFound } from 'next/navigation';
import {
  and,
  eq,
} from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  corrections,
  products,
  saleItems,
  stockArrivals,
} from '@mossetech/db/schema';

import { ProductForm } from '../../product-form';

type EditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const user =
    await requirePermission('products.edit');

  const { id } = await params;

  const [
    product,
    stockUse,
    saleUse,
    pendingRequest,
  ] = await Promise.all([
    db.query.products.findFirst({
      where: eq(
        products.id,
        id,
      ),
    }),

    db
      .select({
        id: stockArrivals.id,
      })
      .from(stockArrivals)
      .where(
        eq(
          stockArrivals.productId,
          id,
        ),
      )
      .limit(1),

    db
      .select({
        id: saleItems.id,
      })
      .from(saleItems)
      .where(
        eq(
          saleItems.productId,
          id,
        ),
      )
      .limit(1),

    db
      .select({
        id: corrections.id,
      })
      .from(corrections)
      .where(
        and(
          eq(
            corrections.targetType,
            'PRODUCT',
          ),
          eq(
            corrections.targetId,
            id,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1),
  ]);

  if (
    !product ||
    product.status !== 'ACTIVE' ||
    product.itemType !== 'PRODUCT'
  ) {
    notFound();
  }

  return (
    <ProductForm
      product={{
        id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
        model: product.model,
        condition: product.condition,
        specifications: product.specifications,
        compatibility: product.compatibility,
        unit: product.unit,
        sellingPrice: product.sellingPrice,
        minQuantity: product.minQuantity,
        imageKey: product.imageKey,
        notes: product.notes,
      }}
      backHref="/products"
      userId={user.id}
      userRole={user.role}
      unitLocked={
        stockUse.length > 0 ||
        saleUse.length > 0
      }
      hasPendingRequest={
        pendingRequest.length > 0
      }
    />
  );
}
