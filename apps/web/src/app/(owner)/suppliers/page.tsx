import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { requireOwner } from '@/lib/auth/session';
import { db } from '@mossetech/db/client';
import { suppliers } from '@mossetech/db/schema';

export default async function SuppliersPage() {
  await requireOwner();

  let supplierList: Array<typeof suppliers.$inferSelect> = [];
  let databaseReady = true;

  try {
    supplierList = await db
      .select()
      .from(suppliers)
      .orderBy(asc(suppliers.name));
  } catch (error) {
    // PostgreSQL 42P01: table does not exist.
    const cause =
      error && typeof error === 'object' && 'cause' in error
        ? error.cause
        : error;

    if (
      cause &&
      typeof cause === 'object' &&
      'code' in cause &&
      cause.code === '42P01'
    ) {
      databaseReady = false;
    } else {
      throw error;
    }
  }

  if (!databaseReady) {
    return (
      <main className="mx-auto max-w-6xl">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h1 className="text-2xl font-black text-[var(--text)]">
            Suppliers
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Supplier management is being set up.
            No supplier records have been changed.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)]">
            Suppliers
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Manage suppliers and their contact details.
          </p>
        </div>

        <Link
          href="/suppliers/new"
          className="rounded-lg bg-[var(--primary-action)] px-5 py-3 text-sm font-bold text-white"
        >
          Add supplier
        </Link>
      </div>

      {supplierList.length === 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <h2 className="text-lg font-bold text-[var(--text)]">
            No suppliers yet
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Add your first supplier to keep contact and purchasing information together.
          </p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {supplierList.map((supplier) => (
            <Link
              key={supplier.id}
              href={`/suppliers/${supplier.id}`}
              className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0 hover:bg-[var(--background)]"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-[var(--text)]">
                  {supplier.name}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {supplier.contactPerson || supplier.phone || 'No contact recorded'}
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--muted)]">
                {supplier.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
