import { requirePermission } from '@/lib/auth/require-permission';
import {
  and,
  eq,
  sql,
} from 'drizzle-orm';
import Link from 'next/link';
import {
  notFound,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';
import {
  corrections,
  salePayments,
  sales,
} from '@mossetech/db/schema';

import {
} from '@/lib/auth/session';

import PaymentFixForm from './payment-fix-form';


type PageProps = {
  params:
    Promise<{
      id: string;
    }>;

  searchParams?:
    Promise<{
      error?: string;
      paymentId?: string;
    }>;
};


function money(
  value:
    | string
    | number,
) {
  return new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits:
        0,
    },
  ).format(
    Number(
      value || 0,
    ),
  );
}


export default async function PaymentFixPage({
  params,
  searchParams,
}: PageProps) {
  const user =
    await requirePermission('sales.correct');

  const {
    id,
  } = await params;

  const query =
    await searchParams;

  const [sale] =
    await db
      .select()
      .from(sales)
      .where(
        eq(
          sales.id,
          id,
        ),
      )
      .limit(1);

  if (!sale) {
    notFound();
  }

  const activePayments =
    await db
      .select()
      .from(
        salePayments,
      )
      .where(
        and(
          eq(
            salePayments.saleId,
            sale.id,
          ),
          eq(
            salePayments.isActive,
            true,
          ),
        ),
      );

  const atSalePayments =
    activePayments.filter(
      (payment) =>
        payment.paymentType ===
        'AT_SALE',
    );

  const selectedPaymentId =
    query?.paymentId || '';

  const payment =
    selectedPaymentId
      ? atSalePayments.find(
          (item) => item.id === selectedPaymentId,
        )
      : atSalePayments.length === 1
        ? atSalePayments[0]
        : undefined;

  if (!payment) {
    notFound();
  }

  const otherApplied =
    activePayments
      .filter(
        (current) =>
          current.id !==
          payment.id,
      )
      .reduce(
        (sum, current) =>
          sum +
          Number(
            current.appliedAmount,
          ),
        0,
      );

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
            'SALE_PAYMENT',
          ),
          eq(
            corrections.targetId,
            sale.id,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
          sql`${corrections.beforeValues}->>'paymentId' = ${payment.id}`,
        ),
      )
      .limit(1);

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
          Payment
        </p>

        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-black text-[var(--text)]">
              {user.role ===
              'OWNER'
                ? 'Fix payment mistake'
                : 'Ask owner to fix payment'}
            </h2>

            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              {sale.customerName ||
                'Walk-in customer'}{' '}
              / Sale total{' '}
              {money(
                sale.totalAmount,
              )}
            </p>
          </div>

          <Link
            href={`/sales/${sale.id}`}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
          >
            Back
          </Link>
        </div>
      </header>

      <PaymentFixForm
        paymentId={payment.id}
        saleId={
          sale.id
        }
        role={
          user.role
        }
        saleTotal={
          Number(
            sale.totalAmount,
          )
        }
        otherApplied={
          otherApplied
        }
        hasCustomer={
          Boolean(
            sale.customerId,
          )
        }
        pendingRequest={
          Boolean(
            pendingRequest,
          )
        }
        error={
          query?.error ||
          null
        }
        initial={{
          paymentMethod:
            payment.paymentMethod,

          receivedAmount:
            Number(
              payment
                .receivedAmount,
            ),

          returnedAmount:
            Number(
              payment
                .returnedAmount,
            ),

          extraKeptAmount:
            Number(
              payment
                .extraKeptAmount,
            ),

          extraReason:
            payment
              .extraReason ||
            '',
        }}
      />
    </section>
  );
}
