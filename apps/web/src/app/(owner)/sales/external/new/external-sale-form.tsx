'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { createExternalSourceShopAction } from '@/lib/external-sales/shop-actions';
import {
  useActionState,
  useState,
} from 'react';

import {
  createExternalSaleDraftAction,
  type ExternalSaleDraftState,
} from '@/lib/external-sales/actions';

type Supplier = {
  id: string;
  name: string;
};

const initialState: ExternalSaleDraftState = {};

const inputClass =
  'mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]';

export function ExternalSaleForm({
  suppliers,
}: {
  suppliers: Supplier[];
}) {
  const [state, formAction, pending] = useActionState(
    createExternalSaleDraftAction,
    initialState,
  );

  const [key] = useState(() => crypto.randomUUID());
  const [supplierTotal, setSupplierTotal] = useState('');
  const [customerTotal, setCustomerTotal] = useState('');
  const [shopList, setShopList] = useState(suppliers);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [addingShop, setAddingShop] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [newShopPhone, setNewShopPhone] = useState('');
  const [shopError, setShopError] = useState('');
  const [savingShop, startShopTransition] = useTransition();

  function saveSourceShop() {
    setShopError('');

    startShopTransition(async () => {
      try {
        const result = await createExternalSourceShopAction({
          name: newShopName,
          phone: newShopPhone,
        });

        if (!result.shop) {
          setShopError(result.error || 'Could not save this shop.');
          return;
        }

        setShopList((current) => {
          if (current.some((shop) => shop.id === result.shop!.id)) {
            return current;
          }

          return [...current, result.shop!].sort(
            (a, b) => a.name.localeCompare(b.name),
          );
        });

        setSelectedShopId(result.shop.id);
        setAddingShop(false);
        setNewShopName('');
        setNewShopPhone('');
      } catch {
        setShopError('Could not save this shop. Check owner access.');
      }
    });
  }

  const supplierAmount = Number(supplierTotal);
  const customerAmount = Number(customerTotal);

  const validAmounts =
    supplierTotal.trim() !== '' &&
    customerTotal.trim() !== '' &&
    Number.isFinite(supplierAmount) &&
    Number.isFinite(customerAmount) &&
    supplierAmount > 0 &&
    customerAmount > 0;

  const profit = validAmounts
    ? customerAmount - supplierAmount
    : null;

  const currency = (amount: number) =>
    new Intl.NumberFormat('en-RW', {
      maximumFractionDigits: 2,
    }).format(amount);

  if (state.externalSaleId) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-bold text-[var(--text)]">
          Sale draft saved
        </h2>

        <p className="mt-2 text-sm text-[var(--muted)]">
          The external sale has been recorded as a draft.
          It has not yet been completed or paid.
        </p>

        <p className="mt-4 break-all text-xs text-[var(--muted)]">
          Reference: {state.externalSaleId}
        </p>

        <Link
          href={`/sales/external/${state.externalSaleId}`}
          className="mt-6 inline-flex rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
        >
          Open saved draft
        </Link>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6"
    >
      <input
        type="hidden"
        name="idempotencyKey"
        value={key}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--text)]">
          Source shop
          <select
            name="supplierId"
            className={inputClass}
            value={selectedShopId}
            onChange={(event) => setSelectedShopId(event.target.value)}
            required
          >
            <option value="" disabled>
              Select source shop
            </option>
            {shopList.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setAddingShop((current) => !current);
              setShopError('');
            }}
            className="mt-3 text-sm font-bold text-[var(--primary)]"
          >
            {addingShop ? 'Cancel adding shop' : '+ Add new shop'}
          </button>
        </label>

        <label className="text-sm font-semibold text-[var(--text)]">
          Customer name
          <input
            name="customerName"
            maxLength={160}
            placeholder="Customer name (optional)"
            className={inputClass}
          />
        </label>

        {addingShop ? (
          <div className="space-y-3 rounded-lg border border-[var(--border)] p-4 sm:col-span-2">
            <h2 className="font-bold text-[var(--text)]">
              Add source shop
            </h2>
            <label className="block text-sm font-semibold text-[var(--text)]">
              Shop name
              <input
                value={newShopName}
                onChange={(event) => setNewShopName(event.target.value)}
                maxLength={160}
                placeholder="Enter shop name"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--text)]">
              Phone number (optional)
              <input
                type="tel"
                value={newShopPhone}
                onChange={(event) => setNewShopPhone(event.target.value)}
                maxLength={40}
                className={inputClass}
              />
            </label>
            {shopError ? (
              <p role="alert" className="text-sm text-red-600">
                {shopError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={saveSourceShop}
              disabled={savingShop || !newShopName.trim()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {savingShop ? 'Saving shop...' : 'Save and select shop'}
            </button>
          </div>
        ) : null}

        <label className="text-sm font-semibold text-[var(--text)] sm:col-span-2">
          Product
          <input
            name="productName"
            maxLength={180}
            required
            placeholder="e.g. HP EliteBook laptop"
            className={inputClass}
          />
        </label>

        <label className="text-sm font-semibold text-[var(--text)]">
          Quantity
          <input
            name="quantity"
            type="number"
            min={1}
            max={100000}
            step={1}
            defaultValue={1}
            required
            className={inputClass}
          />
        </label>

        <div className="hidden sm:block" />

        <label className="text-sm font-semibold text-[var(--text)]">
          Agreed source price (RWF)
          <input
            name="agreedSupplierTotal"
            inputMode="decimal"
            value={supplierTotal}
            onChange={(event) => setSupplierTotal(event.target.value)}
            placeholder="350000"
            required
            className={inputClass}
          />
        </label>

        <label className="text-sm font-semibold text-[var(--text)]">
          Customer selling price (RWF)
          <input
            name="customerTotal"
            inputMode="decimal"
            value={customerTotal}
            onChange={(event) => setCustomerTotal(event.target.value)}
            placeholder="400000"
            required
            className={inputClass}
          />
        </label>

        <label className="text-sm font-semibold text-[var(--text)] sm:col-span-2">
          Notes
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            placeholder="Additional information (optional)"
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--text)]"
          />
        </label>
      </div>

      <div className="rounded-lg border border-[var(--border)] p-4">
        <p className="text-sm text-[var(--muted)]">
          Expected gross profit
        </p>

        <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
          {profit === null
            ? '—'
            : `${currency(profit)} RWF`}
        </p>

        <p className="mt-2 text-xs text-[var(--muted)]">
          Based on agreed source and customer prices.
          Payments are recorded separately.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.error}
        </p>
      ) : null}

      {shopList.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No source shops yet. Use + Add new shop above.
        </p>
      ) : null}

      <Link
        href="/suppliers"
        className="inline-block text-sm font-semibold text-[var(--primary)]"
      >
        Manage suppliers
      </Link>

      <button
        type="submit"
        disabled={pending || savingShop || !key || !selectedShopId}
        className="w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? 'Saving sale...' : 'Save sale draft'}
      </button>

      <p className="text-center text-xs text-[var(--muted)]">
        Saving a draft does not change owned stock or record a payment.
      </p>
    </form>
  );
}
