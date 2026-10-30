import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import { suppliers } from '@mossetech/db/schema';
import { requirePermission } from '@/lib/auth/require-permission';

import { ExternalSaleForm } from './external-sale-form';

export default async function NewExternalSalePage() {
  await requirePermission('sales.create');

  const supplierList = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(suppliers)
    .where(eq(suppliers.status, 'ACTIVE'))
    .orderBy(asc(suppliers.name));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/sales/new"
          className="text-sm font-semibold text-[var(--primary)]"
        >
          ← Our Stock
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-[var(--text)]">
          External Stock Sale
        </h1>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Record a product supplied by another shop without
          adding it to your inventory.
        </p>
      </div>

      <ExternalSaleForm suppliers={supplierList} />
    </main>
  );
}
