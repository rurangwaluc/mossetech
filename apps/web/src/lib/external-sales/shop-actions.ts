'use server';

import { db } from '@mossetech/db/client';
import { suppliers } from '@mossetech/db/schema';
import { eq } from 'drizzle-orm';

import { requireOwner } from '@/lib/auth/session';

type SourceShopResult = {
  shop?: {
    id: string;
    name: string;
  };
  error?: string;
};

export async function createExternalSourceShopAction(input: {
  name: string;
  phone: string;
}): Promise<SourceShopResult> {
  await requireOwner();

  const name = input.name?.trim() || '';
  const phone = input.phone?.trim() || '';

  if (!name || name.length > 160) {
    return { error: 'Enter a valid shop name.' };
  }

  if (phone.length > 40) {
    return { error: 'Phone number is too long.' };
  }

  try {
    const [existing] = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        status: suppliers.status,
      })
      .from(suppliers)
      .where(eq(suppliers.name, name))
      .limit(1);

    if (existing) {
      if (existing.status !== 'ACTIVE') {
        return {
          error: 'This shop already exists but is inactive. Reactivate it in Suppliers.',
        };
      }

      return {
        shop: {
          id: existing.id,
          name: existing.name,
        },
      };
    }

    const [shop] = await db
      .insert(suppliers)
      .values({
        name,
        phone: phone || null,
      })
      .returning({
        id: suppliers.id,
        name: suppliers.name,
      });

    return { shop };
  } catch {
    return { error: 'Could not save this shop. Please try again.' };
  }
}
