import { asc, and, eq } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import { customers, products } from '@mossetech/db/schema';
import { requirePermission } from '@/lib/auth/require-permission';
import { QuotationForm } from './quotation-form';
export default async function NewQuotationPage() {
  await requirePermission('sales.create');
  const [productList, customerList] = await Promise.all([
    db.select({ id: products.id, name: products.name, sellingPrice: products.sellingPrice, minimumSellingPrice: products.minimumSellingPrice }).from(products).where(and(eq(products.status, 'ACTIVE'), eq(products.itemType, 'PRODUCT'))).orderBy(asc(products.name)),
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(eq(customers.status, 'ACTIVE')).orderBy(asc(customers.name)),
  ]);
  return <section className="space-y-5"><div><h1 className="font-display text-2xl font-black text-[var(--text)]">New proforma invoice</h1><p className="text-sm text-[var(--muted)]">A quotation only. No sale, payment or stock deduction.</p></div><QuotationForm products={productList} customers={customerList} /></section>;
}
