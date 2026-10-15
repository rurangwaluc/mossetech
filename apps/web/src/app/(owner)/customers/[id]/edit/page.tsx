import { requirePermission } from '@/lib/auth/require-permission';
import {
  and,
  eq,
} from 'drizzle-orm';
import {
  notFound,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';
import {
  corrections,
  customers,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import CustomerFixForm from './customer-fix-form';


type PageProps = {
  params:
    Promise<{
      id: string;
    }>;

  searchParams?:
    Promise<{
      error?: string;
    }>;
};


export default async function CustomerFixPage({
  params,
  searchParams,
}: PageProps) {
  const user =
    await requirePermission('customers.edit');

  const {
    id,
  } =
    await params;

  const query =
    await searchParams;

  const [customer] =
    await db
      .select()
      .from(
        customers,
      )
      .where(
        eq(
          customers.id,
          id,
        ),
      )
      .limit(1);

  if (
    !customer ||
    customer.status !==
      'ACTIVE'
  ) {
    notFound();
  }

  const [pendingRequest] =
    await db
      .select({
        id:
          corrections.id,
      })
      .from(
        corrections,
      )
      .where(
        and(
          eq(
            corrections.targetType,
            'CUSTOMER',
          ),
          eq(
            corrections.targetId,
            customer.id,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  return (
    <CustomerFixForm
      customer={{
        id:
          customer.id,

        name:
          customer.name,

        phone:
          customer.phone,

        notes:
          customer.notes,
      }}
      role={
        user.role
      }
      hasPendingRequest={
        Boolean(
          pendingRequest,
        )
      }
      error={
        query?.error ||
        null
      }
    />
  );
}
