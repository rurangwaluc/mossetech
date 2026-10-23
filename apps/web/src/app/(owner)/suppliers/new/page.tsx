import Link from 'next/link';
import { requireOwner } from '@/lib/auth/session';
import { createSupplierAction } from '@/lib/suppliers/actions';

const fieldClass =
  'mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary)]';

export default async function NewSupplierPage() {
  await requireOwner();

  return (
    <main className="mx-auto max-w-4xl">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h1 className="text-xl font-black text-[var(--text)]">
            Add supplier
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Save your supplier's contact information.
          </p>
        </div>

        <form action={createSupplierAction} className="space-y-5 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { name: 'name', label: 'Supplier name', required: true },
              { name: 'contactPerson', label: 'Contact person' },
              { name: 'phone', label: 'Phone number' },
              { name: 'email', label: 'Email address' },
            ].map((field) => (
              <label key={field.name} className="block">
                <span className="text-sm font-bold text-[var(--text)]">
                  {field.label}
                </span>
                <input
                  name={field.name}
                  type={field.name === 'email' ? 'email' : 'text'}
                  required={field.required}
                  maxLength={field.name === 'name' || field.name === 'contactPerson' ? 160 : field.name === 'phone' ? 40 : 180}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-bold text-[var(--text)]">
              Address
            </span>
            <textarea
              name="address"
              maxLength={1000}
              rows={2}
              className={`${fieldClass} h-auto py-3`}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[var(--text)]">
              Notes (optional)
            </span>
            <textarea
              name="notes"
              maxLength={2000}
              rows={3}
              className={`${fieldClass} h-auto py-3`}
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href="/suppliers"
              className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-bold text-[var(--text)]"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-[var(--primary-action)] px-5 py-3 text-sm font-bold text-white"
            >
              Save supplier
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
