import { eq, sql } from 'drizzle-orm';
import { suppliers } from '@mossetech/db/schema';

type SupplierDatabase = {
  select: (...args: any[]) => any;
};

export async function resolveSupplierId(
  database: SupplierDatabase,
  supplierName: string | null | undefined,
  selectedId?: string | null,
): Promise<string | null> {
  const name = supplierName?.trim() || '';

  if (selectedId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedId)) {
      throw new Error('Invalid supplier selection.');
    }

    const matches: Array<{ id: string; name: string }> = await database
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(
        sql`${suppliers.id} = ${selectedId}
          AND ${suppliers.status} = 'ACTIVE'`,
      )
      .limit(1);

    if (
      matches.length !== 1 ||
      (name && matches[0].name !== name)
    ) {
      throw new Error('Supplier selection is no longer valid.');
    }

    return matches[0].id;
  }

  if (!name) return null;

  // Legacy receipts stored only a supplier name.
  const matches: Array<{ id: string }> = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      sql`lower(trim(${suppliers.name})) = lower(${name})
        AND ${suppliers.status} = 'ACTIVE'`,
    )
    .limit(2);

  return matches.length === 1 ? matches[0].id : null;
}
