'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import {
  updateExternalSaleDraftAction,
  type ExternalSaleDraftState,
} from '@/lib/external-sales/actions';

type Draft = {
  id: string;
  supplierId: string;
  customerName: string;
  productName: string;
  quantity: number;
  supplierTotal: string;
  customerTotal: string;
  notes: string;
};

const fieldClass =
  'mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm text-[var(--text)]';

export function EditExternalDraftForm({
  sale,
  shops,
}: {
  sale: Draft;
  shops: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(
    updateExternalSaleDraftAction,
    {} as ExternalSaleDraftState,
  );
  const [sourcePrice, setSourcePrice] = useState(sale.supplierTotal);
  const [sellingPrice, setSellingPrice] = useState(sale.customerTotal);

  if (state.externalSaleId) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-bold text-[var(--text)]">
          Draft changes saved
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The sale is still a draft. Review it before completing.
        </p>
        <Link
          href={`/sales/external/${state.externalSaleId}`}
          className="mt-5 inline-flex rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white"
        >
          Open saved draft
        </Link>
      </section>
    );
  }

  const sourceAmount = Number(sourcePrice);
  const sellingAmount = Number(sellingPrice);
  const validPrices = sourcePrice.trim() !== '' &&
    sellingPrice.trim() !== '' &&
    Number.isFinite(sourceAmount) &&
    Number.isFinite(sellingAmount) &&
    sourceAmount > 0 && sellingAmount > 0;

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6"
    >
      <input type="hidden" name="externalSaleId" value={sale.id} />

      <label className="block text-sm font-semibold text-[var(--text)]">
        Source shop
        <select
          name="supplierId"
          defaultValue={sale.supplierId}
          required
          className={fieldClass}
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-semibold text-[var(--text)]">
        Customer name (optional)
        <input
          name="customerName"
          defaultValue={sale.customerName}
          maxLength={160}
          className={fieldClass}
        />
      </label>

      <label className="block text-sm font-semibold text-[var(--text)]">
        Product
        <input
          name="productName"
          defaultValue={sale.productName}
          maxLength={180}
          required
          className={fieldClass}
        />
      </label>

      <label className="block text-sm font-semibold text-[var(--text)]">
        Quantity
        <input
          name="quantity"
          type="number"
          min={1}
          max={100000}
          step={1}
          defaultValue={sale.quantity}
          required
          className={fieldClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-[var(--text)]">
          Agreed source price (RWF)
          <input
            name="agreedSupplierTotal"
            inputMode="decimal"
            value={sourcePrice}
            onChange={(event) => setSourcePrice(event.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-semibold text-[var(--text)]">
          Customer selling price (RWF)
          <input
            name="customerTotal"
            inputMode="decimal"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            required
            className={fieldClass}
          />
        </label>
      </div>

      <div className="rounded-lg border border-[var(--border)] p-4">
        <p className="text-sm text-[var(--muted)]">
          Expected gross profit
        </p>
        <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text)]">
          {validPrices
            ? `${new Intl.NumberFormat('en-RW', {
                maximumFractionDigits: 2,
              }).format(sellingAmount - sourceAmount)} RWF`
            : '—'}
        </p>
      </div>

      <label className="block text-sm font-semibold text-[var(--text)]">
        Notes (optional)
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={sale.notes}
          className={fieldClass}
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !validPrices}
        className="w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? 'Saving changes...' : 'Save draft changes'}
      </button>

      <Link
        href={`/sales/external/${sale.id}`}
        className="block text-center text-sm font-semibold text-[var(--primary)]"
      >
        Cancel and return to sale
      </Link>
    </form>
  );
}
