'use client';

import {
  useState,
} from 'react';

import {
  submitSaleFixAction,
} from '@/lib/sales/fixes';


type UserRole =
  | 'OWNER'
  | 'EMPLOYEE';


type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  status:
    | 'ACTIVE'
    | 'ARCHIVED';
};


type ProductOption = {
  id: string;
  name: string;
  sellingPrice: number;
  quantity: number;
  status:
    | 'ACTIVE'
    | 'ARCHIVED';
};


type InitialRow = {
  sourceItemId: string;
  productId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
};


type EditableRow = {
  key: string;
  sourceItemId:
    | string
    | null;
  productId: string;
  quantity: string;
  unitPrice: string;
};


type SaleFixFormProps = {
  saleId: string;

  userRole:
    UserRole;

  hasPendingRequest:
    boolean;

  customerId:
    string | null;

  customers:
    CustomerOption[];

  products:
    ProductOption[];

  initialRows:
    InitialRow[];

  discountAmount:
    number;

  discountReason:
    string | null;

  notes:
    string | null;

  paidAmount:
    number;
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


function numberValue(
  value: string,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}


type ProductSearchProps = {
  products:
    ProductOption[];

  selectedProductId:
    string;

  onChoose: (
    productId: string,
  ) => void;

  onClear: () => void;
};


function ProductSearch({
  products,
  selectedProductId,
  onChoose,
  onClear,
}: ProductSearchProps) {
  const selectedProduct =
    products.find(
      (product) =>
        product.id ===
        selectedProductId,
    );

  const [
    query,
    setQuery,
  ] = useState(
    selectedProduct?.name ||
      '',
  );

  const [
    open,
    setOpen,
  ] = useState(false);

  const normalizedQuery =
    query
      .trim()
      .toLowerCase();

  const results =
    products
      .filter(
        (product) =>
          product.status ===
            'ACTIVE' ||
          product.id ===
            selectedProductId,
      )
      .filter(
        (product) =>
          !normalizedQuery ||
          product.name
            .toLowerCase()
            .includes(
              normalizedQuery,
            ),
      )
      .slice(0, 8);

  return (
    <div>
      <input
        type="search"
        value={query}
        placeholder="Search product name"
        autoComplete="off"
        onFocus={(
          event,
        ) => {
          event.currentTarget.select();
          setOpen(true);
        }}
        onChange={(
          event,
        ) => {
          const value =
            event.target.value;

          setQuery(
            value,
          );

          setOpen(true);

          if (
            selectedProduct &&
            value !==
              selectedProduct.name
          ) {
            onClear();
          }
        }}
        className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
      />

      {open ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
          {results.length >
          0 ? (
            <div className="max-h-64 overflow-y-auto">
              {results.map(
                (product) => (
                  <button
                    key={
                      product.id
                    }
                    type="button"
                    onClick={() => {
                      setQuery(
                        product.name,
                      );

                      setOpen(
                        false,
                      );

                      onChoose(
                        product.id,
                      );
                    }}
                    className="flex w-full items-center justify-between gap-4 border-b border-[var(--border)] px-3 py-3 text-left last:border-b-0 hover:bg-[var(--surface)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[var(--text)]">
                        {
                          product.name
                        }
                      </span>

                      {product.status !==
                      'ACTIVE' ? (
                        <span className="mt-0.5 block text-[11px] font-bold text-[var(--muted)]">
                          Archived
                        </span>
                      ) : null}
                    </span>

                    <span className="shrink-0 text-xs font-bold text-[var(--muted)]">
                      Available{' '}
                      {
                        product.quantity
                      }
                    </span>
                  </button>
                ),
              )}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm font-bold text-[var(--muted)]">
              No product found.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}


export function SaleFixForm({
  saleId,
  userRole,
  hasPendingRequest,
  customerId:
    initialCustomerId,
  customers,
  products,
  initialRows,
  discountAmount:
    initialDiscountAmount,
  discountReason:
    initialDiscountReason,
  notes:
    initialNotes,
  paidAmount,
}: SaleFixFormProps) {
  const isOwner =
    userRole === 'OWNER';

  const [
    selectedCustomerId,
    setSelectedCustomerId,
  ] = useState(
    initialCustomerId || '',
  );

  const [
    rows,
    setRows,
  ] = useState<
    EditableRow[]
  >(
    initialRows.map(
      (row) => ({
        key:
          row.sourceItemId,

        sourceItemId:
          row.sourceItemId,

        productId:
          row.productId,

        quantity:
          String(
            row.quantity,
          ),

        unitPrice:
          String(
            row.unitPrice,
          ),
      }),
    ),
  );

  const [
    discountAmount,
    setDiscountAmount,
  ] = useState(
    String(
      initialDiscountAmount,
    ),
  );

  const [
    discountReason,
    setDiscountReason,
  ] = useState(
    initialDiscountReason ||
      '',
  );

  const [
    notes,
    setNotes,
  ] = useState(
    initialNotes || '',
  );

  const [
    reason,
    setReason,
  ] = useState('');

  const originalById =
    new Map(
      initialRows.map(
        (row) => [
          row.sourceItemId,
          row,
        ],
      ),
    );

  function updateRow(
    key: string,
    changes:
      Partial<EditableRow>,
  ) {
    setRows(
      (current) =>
        current.map(
          (row) =>
            row.key === key
              ? {
                  ...row,
                  ...changes,
                }
              : row,
        ),
    );
  }

  function selectProduct(
    row: EditableRow,
    productId: string,
  ) {
    const product =
      products.find(
        (current) =>
          current.id ===
          productId,
      );

    const original =
      row.sourceItemId
        ? originalById.get(
            row.sourceItemId,
          )
        : null;

    const unitPrice =
      original &&
      original.productId ===
        productId
        ? original.unitPrice
        : product
          ? product.sellingPrice
          : 0;

    updateRow(
      row.key,
      {
        productId,
        unitPrice:
          unitPrice > 0
            ? String(
                unitPrice,
              )
            : '',
      },
    );
  }

  function addRow() {
    const key =
      `new-${Date.now()}-${rows.length}`;

    setRows(
      (current) => [
        ...current,
        {
          key,
          sourceItemId:
            null,
          productId: '',
          quantity: '1',
          unitPrice: '',
        },
      ],
    );
  }

  function removeRow(
    key: string,
  ) {
    if (
      rows.length <= 1
    ) {
      return;
    }

    setRows(
      (current) =>
        current.filter(
          (row) =>
            row.key !== key,
        ),
    );
  }

  const validRows =
    rows.every(
      (row) =>
        Boolean(
          row.productId,
        ) &&
        Number.isInteger(
          numberValue(
            row.quantity,
          ),
        ) &&
        numberValue(
          row.quantity,
        ) >= 1 &&
        numberValue(
          row.unitPrice,
        ) > 0,
    );

  const subtotal =
    rows.reduce(
      (
        sum,
        row,
      ) =>
        sum +
        (
          numberValue(
            row.quantity,
          ) *
          numberValue(
            row.unitPrice,
          )
        ),
      0,
    );

  const discount =
    Math.max(
      0,
      numberValue(
        discountAmount,
      ),
    );

  const total =
    Math.max(
      0,
      subtotal -
        discount,
    );

  const balance =
    Math.max(
      0,
      total -
        paidAmount,
    );

  const originalCustomerName =
    initialCustomerId
      ? customers.find(
          (customer) =>
            customer.id ===
            initialCustomerId,
        )?.name ||
        'Customer'
      : 'Walk-in customer';

  const correctedCustomerName =
    selectedCustomerId
      ? customers.find(
          (customer) =>
            customer.id ===
            selectedCustomerId,
        )?.name ||
        'Customer'
      : 'Walk-in customer';

  const originalSubtotal =
    initialRows.reduce(
      (sum, row) =>
        sum +
        row.quantity *
          row.unitPrice,
      0,
    );

  const originalTotal =
    Math.max(
      0,
      originalSubtotal -
        Math.max(
          0,
          initialDiscountAmount,
        ),
    );

  const totalBelowPaid =
    total <
    paidAmount;

  const discountWrong =
    discount >
    subtotal;

  const discountNeedsReason =
    discount > 0 &&
    !discountReason.trim();

  const customerNeeded =
    balance > 0 &&
    !selectedCustomerId;

  const canSubmit =
    !hasPendingRequest &&
    rows.length > 0 &&
    validRows &&
    !discountWrong &&
    !discountNeedsReason &&
    !totalBelowPaid &&
    !customerNeeded &&
    Boolean(
      reason.trim(),
    );

  const itemsJson =
    JSON.stringify(
      rows.map(
        (row) => ({
          sourceItemId:
            row.sourceItemId,

          productId:
            row.productId,

          quantity:
            numberValue(
              row.quantity,
            ),

          unitPrice:
            numberValue(
              row.unitPrice,
            ),
        }),
      ),
    );

  return (
    <form
      action={
        submitSaleFixAction
      }
      className="space-y-4"
    >
      <input
        type="hidden"
        name="saleId"
        value={saleId}
      />

      <input
        type="hidden"
        name="itemsJson"
        value={
          itemsJson
        }
      />

      {hasPendingRequest ? (
        <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          {isOwner
            ? 'A request for this sale is already waiting. Review it from Requests first.'
            : 'Your request for this sale is already waiting for the owner.'}
        </div>
      ) : null}

      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-5 sm:px-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
          Sale correction
        </p>

        <h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[var(--text)]">
          {isOwner
            ? 'Fix mistake'
            : 'Request a correction'}
        </h2>

        <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[var(--muted)]">
          Compare the recorded sale with the correction before saving.
          Payment is not changed here.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Correction review
          </p>

          <h3 className="mt-1 text-lg font-black text-[var(--text)]">
            Recorded and corrected sale
          </h3>
        </div>

        <div className="grid lg:grid-cols-2">
          <div className="px-5 py-5 sm:px-6">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Recorded
            </p>

            <div className="mt-4 space-y-4">
              <div className="flex items-start justify-between gap-5">
                <span className="text-sm font-semibold text-[var(--muted)]">
                  Customer
                </span>

                <strong className="text-right text-sm font-black text-[var(--text)]">
                  {originalCustomerName}
                </strong>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-xs font-black text-[var(--muted)]">
                  Items
                </p>

                <div className="mt-2 space-y-2">
                  {initialRows.map(
                    (row) => (
                      <div
                        key={row.sourceItemId}
                        className="flex items-start justify-between gap-5 text-sm"
                      >
                        <span className="min-w-0 font-semibold text-[var(--text)]">
                          {row.itemName}{' '}
                          ×{row.quantity}
                          <span className="ml-2 text-xs font-semibold text-[var(--muted)]">
                            @ {money(
                              row.unitPrice,
                            )}
                          </span>
                        </span>

                        <strong className="shrink-0 tabular-nums text-[var(--text)]">
                          {money(
                            row.quantity *
                              row.unitPrice,
                          )}
                        </strong>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Total
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    originalTotal,
                  )}
                </strong>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-5 py-5 sm:px-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">
              Corrected
            </p>

            <div className="mt-4 space-y-4">
              <div className="flex items-start justify-between gap-5">
                <span className="text-sm font-semibold text-[var(--muted)]">
                  Customer
                </span>

                <strong className="text-right text-sm font-black text-[var(--text)]">
                  {correctedCustomerName}
                </strong>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-xs font-black text-[var(--muted)]">
                  Items
                </p>

                <div className="mt-2 space-y-2">
                  {rows.map(
                    (row) => {
                      const product =
                        products.find(
                          (current) =>
                            current.id ===
                            row.productId,
                        );

                      const quantity =
                        numberValue(
                          row.quantity,
                        );

                      const unitPrice =
                        numberValue(
                          row.unitPrice,
                        );

                      return (
                        <div
                          key={row.key}
                          className="flex items-start justify-between gap-5 text-sm"
                        >
                          <span className="min-w-0 font-semibold text-[var(--text)]">
                            {product?.name ||
                              'Choose a product'}{' '}
                            ×{quantity}
                            <span className="ml-2 text-xs font-semibold text-[var(--muted)]">
                              @ {money(
                                unitPrice,
                              )}
                            </span>
                          </span>

                          <strong className="shrink-0 tabular-nums text-[var(--text)]">
                            {money(
                              quantity *
                                unitPrice,
                            )}
                          </strong>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Total
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    total,
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Correction
          </p>

          <h3 className="mt-1 text-lg font-black text-[var(--text)]">
            Make the correction
          </h3>

          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            {isOwner
              ? 'Change only what was recorded incorrectly.'
              : 'Change what was recorded incorrectly. The owner will review your request.'}
          </p>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div>
            <label
              htmlFor="customerId"
              className="text-sm font-black text-[var(--text)]"
            >
              Customer
            </label>

            <select
              id="customerId"
              name="customerId"
              value={
                selectedCustomerId
              }
              onChange={(
                event,
              ) =>
                setSelectedCustomerId(
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
            >
              <option value="">
                Walk-in customer
              </option>

              {customers.map(
                (customer) => (
                  <option
                    key={
                      customer.id
                    }
                    value={
                      customer.id
                    }
                    disabled={
                      customer.status !==
                        'ACTIVE' &&
                      customer.id !==
                        selectedCustomerId
                    }
                  >
                    {customer.name}
                    {customer.phone
                      ? ` / ${customer.phone}`
                      : ''}
                    {customer.status !==
                    'ACTIVE'
                      ? ' / Archived'
                      : ''}
                  </option>
                ),
              )}
            </select>

            {customerNeeded ? (
              <p className="mt-2 text-xs font-black text-[var(--danger)]">
                Choose the customer because the corrected sale would still have unpaid money.
              </p>
            ) : null}
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-[var(--text)]">
                  Items
                </p>

                <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                  Change the product, quantity or selling price that was entered wrongly.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  addRow
                }
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] hover:border-[var(--primary)]"
              >
                Add item
              </button>
            </div>

            <div className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {rows.map(
                (
                  row,
                  index,
                ) => {
                  const selected =
                    products.find(
                      (
                        product,
                      ) =>
                        product.id ===
                        row.productId,
                    );

                  const originalQuantityForProduct =
                    selected
                      ? initialRows
                          .filter(
                            (original) =>
                              original.productId ===
                              selected.id,
                          )
                          .reduce(
                            (sum, original) =>
                              sum +
                              original.quantity,
                            0,
                          )
                      : 0;

                  const availableForCorrection =
                    selected
                      ? selected.quantity +
                        originalQuantityForProduct
                      : 0;

                  const lineTotal =
                    numberValue(
                      row.quantity,
                    ) *
                    numberValue(
                      row.unitPrice,
                    );

                  return (
                    <div
                      key={
                        row.key
                      }
                      className="py-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_170px_auto] lg:items-end">
                        <div>
                          <label className="text-xs font-black text-[var(--muted)]">
                            Search product
                          </label>

                          <div className="mt-2">
                            <ProductSearch
                              products={
                                products
                              }
                              selectedProductId={
                                row.productId
                              }
                              onChoose={(
                                productId,
                              ) =>
                                selectProduct(
                                  row,
                                  productId,
                                )
                              }
                              onClear={() =>
                                updateRow(
                                  row.key,
                                  {
                                    productId:
                                      '',
                                  },
                                )
                              }
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-black text-[var(--muted)]">
                            Quantity
                          </label>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              row.quantity
                            }
                            onChange={(
                              event,
                            ) =>
                              updateRow(
                                row.key,
                                {
                                  quantity:
                                    event
                                      .target
                                      .value,
                                },
                              )
                            }
                            className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-black text-[var(--muted)]">
                            Selling price
                          </label>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              row.unitPrice
                            }
                            onChange={(
                              event,
                            ) =>
                              updateRow(
                                row.key,
                                {
                                  unitPrice:
                                    event
                                      .target
                                      .value,
                                },
                              )
                            }
                            className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
                          />

                          {selected ? (
                            <p className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                              Available for this correction{' '}
                              {
                                availableForCorrection
                              }
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeRow(
                              row.key,
                            )
                          }
                          disabled={
                            rows.length ===
                            1
                          }
                          className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-xs font-black text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>

                      <p className="mt-2 text-right text-xs font-black text-[var(--text)]">
                        Item{' '}
                        {index + 1}{' '}
                        /{' '}
                        {money(
                          lineTotal,
                        )}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="discountAmount"
                className="text-sm font-black text-[var(--text)]"
              >
                Discount
              </label>

              <input
                id="discountAmount"
                name="discountAmount"
                type="number"
                min="0"
                step="1"
                value={
                  discountAmount
                }
                onChange={(
                  event,
                ) =>
                  setDiscountAmount(
                    event.target
                      .value,
                  )
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />

              {discountWrong ? (
                <p className="mt-2 text-xs font-black text-[var(--danger)]">
                  Discount cannot be more than the sale subtotal.
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="discountReason"
                className="text-sm font-black text-[var(--text)]"
              >
                Discount reason
              </label>

              <input
                id="discountReason"
                name="discountReason"
                value={
                  discountReason
                }
                onChange={(
                  event,
                ) =>
                  setDiscountReason(
                    event.target
                      .value,
                  )
                }
                placeholder={
                  discount > 0
                    ? 'Why was the discount given?'
                    : 'Not needed when there is no discount'
                }
                className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              />

              {discountNeedsReason ? (
                <p className="mt-2 text-xs font-black text-[var(--danger)]">
                  Enter why the discount was given.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="text-sm font-black text-[var(--text)]"
            >
              Sale notes{' '}
              <span className="font-bold text-[var(--muted)]">
                (optional)
              </span>
            </label>

            <textarea
              id="notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(
                event,
              ) =>
                setNotes(
                  event.target
                    .value,
                )
              }
              className="mt-2 min-h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="text-sm font-black text-[var(--text)]"
            >
              {isOwner
                ? 'Why are you fixing this sale?'
                : 'What was entered wrong?'}
            </label>

            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              value={reason}
              onChange={(
                event,
              ) =>
                setReason(
                  event.target
                    .value,
                )
              }
              placeholder="Example: Quantity was entered as 2 instead of 1"
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-xs font-bold text-[var(--muted)]">
              Corrected sale total
            </p>

            <p className="mt-1 font-black text-[var(--text)]">
              {money(
                total,
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-[var(--muted)]">
              Money already paid
            </p>

            <p className="mt-1 font-black text-[var(--text)]">
              {money(
                paidAmount,
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-[var(--muted)]">
              Still unpaid after fix
            </p>

            <p className="mt-1 font-black text-[var(--text)]">
              {money(
                balance,
              )}
            </p>
          </div>
        </div>

        {totalBelowPaid ? (
          <div className="border-t border-[var(--border)] px-5 py-3 text-sm font-bold text-[var(--danger)] sm:px-6">
            The corrected total is below money already paid. Payment/refund must be fixed separately.
          </div>
        ) : null}

        <div className="grid gap-2 border-t border-[var(--border)] px-5 py-4 sm:grid-cols-[1fr_auto] sm:px-6">
          <a
            href={`/sales/${saleId}`}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)]"
          >
            Back
          </a>

          <button
            type="submit"
            disabled={
              !canSubmit
            }
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-6 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:opacity-100"
          >
            {hasPendingRequest
              ? isOwner
                ? 'Review request first'
                : 'Request sent'
              : isOwner
                ? 'Save correction'
                : 'Send request'}
          </button>
        </div>
      </section>
    </form>
  );
}
