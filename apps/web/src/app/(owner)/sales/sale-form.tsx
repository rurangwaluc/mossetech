'use client';

import Image from 'next/image';
import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  type FormEvent,
  useActionState,
  useMemo,
  useState,
} from 'react';
import {
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createSaleAction,
} from '@/lib/sales/actions';

import {
  enqueueOfflineOperation,
  getOfflineOperation,
  removeOfflineOperation,
} from '@/lib/offline/outbox';

import {
  runOutboxSync,
} from '@/lib/offline/sync';

type SellableItem = {
  id: string;
  name: string;
  category: string;
  sellingPrice: string;
  quantity: number;
  unit: string;
  imageKey: string | null;
};

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type SaleRow = {
  productId: string;
  quantity: number;
  unitPrice: string;
  searchText: string;
};

type CustomerMode =
  | 'WALK_IN'
  | 'EXISTING'
  | 'NEW';

type PaymentMethod =
  | 'CASH'
  | 'MOBILE_MONEY'
  | 'BANK'
  | 'CARD';

type SaleFormProps = {
  userId: string;

  cashDrawerId:
    | string
    | null;

  items: SellableItem[];
  customers: CustomerOption[];
  hasOpenDrawer: boolean;
  canGiveDiscount: boolean;
};

const fieldClass =
  'h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]';

const paymentMethods: Array<{
  value: PaymentMethod;
  label: string;
}> = [
  {
    value: 'CASH',
    label: 'Cash',
  },
  {
    value: 'MOBILE_MONEY',
    label: 'Mobile money',
  },
  {
    value: 'BANK',
    label: 'Bank',
  },
  {
    value: 'CARD',
    label: 'Card',
  },
];

function numberValue(
  value: string,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

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

function itemDetails(
  item: SellableItem,
) {
  return [
    item.category,
    item.unit,
  ]
    .filter(Boolean)
    .join(' / ');
}

function quantityLabel(
  quantity: number,
  unit: string,
) {
  if (quantity === 1) {
    return `1 ${unit}`;
  }

  return `${quantity} ${unit}s`;
}

function itemPrice(
  item: SellableItem,
) {
  return Number(
    item.sellingPrice || 0,
  );
}

function itemSearchLabel(
  item: SellableItem,
) {
  return item.name;
}

function customerLabel(
  customer: CustomerOption,
) {
  return customer.phone
    ? `${customer.name} / ${customer.phone}`
    : customer.name;
}

function paymentName(
  value: PaymentMethod,
) {
  return (
    paymentMethods.find(
      (item) =>
        item.value === value,
    )?.label || value
  );
}

function roundedMoney(
  value: number,
) {
  return Math.round(
    value * 100,
  );
}

export function SaleForm({
  userId,
  cashDrawerId,
  items,
  customers,
  hasOpenDrawer,
  canGiveDiscount,
}: SaleFormProps) {
  const [
    state,
    action,
    pending,
  ] = useActionState(
    createSaleAction,
    {},
  );

  const router =
    useRouter();

  const [
    savingLocally,
    setSavingLocally,
  ] = useState(false);

  const [
    queuedLocally,
    setQueuedLocally,
  ] = useState(false);

  const [
    clientError,
    setClientError,
  ] =
    useState<
      string | null
    >(null);

  const [
    customerMode,
    setCustomerMode,
  ] =
    useState<CustomerMode>(
      'WALK_IN',
    );

  const [
    customerId,
    setCustomerId,
  ] = useState('');

  const [
    customerSearch,
    setCustomerSearch,
  ] = useState('');

  const [
    isCustomerSearchOpen,
    setIsCustomerSearchOpen,
  ] = useState(false);

  const [
    openRowIndex,
    setOpenRowIndex,
  ] =
    useState<number | null>(
      null,
    );

  const [
    rows,
    setRows,
  ] = useState<SaleRow[]>([
    {
      productId: '',
      quantity: 1,
      unitPrice: '',
      searchText: '',
    },
  ]);

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PaymentMethod>(
      'CASH',
    );

  const [
    amountReceived,
    setAmountReceived,
  ] = useState('');

  const [
    changeReturned,
    setChangeReturned,
  ] = useState('0');

  const [
    extraKept,
    setExtraKept,
  ] = useState('0');

  const [
    extraReason,
    setExtraReason,
  ] = useState('');

  const [
    discountOpen,
    setDiscountOpen,
  ] = useState(false);

  const [
    discountAmount,
    setDiscountAmount,
  ] = useState('');

  const [
    discountReason,
    setDiscountReason,
  ] = useState('');

  const selectedRows =
    rows
      .filter(
        (row) =>
          Boolean(
            row.productId,
          ),
      )
      .map((row) => ({
        productId:
          row.productId,
        quantity:
          row.quantity,
        unitPrice:
          row.unitPrice,
      }));

  const subtotal = useMemo(
    () =>
      rows.reduce(
        (sum, row) => {
          const item =
            items.find(
              (current) =>
                current.id ===
                row.productId,
            );

          if (!item) {
            return sum;
          }

          const sellingPrice =
            numberValue(
              row.unitPrice,
            ) ||
            itemPrice(
              item,
            );

          return (
            sum +
            sellingPrice *
              row.quantity
          );
        },
        0,
      ),
    [
      items,
      rows,
    ],
  );

  const priceBelowNormal =
    rows.some((row) => {
      const item =
        items.find(
          (current) =>
            current.id ===
            row.productId,
        );

      if (!item) {
        return false;
      }

      const enteredPrice =
        numberValue(
          row.unitPrice,
        );

      return (
        enteredPrice > 0 &&
        roundedMoney(
          enteredPrice,
        ) <
          roundedMoney(
            itemPrice(
              item,
            ),
          )
      );
    });

  const discount =
    canGiveDiscount
      ? numberValue(
          discountAmount,
        )
      : 0;

  const discountTooLarge =
    roundedMoney(discount) >
    roundedMoney(subtotal);

  const discountNeedsReason =
    discount > 0 &&
    !discountReason.trim();

  const total = Math.max(
    subtotal - discount,
    0,
  );

  const received =
    numberValue(
      amountReceived,
    );

  const change =
    numberValue(
      changeReturned,
    );

  const extra =
    numberValue(
      extraKept,
    );

  const paidBeforeCap =
    Math.max(
      received -
        change -
        extra,
      0,
    );

  /*
   * A sale can never have more money applied to it
   * than the amount actually owed.
   *
   * Any amount above the sale total is handled
   * separately as refunded and/or extra kept.
   */
  const paid =
    Math.min(
      paidBeforeCap,
      total,
    );

  const balance = Math.max(
    total - paid,
    0,
  );

  const extraAvailable =
    Math.max(
      received - total,
      0,
    );

  const allocatedExtra =
    change + extra;

  const extraAllocationWrong =
    extraAvailable > 0 &&
    roundedMoney(
      allocatedExtra,
    ) !==
      roundedMoney(
        extraAvailable,
      );

  const extraNeedsReason =
    extra > 0 &&
    !extraReason.trim();

  const hasPaymentEntry =
    amountReceived.trim() !== '';

  const creditNeedsCustomer =
    hasPaymentEntry &&
    balance > 0 &&
    customerMode ===
      'WALK_IN';

  const cashDrawerBlocked =
    paymentMethod === 'CASH' &&
    received > 0 &&
    !hasOpenDrawer;

  const canSave =
    selectedRows.length > 0 &&
    total > 0 &&
    !discountTooLarge &&
    !discountNeedsReason &&
    !priceBelowNormal &&
    hasPaymentEntry &&
    received >= 0 &&
    !cashDrawerBlocked &&
    !extraAllocationWrong &&
    !extraNeedsReason &&
    !creditNeedsCustomer &&
    !pending &&
    !savingLocally &&
    !queuedLocally;

  const filteredCustomers =
    useMemo(() => {
      const search =
        customerSearch
          .trim()
          .toLowerCase();

      if (!search) {
        return customers.slice(
          0,
          8,
        );
      }

      return customers
        .filter((customer) =>
          `${customer.name} ${customer.phone || ''}`
            .toLowerCase()
            .includes(search),
        )
        .slice(0, 8);
    }, [
      customerSearch,
      customers,
    ]);

  function clearDiscount() {
    setDiscountOpen(false);
    setDiscountAmount('');
    setDiscountReason('');
  }

  function updateRow(
    index: number,
    next: SaleRow,
  ) {
    const nextRows =
      rows.map(
        (row, rowIndex) =>
          rowIndex === index
            ? next
            : row,
      );

    setRows(nextRows);

    if (
      !nextRows.some(
        (row) =>
          Boolean(
            row.productId,
          ),
      )
    ) {
      clearDiscount();
    }
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        productId: '',
        quantity: 1,
        unitPrice: '',
        searchText: '',
      },
    ]);
  }

  function removeRow(
    index: number,
  ) {
    const nextRows =
      rows.length === 1
        ? [
            {
              productId: '',
              quantity: 1,
              unitPrice: '',
              searchText: '',
            },
          ]
        : rows.filter(
            (
              _row,
              rowIndex,
            ) =>
              rowIndex !==
              index,
          );

    setRows(nextRows);

    if (
      !nextRows.some(
        (row) =>
          Boolean(
            row.productId,
          ),
      )
    ) {
      clearDiscount();
    }

    setOpenRowIndex(null);
  }

  function matchingItems(
    searchText: string,
    rowIndex: number,
  ) {
    const search =
      searchText
        .trim()
        .toLowerCase();

    const usedIds =
      new Set(
        rows
          .filter(
            (
              row,
              index,
            ) =>
              index !==
                rowIndex &&
              row.productId,
          )
          .map(
            (row) =>
              row.productId,
          ),
      );

    return items
      .filter(
        (item) =>
          !usedIds.has(
            item.id,
          ),
      )
      .filter((item) => {
        if (!search) {
          return true;
        }

        return `${item.name} ${item.category} ${item.unit}`
          .toLowerCase()
          .includes(search);
      })
      .slice(0, 8);
  }

  function selectPaymentMethod(
    next: PaymentMethod,
  ) {
    setPaymentMethod(next);

    /*
     * Never carry cash values into another
     * payment method.
     */
    setAmountReceived('');
    setChangeReturned('0');
    setExtraKept('0');
    setExtraReason('');
  }

  function changeAmountReceived(
    value: string,
  ) {
    setAmountReceived(value);

    if (
      numberValue(value) <=
        total
    ) {
      setChangeReturned('0');
      setExtraKept('0');
      setExtraReason('');
    }
  }

  async function saveSaleLocally(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setSavingLocally(
      true,
    );

    setQueuedLocally(
      false,
    );

    setClientError(
      null,
    );

    const formData =
      new FormData(
        event.currentTarget,
      );

    let saleItems:
      unknown;

    try {
      saleItems =
        JSON.parse(
          String(
            formData.get(
              'itemsJson',
            ) || '[]',
          ),
        );
    } catch {
      setSavingLocally(
        false,
      );

      setClientError(
        'Check the selected products.',
      );

      return;
    }

    const value = (
      field: string,
      fallback = '',
    ) =>
      String(
        formData.get(
          field,
        ) ??
          fallback,
      );

    const operationId =
      crypto.randomUUID();

    try {
      await enqueueOfflineOperation({
        operationId,

        userId,

        kind:
          'SALE_CREATE',

        payload: {
          customerMode:
            value(
              'customerMode',
            ),

          customerId:
            value(
              'customerId',
            ),

          newCustomerName:
            value(
              'newCustomerName',
            ),

          newCustomerPhone:
            value(
              'newCustomerPhone',
            ),

          paymentMethod:
            value(
              'paymentMethod',
            ),

          discountAmount:
            value(
              'discountAmount',
              '0',
            ) || '0',

          discountReason:
            value(
              'discountReason',
            ),

          amountReceived:
            value(
              'amountReceived',
              '0',
            ) || '0',

          changeReturned:
            value(
              'changeReturned',
              '0',
            ) || '0',

          extraKept:
            value(
              'extraKept',
              '0',
            ) || '0',

          extraReason:
            value(
              'extraReason',
            ),

          notes:
            value(
              'notes',
            ),

          items:
            saleItems,

          cashDrawerId,
        },
      });

      /*
       * Offline means the local write itself is the success.
       * The global sync manager will send it later.
       */
      if (
        !navigator.onLine
      ) {
        setQueuedLocally(
          true,
        );

        setSavingLocally(
          false,
        );

        return;
      }

      /*
       * Online: try to commit immediately, but only navigate
       * after this specific operation is confirmed completed.
       */
      await runOutboxSync(
        userId,
      );

      let operation =
        await getOfflineOperation(
          operationId,
        );

      /*
       * Another global sync may already have been running
       * when this sale entered the queue. Give this operation
       * one immediate second pass after that sync finishes.
       */
      if (
        operation?.status ===
          'pending' &&
        navigator.onLine
      ) {
        await runOutboxSync(
          userId,
        );

        operation =
          await getOfflineOperation(
            operationId,
          );
      }

      if (
        operation?.status ===
        'completed'
      ) {
        router.replace(
          '/sales?saved=1',
        );

        router.refresh();

        return;
      }

      if (
        operation?.status ===
          'failed' &&
        operation
          .nextAttemptAt ===
          null
      ) {
        /*
         * The server definitively rejected this sale for a
         * business reason such as stale stock. Keep the form
         * open so the user can correct it, and remove this
         * rejected local attempt instead of leaving a dead
         * operation in the outbox.
         */
        const message =
          operation
            .lastError ||
          'Sale could not be saved.';

        await removeOfflineOperation(
          operationId,
        );

        setClientError(
          message,
        );

        setSavingLocally(
          false,
        );

        return;
      }

      /*
       * A network/server interruption is retryable. The sale
       * remains safely stored on this device.
       */
      setQueuedLocally(
        true,
      );

      setSavingLocally(
        false,
      );
    } catch (error) {
      setSavingLocally(
        false,
      );

      setClientError(
        error instanceof Error
          ? error.message
          : 'Sale could not be saved on this device.',
      );
    }
  }

  function submitText() {
    if (
      pending ||
      savingLocally
    ) {
      return 'Saving sale...';
    }

    if (queuedLocally) {
      return 'Saved on this device';
    }

    if (
      selectedRows.length ===
        0 ||
      total <= 0
    ) {
      return 'Add an item first';
    }

    if (cashDrawerBlocked) {
      return 'Open cash drawer first';
    }

    if (
      creditNeedsCustomer
    ) {
      return 'Choose customer first';
    }

    if (
      priceBelowNormal
    ) {
      return 'Use discount for lower price';
    }

    if (
      extraAllocationWrong
    ) {
      return 'Account for extra payment';
    }

    if (
      extraNeedsReason
    ) {
      return 'Add reason for extra payment';
    }

    return 'Save sale';
  }

  return (
    <form
      action={action}
      onSubmit={
        saveSaleLocally
      }
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <input
        type="hidden"
        name="itemsJson"
        value={JSON.stringify(
          selectedRows,
        )}
      />

      <input
        type="hidden"
        name="customerMode"
        value={customerMode}
      />

      <input
        type="hidden"
        name="customerId"
        value={customerId}
      />

      <input
        type="hidden"
        name="paymentMethod"
        value={paymentMethod}
      />

      <div className="space-y-4">
        {/* CUSTOMER */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Customer
            </p>

            <h3 className="mt-1 text-lg font-black text-[var(--text)]">
              Who is buying?
            </h3>
          </div>

          <div className="px-5 py-4 sm:px-6">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  value:
                    'WALK_IN',
                  label:
                    'Walk-in',
                },
                {
                  value:
                    'EXISTING',
                  label:
                    'Existing customer',
                },
                {
                  value: 'NEW',
                  label:
                    'New customer',
                },
              ].map(
                (option) => {
                  const active =
                    customerMode ===
                    option.value;

                  return (
                    <button
                      key={
                        option.value
                      }
                      type="button"
                      onClick={() => {
                        setCustomerMode(
                          option.value as CustomerMode,
                        );

                        if (
                          option.value !==
                          'EXISTING'
                        ) {
                          setCustomerId(
                            '',
                          );
                          setCustomerSearch(
                            '',
                          );
                          setIsCustomerSearchOpen(
                            false,
                          );
                        }
                      }}
                      className={
                        active
                          ? 'h-10 rounded-lg bg-[var(--primary)] px-4 text-sm font-black text-white'
                          : 'h-10 rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]'
                      }
                    >
                      {
                        option.label
                      }
                    </button>
                  );
                },
              )}
            </div>

            {customerMode ===
            'EXISTING' ? (
              <div className="relative mt-4">
                <label className="text-sm font-black text-[var(--text)]">
                  Customer
                </label>

                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

                  <input
                    value={
                      customerSearch
                    }
                    onFocus={() =>
                      setIsCustomerSearchOpen(
                        true,
                      )
                    }
                    onChange={(
                      event,
                    ) => {
                      setCustomerId(
                        '',
                      );
                      setCustomerSearch(
                        event
                          .target
                          .value,
                      );
                      setIsCustomerSearchOpen(
                        true,
                      );
                    }}
                    placeholder="Search name or phone"
                    className={`${fieldClass} pl-10`}
                  />
                </div>

                {isCustomerSearchOpen ? (
                  <div className="absolute left-0 right-0 top-[72px] z-30 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
                    {filteredCustomers.length >
                    0 ? (
                      filteredCustomers.map(
                        (
                          customer,
                        ) => (
                          <button
                            key={
                              customer.id
                            }
                            type="button"
                            onClick={() => {
                              setCustomerId(
                                customer.id,
                              );
                              setCustomerSearch(
                                customerLabel(
                                  customer,
                                ),
                              );
                              setIsCustomerSearchOpen(
                                false,
                              );
                            }}
                            className="block w-full border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface)]"
                          >
                            <span className="block text-sm font-black text-[var(--text)]">
                              {
                                customer.name
                              }
                            </span>

                            <span className="mt-1 block text-xs font-bold text-[var(--muted)]">
                              {customer.phone ||
                                'No phone'}
                            </span>
                          </button>
                        ),
                      )
                    ) : (
                      <div className="px-4 py-4 text-sm font-bold text-[var(--muted)]">
                        No customer found.
                      </div>
                    )}
                  </div>
                ) : null}

                {customerId ? (
                  <p className="mt-2 text-xs font-black text-[var(--success)]">
                    Customer selected
                  </p>
                ) : null}
              </div>
            ) : null}

            {customerMode ===
            'NEW' ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="newCustomerName"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Customer name
                  </label>

                  <input
                    id="newCustomerName"
                    name="newCustomerName"
                    required
                    placeholder="Customer name"
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="newCustomerPhone"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Phone
                  </label>

                  <input
                    id="newCustomerPhone"
                    name="newCustomerPhone"
                    placeholder="Optional"
                    className={`${fieldClass} mt-2`}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ITEMS */}
        <section className="relative z-20 overflow-visible rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Items
              </p>

              <h3 className="mt-1 text-lg font-black text-[var(--text)]">
                What was sold?
              </h3>
            </div>

            <button
              type="button"
              onClick={addRow}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {rows.map(
              (
                row,
                index,
              ) => {
                const selected =
                  items.find(
                    (item) =>
                      item.id ===
                      row.productId,
                  );

                const matches =
                  matchingItems(
                    row.searchText,
                    index,
                  );

                const normalPrice =
                  selected
                    ? itemPrice(
                        selected,
                      )
                    : 0;

                const price =
                  selected
                    ? (
                        numberValue(
                          row.unitPrice,
                        ) ||
                        normalPrice
                      )
                    : 0;

                const priceRaised =
                  selected &&
                  roundedMoney(
                    price,
                  ) >
                    roundedMoney(
                      normalPrice,
                    );

                const priceLowered =
                  selected &&
                  price > 0 &&
                  roundedMoney(
                    price,
                  ) <
                    roundedMoney(
                      normalPrice,
                    );

                return (
                  <div
                    key={index}
                    className="px-5 py-4 sm:px-6"
                  >
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_100px_135px_135px_42px]">
                      <div className="relative">
                        <label className="text-xs font-black text-[var(--muted)]">
                          Product
                        </label>

                        <div className="relative mt-2">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />

                          <input
                            value={
                              row.searchText
                            }
                            onFocus={() =>
                              setOpenRowIndex(
                                index,
                              )
                            }
                            onChange={(
                              event,
                            ) => {
                              updateRow(
                                index,
                                {
                                  ...row,
                                  productId:
                                    '',
                                  unitPrice:
                                    '',
                                  searchText:
                                    event
                                      .target
                                      .value,
                                },
                              );

                              setOpenRowIndex(
                                index,
                              );
                            }}
                            placeholder="Search product"
                            className={`${fieldClass} pl-10`}
                          />
                        </div>

                        {openRowIndex ===
                        index ? (
                          <div className="absolute left-0 right-0 top-[70px] z-50 max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
                            {matches.length >
                            0 ? (
                              matches.map(
                                (
                                  item,
                                ) => (
                                  <button
                                    key={
                                      item.id
                                    }
                                    type="button"
                                    onClick={() => {
                                      updateRow(
                                        index,
                                        {
                                          ...row,
                                          productId:
                                            item.id,
                                          quantity:
                                            1,
                                          unitPrice:
                                            item.sellingPrice,
                                          searchText:
                                            itemSearchLabel(
                                              item,
                                            ),
                                        },
                                      );

                                      setOpenRowIndex(
                                        null,
                                      );
                                    }}
                                    className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface)]"
                                  >
                                    {item.imageKey ? (
                                      <Image
                                        src={`/api/media/product-image/${item.id}`}
                                        alt=""
                                        width={44}
                                        height={44}
                                        unoptimized
                                        className="h-11 w-11 rounded-md border border-[var(--border)] object-cover"
                                      />
                                    ) : (
                                      <span className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-center text-[9px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                                        No image
                                      </span>
                                    )}

                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-black text-[var(--text)]">
                                        {
                                          item.name
                                        }
                                      </span>

                                      <span className="mt-1 block truncate text-xs font-bold text-[var(--muted)]">
                                        {itemDetails(
                                          item,
                                        )}
                                      </span>

                                      <span className="mt-0.5 block text-xs font-bold text-[var(--muted)]">
                                        {quantityLabel(
                                          item.quantity,
                                          item.unit,
                                        )}{' '}
                                        available
                                      </span>
                                    </span>

                                    <span className="shrink-0 text-right">
                                      <span className="block text-sm font-black tabular-nums text-[var(--text)]">
                                        {money(
                                          itemPrice(
                                            item,
                                          ),
                                        )}
                                      </span>

                                      <span className="mt-0.5 block text-[10px] font-bold text-[var(--muted)]">
                                        per{' '}
                                        {
                                          item.unit
                                        }
                                      </span>
                                    </span>
                                  </button>
                                ),
                              )
                            ) : (
                              <div className="px-4 py-4 text-sm font-bold text-[var(--muted)]">
                                No product found.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs font-black text-[var(--muted)]">
                          Qty
                        </label>

                        <input
                          type="number"
                          min="1"
                          max={
                            selected?.quantity
                          }
                          value={
                            row.quantity
                          }
                          onChange={(
                            event,
                          ) => {
                            const entered =
                              Math.max(
                                1,
                                Number(
                                  event
                                    .target
                                    .value ||
                                    1,
                                ),
                              );

                            const quantity =
                              selected
                                ? Math.min(
                                    entered,
                                    selected.quantity,
                                  )
                                : entered;

                            updateRow(
                              index,
                              {
                                ...row,
                                quantity,
                              },
                            );
                          }}
                          className={`${fieldClass} mt-2`}
                        />

                        {selected ? (
                          <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                            {quantityLabel(
                              selected.quantity,
                              selected.unit,
                            )}{' '}
                            available
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs font-black text-[var(--muted)]">
                          Selling price
                        </label>

                        <input
                          inputMode="decimal"
                          value={
                            row.unitPrice
                          }
                          disabled={!selected}
                          onChange={(
                            event,
                          ) =>
                            updateRow(
                              index,
                              {
                                ...row,
                                unitPrice:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          className={`${fieldClass} mt-2`}
                        />

                        {priceRaised ? (
                          <p className="mt-1 text-xs font-bold text-[var(--primary)]">
                            Normal{' '}
                            {money(
                              normalPrice,
                            )}
                          </p>
                        ) : null}

                        {priceLowered ? (
                          <p className="mt-1 text-xs font-black text-[var(--danger)]">
                            Use Add discount for a lower price.
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs font-black text-[var(--muted)]">
                          Total
                        </label>

                        <div className="mt-2 flex h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black text-[var(--text)]">
                          {money(
                            price *
                              row.quantity,
                          )}
                        </div>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() =>
                            removeRow(
                              index,
                            )
                          }
                          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </section>

        {/* PAYMENT */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              Payment
            </p>

            <h3 className="mt-1 text-lg font-black text-[var(--text)]">
              How did the customer pay?
            </h3>
          </div>

          <div className="space-y-5 px-5 py-4 sm:px-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {paymentMethods.map(
                (method) => {
                  const active =
                    method.value ===
                    paymentMethod;

                  return (
                    <button
                      key={
                        method.value
                      }
                      type="button"
                      onClick={() =>
                        selectPaymentMethod(
                          method.value,
                        )
                      }
                      className={
                        active
                          ? 'h-10 rounded-lg bg-[var(--primary)] px-3 text-sm font-black text-white'
                          : 'h-10 rounded-lg border border-[var(--border)] px-3 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]'
                      }
                    >
                      {
                        method.label
                      }
                    </button>
                  );
                },
              )}
            </div>

            {paymentMethod ===
            'CASH' ? (
              <>
                {received > 0 &&
                !hasOpenDrawer ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-[var(--danger)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold text-[var(--danger)]">
                      Open the cash drawer before saving a cash sale.
                    </p>

                    <Link
                      href="/money"
                      prefetch
                      className="text-sm font-black text-[var(--primary)]"
                    >
                      Go to Money
                    </Link>
                  </div>
                ) : null}

                <div>
                  <label
                    htmlFor="amountReceived"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Cash received
                  </label>

                  <input
                    id="amountReceived"
                    name="amountReceived"
                    inputMode="decimal"
                    value={
                      amountReceived
                    }
                    placeholder="0"
                    onChange={(
                      event,
                    ) =>
                      changeAmountReceived(
                        event.target
                          .value,
                      )
                    }
                    className={`${fieldClass} mt-2`}
                  />
                </div>

                {extraAvailable >
                0 ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--border)] px-4 py-3">
                      <p className="text-sm font-black text-[var(--text)]">
                        Customer gave{' '}
                        {money(
                          extraAvailable,
                        )}{' '}
                        above the sale total.
                      </p>

                      <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                        Record what was returned and what the customer left.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="changeReturned"
                          className="text-sm font-black text-[var(--text)]"
                        >
                          {paymentMethod ===
                'CASH'
                  ? 'Change given'
                  : 'Refunded'}
                        </label>

                        <input
                          id="changeReturned"
                          name="changeReturned"
                          inputMode="decimal"
                          value={
                            changeReturned
                          }
                          onChange={(
                            event,
                          ) =>
                            setChangeReturned(
                              event
                                .target
                                .value,
                            )
                          }
                          className={`${fieldClass} mt-2`}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="extraKept"
                          className="text-sm font-black text-[var(--text)]"
                        >
                          Extra kept
                        </label>

                        <input
                          id="extraKept"
                          name="extraKept"
                          inputMode="decimal"
                          value={
                            extraKept
                          }
                          onChange={(
                            event,
                          ) =>
                            setExtraKept(
                              event
                                .target
                                .value,
                            )
                          }
                          className={`${fieldClass} mt-2`}
                        />
                      </div>
                    </div>

                    {extraAllocationWrong ? (
                      <p className="text-xs font-black text-[var(--danger)]">
                        Change given plus extra kept must equal{' '}
                        {money(
                          extraAvailable,
                        )}
                        .
                      </p>
                    ) : null}

                    {extra > 0 ? (
                      <div>
                        <label
                          htmlFor="extraReason"
                          className="text-sm font-black text-[var(--text)]"
                        >
                          Why was extra kept?
                        </label>

                        <textarea
                          id="extraReason"
                          name="extraReason"
                          rows={3}
                          value={
                            extraReason
                          }
                          onChange={(
                            event,
                          ) =>
                            setExtraReason(
                              event
                                .target
                                .value,
                            )
                          }
                          required
                          placeholder="Example: Customer said keep it"
                          className="mt-2 min-h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                        />
                      </div>
                    ) : (
                      <input
                        type="hidden"
                        name="extraReason"
                        value=""
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      type="hidden"
                      name="changeReturned"
                      value="0"
                    />

                    <input
                      type="hidden"
                      name="extraKept"
                      value="0"
                    />

                    <input
                      type="hidden"
                      name="extraReason"
                      value=""
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="amountReceived"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Amount paid
                  </label>

                  <input
                    id="amountReceived"
                    name="amountReceived"
                    inputMode="decimal"
                    value={
                      amountReceived
                    }
                    placeholder="0"
                    onChange={(
                      event,
                    ) =>
                      changeAmountReceived(
                        event.target
                          .value,
                      )
                    }
                    className={`${fieldClass} mt-2`}
                  />

                  <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                    No cash drawer needed for{' '}
                    {paymentName(
                      paymentMethod,
                    ).toLowerCase()}
                    .
                  </p>
                </div>

                {extraAvailable > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--border)] px-4 py-3">
                      <p className="text-sm font-black text-[var(--text)]">
                        Customer paid{' '}
                        {money(
                          extraAvailable,
                        )}{' '}
                        above the sale total.
                      </p>

                      <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                        Record what was refunded and what the customer left.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="changeReturned"
                          className="text-sm font-black text-[var(--text)]"
                        >
                          Refunded
                        </label>

                        <input
                          id="changeReturned"
                          name="changeReturned"
                          inputMode="decimal"
                          value={
                            changeReturned
                          }
                          onChange={(
                            event,
                          ) =>
                            setChangeReturned(
                              event.target
                                .value,
                            )
                          }
                          className={`${fieldClass} mt-2`}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="extraKept"
                          className="text-sm font-black text-[var(--text)]"
                        >
                          Extra kept
                        </label>

                        <input
                          id="extraKept"
                          name="extraKept"
                          inputMode="decimal"
                          value={
                            extraKept
                          }
                          onChange={(
                            event,
                          ) =>
                            setExtraKept(
                              event.target
                                .value,
                            )
                          }
                          className={`${fieldClass} mt-2`}
                        />
                      </div>
                    </div>

                    {extraAllocationWrong ? (
                      <p className="text-xs font-black text-[var(--danger)]">
                        Refunded plus extra kept must equal{' '}
                        {money(
                          extraAvailable,
                        )}
                        .
                      </p>
                    ) : null}

                    {extra > 0 ? (
                      <div>
                        <label
                          htmlFor="extraReason"
                          className="text-sm font-black text-[var(--text)]"
                        >
                          Why was extra kept?
                        </label>

                        <textarea
                          id="extraReason"
                          name="extraReason"
                          rows={3}
                          value={
                            extraReason
                          }
                          onChange={(
                            event,
                          ) =>
                            setExtraReason(
                              event.target
                                .value,
                            )
                          }
                          required
                          placeholder="Example: Customer said keep it"
                          className="mt-2 min-h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
                        />
                      </div>
                    ) : (
                      <input
                        type="hidden"
                        name="extraReason"
                        value=""
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      type="hidden"
                      name="changeReturned"
                      value="0"
                    />

                    <input
                      type="hidden"
                      name="extraKept"
                      value="0"
                    />

                    <input
                      type="hidden"
                      name="extraReason"
                      value=""
                    />
                  </>
                )}
              </>
            )}

            {creditNeedsCustomer ? (
              <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
                Choose an existing customer or add a new customer before leaving an unpaid balance.
              </div>
            ) : null}

            <div>
              <label
                htmlFor="notes"
                className="text-sm font-black text-[var(--text)]"
              >
                Notes
              </label>

              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Optional"
                className="mt-2 min-h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              />
            </div>
          </div>
        </section>
      </div>

      {/* SUMMARY */}
      <aside className="self-start rounded-xl border border-[var(--border)] bg-[var(--card)] xl:sticky xl:top-4">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Sale summary
              </p>

              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-sm font-bold text-[var(--muted)]">
                  Total
                </span>

                <strong className="text-xl font-black tabular-nums text-[var(--text)]">
                  {money(total)}
                </strong>
              </div>
            </div>

            {canGiveDiscount &&
            subtotal > 0 &&
            !discountOpen ? (
              <button
                type="button"
                onClick={() =>
                  setDiscountOpen(
                    true,
                  )
                }
                className="text-sm font-black text-[var(--primary)] hover:underline"
              >
                + Add discount
              </button>
            ) : null}
          </div>

          {canGiveDiscount &&
          subtotal > 0 &&
          discountOpen ? (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-bold text-[var(--muted)]">
                  Subtotal
                </span>

                <span className="font-black text-[var(--text)]">
                  {money(
                    subtotal,
                  )}
                </span>
              </div>

              <div className="mt-4">
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
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  max={
                    subtotal
                  }
                  value={
                    discountAmount
                  }
                  placeholder="0"
                  onChange={(
                    event,
                  ) =>
                    setDiscountAmount(
                      event.target
                        .value,
                    )
                  }
                  className={`${fieldClass} mt-2`}
                />

                {discountTooLarge ? (
                  <p className="mt-2 text-xs font-black text-[var(--danger)]">
                    Discount cannot be more than the subtotal.
                  </p>
                ) : null}
              </div>

              {discount > 0 ? (
                <div className="mt-4">
                  <label
                    htmlFor="discountReason"
                    className="text-sm font-black text-[var(--text)]"
                  >
                    Reason
                  </label>

                  <input
                    id="discountReason"
                    name="discountReason"
                    value={
                      discountReason
                    }
                    required
                    placeholder="Example: Bought many items"
                    onChange={(
                      event,
                    ) =>
                      setDiscountReason(
                        event.target
                          .value,
                      )
                    }
                    className={`${fieldClass} mt-2`}
                  />

                  {discountNeedsReason ? (
                    <p className="mt-2 text-xs font-black text-[var(--danger)]">
                      Enter why the discount was given.
                    </p>
                  ) : null}
                </div>
              ) : (
                <input
                  type="hidden"
                  name="discountReason"
                  value=""
                />
              )}

              {discount > 0 &&
              !discountTooLarge ? (
                <div className="mt-4 flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-[var(--muted)]">
                    Discount given
                  </span>

                  <strong className="text-sm font-black text-[var(--primary)]">
                    -{money(
                      discount,
                    )}
                  </strong>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setDiscountOpen(
                    false,
                  );
                  setDiscountAmount(
                    '',
                  );
                  setDiscountReason(
                    '',
                  );
                }}
                className="mt-4 text-xs font-black text-[var(--muted)] hover:text-[var(--text)]"
              >
                Remove discount
              </button>
            </div>
          ) : (
            <>
              <input
                type="hidden"
                name="discountAmount"
                value="0"
              />

              <input
                type="hidden"
                name="discountReason"
                value=""
              />
            </>
          )}
        </div>

        <div className="divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm font-bold text-[var(--muted)]">
              Payment
            </span>

            <span className="text-sm font-black text-[var(--text)]">
              {received > 0
                ? paymentName(
                    paymentMethod,
                  )
                : 'Not paid yet'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm font-bold text-[var(--muted)]">
              {paymentMethod ===
              'CASH'
                ? 'Cash received'
                : 'Amount paid'}
            </span>

            <span className="text-sm font-black text-[var(--text)]">
              {money(received)}
            </span>
          </div>

          {change > 0 ? (
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm font-bold text-[var(--muted)]">
                Change given
              </span>

              <span className="text-sm font-black text-[var(--text)]">
                {money(change)}
              </span>
            </div>
          ) : null}

          {extra > 0 ? (
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm font-bold text-[var(--muted)]">
                Extra kept
              </span>

              <span className="text-sm font-black text-[var(--primary)]">
                {money(extra)}
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm font-bold text-[var(--muted)]">
              Applied to sale
            </span>

            <span className="text-sm font-black text-[var(--success)]">
              {money(paid)}
            </span>
          </div>

          {extraAvailable > 0 ? (
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm font-bold text-[var(--muted)]">
                Extra received
              </span>

              <span className="text-sm font-black text-[var(--primary)]">
                {money(extraAvailable)}
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm font-bold text-[var(--muted)]">
              Unpaid
            </span>

            <span
              className={
                balance > 0
                  ? 'text-sm font-black text-[var(--danger)]'
                  : 'text-sm font-black text-[var(--success)]'
              }
            >
              {money(balance)}
            </span>
          </div>
        </div>

        {queuedLocally ? (
          <div className="border-t border-[var(--border)] px-5 py-3 text-sm font-bold text-[var(--primary)]">
            Sale saved on this device. It will sync automatically when the connection is available.
          </div>
        ) : null}

        {clientError ||
        state.error ? (
          <div className="border-t border-[var(--border)] px-5 py-3 text-sm font-bold text-[var(--danger)]">
            {clientError ||
              state.error}
          </div>
        ) : null}

        <div className="border-t border-[var(--border)] p-4">
          <button
            type="submit"
            disabled={!canSave}
            className="h-11 w-full rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:opacity-100"
          >
            {submitText()}
          </button>
        </div>
      </aside>
    </form>
  );
}
