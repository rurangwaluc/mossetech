import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@mossetech/db/client';
import { externalSales, suppliers } from '@mossetech/db/schema';
import { requirePermission } from '@/lib/auth/require-permission';

import { EditExternalDraftForm } from './edit-draft-form';

export default async function EditExternalDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('sales.create');
  const { id } = await params;

  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const [sale] = await db
    .select()
    .from(externalSales)
    .where(eq(externalSales.id, id))
    .limit(1);

  if (!sale) notFound();

  const shops = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      status: suppliers.status,
    })
    .from(suppliers);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href={`/sales/external/${id}`}
          className="text-sm font-semibold text-[var(--primary)]"
        >
          ← External sale
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-[var(--text)]">
          Edit external sale draft
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Save changes before completing the sale.
          No payment or inventory movement is recorded here.
        </p>
      </div>

      {sale.status !== 'DRAFT' ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="font-semibold text-[var(--text)]">
            This sale is no longer a draft.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Completed or cancelled sales cannot be edited here.
          </p>
        </section>
      ) : (
        <EditExternalDraftForm
          sale={{
            id: sale.id,
            supplierId: sale.supplierId,
            customerName: sale.customerName ?? '',
            productName: sale.productName,
            quantity: sale.quantity,
            supplierTotal: sale.agreedSupplierTotal,
            customerTotal: sale.customerTotal,
            notes: sale.notes ?? '',
          }}
          shops={shops.filter(
            (shop) => shop.status === 'ACTIVE' ||
              shop.id === sale.supplierId,
          ).map((shop) => ({
            id: shop.id,
            name: shop.name,
          }))}
        />
      )}
    </main>
  );
}
