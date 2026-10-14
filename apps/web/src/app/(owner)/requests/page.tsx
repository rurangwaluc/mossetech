import Link from 'next/link';
import {
  and,
  desc,
  eq,
  inArray,
  or,
} from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  corrections,
  customers,
  saleItems,
  sales,
  users,
} from '@mossetech/db/schema';
import { requireOwner } from '@/lib/auth/session';
import {
  approveStockFixRequestAction,
} from '@/lib/stock/fixes';

import {
  approveStockDamageFixRequestAction,
} from '@/lib/stock/damage-fixes';
import {
  approveProductChangeRequestAction,
} from '@/lib/products/actions';
import {
  approveSaleFixRequestAction,
} from '@/lib/sales/fixes';
import {
  approvePaymentFixRequestAction,
} from '@/lib/sales/payment-fixes';
import {
  approveCustomerFixRequestAction,
} from '@/lib/customers/actions';
import {
  approveExpenseFixRequestAction,
} from '@/lib/expenses/fixes';
import {
  rejectRequestAction,
} from '@/lib/requests/actions';

type RequestsPageProps = {
  searchParams?: Promise<{
    approved?: string;
    rejected?: string;
    error?: string;
  }>;
};

type ChangeRow = {
  label: string;
  before: string;
  after: string;
};

function formatMoney(
  value: unknown,
) {
  return `RWF ${new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits: 0,
    },
  ).format(Number(value || 0))}`;
}

function formatWhen(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        'Africa/Kigali',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(value);
}

function optionalText(
  value: unknown,
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return 'Not added';
  }

  return value.trim();
}

function simpleText(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return 'Not added';
  }

  return String(value);
}

function unitText(
  value: unknown,
) {
  const text =
    simpleText(value);

  if (text === 'Not added') {
    return text;
  }

  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  );
}

function paymentMethodText(
  value: unknown,
) {
  const names:
    Record<
      string,
      string
    > = {
      CASH: 'Cash',
      MOBILE_MONEY:
        'Mobile money',
      BANK: 'Bank',
      CARD: 'Card',
    };

  const key =
    String(
      value || '',
    );

  return (
    names[key] ||
    key ||
    'Not added'
  );
}


function paymentChanges(
  before:
    Record<
      string,
      unknown
    >,
  after:
    Record<
      string,
      unknown
    >,
): ChangeRow[] {
  const rows:
    ChangeRow[] = [];

  const fields = [
    {
      key:
        'paymentMethod',
      label:
        'Payment method',
      format:
        paymentMethodText,
    },
    {
      key:
        'receivedAmount',
      label:
        'Amount received',
      format:
        formatMoney,
    },
    {
      key:
        'appliedAmount',
      label:
        'Applied to sale',
      format:
        formatMoney,
    },
    {
      key:
        'returnedAmount',
      label:
        'Returned',
      format:
        formatMoney,
    },
    {
      key:
        'extraKeptAmount',
      label:
        'Extra kept',
      format:
        formatMoney,
    },
    {
      key:
        'extraReason',
      label:
        'Extra reason',
      format:
        optionalText,
    },
  ] as const;

  for (
    const field
    of fields
  ) {
    const beforeValue =
      field.format(
        before[
          field.key
        ],
      );

    const afterValue =
      field.format(
        after[
          field.key
        ],
      );

    if (
      beforeValue !==
      afterValue
    ) {
      rows.push({
        label:
          field.label,

        before:
          beforeValue,

        after:
          afterValue,
      });
    }
  }

  return rows;
}


function expenseDateText(
  value: unknown,
) {
  const date =
    new Date(
      String(
        value || '',
      ),
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Not added';
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        'Africa/Kigali',

      day:
        'numeric',

      month:
        'short',

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  ).format(
    date,
  );
}


function expenseChanges(
  before: Record<
    string,
    unknown
  >,
  after: Record<
    string,
    unknown
  >,
): ChangeRow[] {
  const fields = [
    {
      key:
        'name',

      label:
        'Expense name',

      format:
        simpleText,
    },
    {
      key:
        'category',

      label:
        'Category',

      format:
        simpleText,
    },
    {
      key:
        'amount',

      label:
        'Amount',

      format:
        formatMoney,
    },
    {
      key:
        'paymentMethod',

      label:
        'Paid from',

      format:
        paymentMethodText,
    },
    {
      key:
        'expenseDate',

      label:
        'Date',

      format:
        expenseDateText,
    },
    {
      key:
        'notes',

      label:
        'Notes',

      format:
        optionalText,
    },
  ] as const;

  return fields.flatMap(
    (field) => {
      const beforeValue =
        field.format(
          before[
            field.key
          ],
        );

      const afterValue =
        field.format(
          after[
            field.key
          ],
        );

      if (
        beforeValue ===
        afterValue
      ) {
        return [];
      }

      return [
        {
          label:
            field.label,

          before:
            beforeValue,

          after:
            afterValue,
        },
      ];
    },
  );
}


function customerChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ChangeRow[] {
  const fields = [
    {
      key: 'name',
      label: 'Customer name',
      format: simpleText,
    },
    {
      key: 'phone',
      label: 'Phone',
      format: optionalText,
    },
    {
      key: 'notes',
      label: 'Notes',
      format: optionalText,
    },
  ] as const;

  return fields.flatMap(
    (field) => {
      const beforeValue =
        field.format(
          before[field.key],
        );

      const afterValue =
        field.format(
          after[field.key],
        );

      if (
        beforeValue ===
        afterValue
      ) {
        return [];
      }

      return [
        {
          label:
            field.label,

          before:
            beforeValue,

          after:
            afterValue,
        },
      ];
    },
  );
}


function stockChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ChangeRow[] {
  const rows:
    ChangeRow[] = [];

  const beforeProduct =
    simpleText(
      before.productName,
    );

  const afterProduct =
    simpleText(
      after.productName,
    );

  if (
    (
      typeof before.productId ===
        'string' &&
      typeof after.productId ===
        'string' &&
      before.productId !==
        after.productId
    ) ||
    beforeProduct !==
      afterProduct
  ) {
    rows.push({
      label:
        'Product',

      before:
        beforeProduct,

      after:
        afterProduct,
    });
  }

  if (
    Number(
      before.quantityReceived,
    ) !==
    Number(
      after.quantityReceived,
    )
  ) {
    rows.push({
      label:
        'Quantity received',

      before:
        String(
          Number(
            before.quantityReceived,
          ),
        ),

      after:
        String(
          Number(
            after.quantityReceived,
          ),
        ),
    });
  }

  const fields = [
    {
      key:
        'supplierName',

      label:
        'Supplier',
    },

    {
      key:
        'reference',

      label:
        'Reference',
    },

    {
      key:
        'notes',

      label:
        'Notes',
    },
  ] as const;

  for (
    const field
    of fields
  ) {
    const beforeValue =
      optionalText(
        before[
          field.key
        ],
      );

    const afterValue =
      optionalText(
        after[
          field.key
        ],
      );

    if (
      beforeValue !==
      afterValue
    ) {
      rows.push({
        label:
          field.label,

        before:
          beforeValue,

        after:
          afterValue,
      });
    }
  }

  return rows;
}


function damageChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ChangeRow[] {
  const rows:
    ChangeRow[] = [];

  if (
    Number(
      before.quantityDamaged,
    ) !==
    Number(
      after.quantityDamaged,
    )
  ) {
    rows.push({
      label:
        'Quantity damaged',

      before:
        String(
          Number(
            before.quantityDamaged,
          ),
        ),

      after:
        String(
          Number(
            after.quantityDamaged,
          ),
        ),
    });
  }

  const beforeReason =
    optionalText(
      before.damageReason,
    );

  const afterReason =
    optionalText(
      after.damageReason,
    );

  if (
    beforeReason !==
    afterReason
  ) {
    rows.push({
      label:
        'Damage reason',

      before:
        beforeReason,

      after:
        afterReason,
    });
  }

  const beforeNotes =
    optionalText(
      before.notes,
    );

  const afterNotes =
    optionalText(
      after.notes,
    );

  if (
    beforeNotes !==
    afterNotes
  ) {
    rows.push({
      label: 'Notes',

      before:
        beforeNotes,

      after:
        afterNotes,
    });
  }

  return rows;
}


function productChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ChangeRow[] {
  const fields = [
    {
      key: 'name',
      label: 'Product name',
      format: simpleText,
    },
    {
      key: 'category',
      label: 'Category',
      format: simpleText,
    },
    {
      key: 'unit',
      label: 'Unit',
      format: unitText,
    },
    {
      key: 'sellingPrice',
      label: 'Selling price',
      format: formatMoney,
    },
    {
      key: 'minQuantity',
      label: 'Low-stock level',
      format: simpleText,
    },
    {
      key: 'notes',
      label: 'Notes',
      format: optionalText,
    },
  ] as const;

  return fields.flatMap(
    (field) => {
      const beforeValue =
        field.format(
          before[field.key],
        );

      const afterValue =
        field.format(
          after[field.key],
        );

      if (
        beforeValue ===
        afterValue
      ) {
        return [];
      }

      return [
        {
          label:
            field.label,

          before:
            beforeValue,

          after:
            afterValue,
        },
      ];
    },
  );
}


function saleItemText(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return 'No items';
  }

  return value
    .map(
      (item) => {
        if (
          !item ||
          typeof item !==
            'object'
        ) {
          return 'Item';
        }

        const row =
          item as Record<
            string,
            unknown
          >;

        const name =
          simpleText(
            row.itemName,
          );

        const quantity =
          Number(
            row.quantity || 0,
          );

        const price =
          formatMoney(
            row.unitPrice,
          );

        return `${name} x${quantity} / ${price}`;
      },
    )
    .join(' / ');
}


function saleChanges(
  before:
    Record<string, unknown>,
  after:
    Record<string, unknown>,
): ChangeRow[] {
  const rows:
    ChangeRow[] = [];

  const beforeCustomer =
    optionalText(
      before.customerName,
    );

  const afterCustomer =
    optionalText(
      after.customerName,
    );

  if (
    beforeCustomer !==
    afterCustomer
  ) {
    rows.push({
      label: 'Customer',
      before:
        beforeCustomer ===
        'Not added'
          ? 'Walk-in customer'
          : beforeCustomer,
      after:
        afterCustomer ===
        'Not added'
          ? 'Walk-in customer'
          : afterCustomer,
    });
  }

  const beforeItems =
    saleItemText(
      before.items,
    );

  const afterItems =
    saleItemText(
      after.items,
    );

  if (
    beforeItems !==
    afterItems
  ) {
    rows.push({
      label: 'Items',
      before:
        beforeItems,
      after:
        afterItems,
    });
  }

  if (
    Number(
      before.totalAmount,
    ) !==
    Number(
      after.totalAmount,
    )
  ) {
    rows.push({
      label:
        'Sale total',
      before:
        formatMoney(
          before.totalAmount,
        ),
      after:
        formatMoney(
          after.totalAmount,
        ),
    });
  }

  if (
    Number(
      before.discountAmount,
    ) !==
    Number(
      after.discountAmount,
    )
  ) {
    rows.push({
      label: 'Discount',
      before:
        formatMoney(
          before.discountAmount,
        ),
      after:
        formatMoney(
          after.discountAmount,
        ),
    });
  }

  const beforeReason =
    optionalText(
      before.discountReason,
    );

  const afterReason =
    optionalText(
      after.discountReason,
    );

  if (
    beforeReason !==
    afterReason
  ) {
    rows.push({
      label:
        'Discount reason',
      before:
        beforeReason,
      after:
        afterReason,
    });
  }

  const beforeNotes =
    optionalText(
      before.notes,
    );

  const afterNotes =
    optionalText(
      after.notes,
    );

  if (
    beforeNotes !==
    afterNotes
  ) {
    rows.push({
      label: 'Notes',
      before:
        beforeNotes,
      after:
        afterNotes,
    });
  }

  return rows;
}


export default async function RequestsPage({
  searchParams,
}: RequestsPageProps) {
  await requireOwner();

  const params =
    await searchParams;

  const requests = await db
    .select({
      id: corrections.id,
      targetType:
        corrections.targetType,
      targetId:
        corrections.targetId,
      targetLabel:
        corrections.targetLabel,
      beforeValues:
        corrections.beforeValues,
      afterValues:
        corrections.afterValues,
      reason:
        corrections.reason,
      requestedAt:
        corrections.requestedAt,
      requestedBy:
        users.name,
    })
    .from(corrections)
    .innerJoin(
      users,
      eq(
        corrections.requestedByUserId,
        users.id,
      ),
    )
    .where(
      and(
        eq(
          corrections.status,
          'PENDING',
        ),
        or(
          eq(
            corrections.targetType,
            'STOCK_RECEIPT',
          ),
          eq(
            corrections.targetType,
            'STOCK_DAMAGE',
          ),
          eq(
            corrections.targetType,
            'PRODUCT',
          ),
          eq(
            corrections.targetType,
            'CUSTOMER',
          ),
          eq(
            corrections.targetType,
            'EXPENSE',
          ),
          eq(
            corrections.targetType,
            'SALE',
          ),
          eq(
            corrections.targetType,
            'SALE_PAYMENT',
          ),
        ),
      ),
    )
    .orderBy(
      desc(
        corrections.requestedAt,
      ),
    );

  const requestCustomerIds = [
    ...new Set(
      requests
        .filter(
          (request) =>
            request.targetType ===
            'CUSTOMER',
        )
        .map(
          (request) =>
            request.targetId,
        ),
    ),
  ];

  const requestCustomers =
    requestCustomerIds.length > 0
      ? await db
          .select()
          .from(
            customers,
          )
          .where(
            inArray(
              customers.id,
              requestCustomerIds,
            ),
          )
      : [];

  const customerById =
    new Map(
      requestCustomers.map(
        (customer) => [
          customer.id,
          customer,
        ],
      ),
    );

  const requestSaleIds = [
    ...new Set(
      requests
        .filter(
          (request) =>
            request.targetType ===
              'SALE' ||
            request.targetType ===
              'SALE_PAYMENT',
        )
        .map(
          (request) =>
            request.targetId,
        ),
    ),
  ];

  const requestSales =
    requestSaleIds.length > 0
      ? await db
          .select()
          .from(sales)
          .where(
            inArray(
              sales.id,
              requestSaleIds,
            ),
          )
      : [];

  const requestSaleItems =
    requestSaleIds.length > 0
      ? await db
          .select({
            saleId:
              saleItems.saleId,
            itemName:
              saleItems.itemName,
            quantity:
              saleItems.quantity,
          })
          .from(saleItems)
          .where(
            inArray(
              saleItems.saleId,
              requestSaleIds,
            ),
          )
      : [];

  const saleById =
    new Map(
      requestSales.map(
        (sale) => [
          sale.id,
          sale,
        ],
      ),
    );

  const itemTextBySaleId =
    new Map<string, string>();

  for (
    const saleId
    of requestSaleIds
  ) {
    const text =
      requestSaleItems
        .filter(
          (item) =>
            item.saleId ===
            saleId,
        )
        .map(
          (item) =>
            `${item.itemName} x${item.quantity}`,
        )
        .join(', ');

    itemTextBySaleId.set(
      saleId,
      text || 'Sale',
    );
  }

  return (
    <section className="space-y-4">
      {params?.approved === '1' ? (
        <div className="rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
          Request approved.
        </div>
      ) : null}

      {params?.rejected === '1' ? (
        <div className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          Request rejected.
        </div>
      ) : null}

      {params?.error ? (
        <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
          {params.error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
            Owner
          </p>

          <h2 className="mt-1 text-xl font-black text-[var(--text)]">
            Requests
          </h2>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Things waiting for you to check.
          </p>
        </div>
      </section>

      {requests.length === 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-6 sm:px-6">
          <p className="text-sm font-black text-[var(--text)]">
            No requests waiting
          </p>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Nothing needs your approval right now.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {requests.map(
            (request) => {
              const isProduct =
                request.targetType ===
                'PRODUCT';

              const isCustomer =
                request.targetType ===
                'CUSTOMER';

              const isExpense =
                request.targetType ===
                'EXPENSE';

              const isSale =
                request.targetType ===
                'SALE';

              const isPayment =
                request.targetType ===
                'SALE_PAYMENT';

              const isDamage =
                request.targetType ===
                'STOCK_DAMAGE';

              const isReceipt =
                request.targetType ===
                'STOCK_RECEIPT';

              const requestExpense =
                isExpense
                  ? {
                      name:
                        simpleText(
                          request
                            .beforeValues
                            .name,
                        ),

                      category:
                        simpleText(
                          request
                            .beforeValues
                            .category,
                        ),

                      amount:
                        formatMoney(
                          request
                            .beforeValues
                            .amount,
                        ),

                      paymentMethod:
                        paymentMethodText(
                          request
                            .beforeValues
                            .paymentMethod,
                        ),

                      expenseDate:
                        expenseDateText(
                          request
                            .beforeValues
                            .expenseDate,
                        ),
                    }
                  : null;

              const requestCustomer =
                isCustomer
                  ? customerById.get(
                      request.targetId,
                    ) || null
                  : null;

              const requestSale =
                isSale ||
                isPayment
                  ? saleById.get(
                      request.targetId,
                    )
                  : null;

              const requestItemText =
                requestSale
                  ? itemTextBySaleId.get(
                      requestSale.id,
                    ) || 'Sale'
                  : null;

              const changes =
                isProduct
                  ? productChanges(
                      request.beforeValues,
                      request.afterValues,
                    )
                  : isCustomer
                    ? customerChanges(
                        request.beforeValues,
                        request.afterValues,
                      )
                  : isExpense
                    ? expenseChanges(
                        request.beforeValues,
                        request.afterValues,
                      )
                  : isPayment
                    ? paymentChanges(
                        request.beforeValues,
                        request.afterValues,
                      )
                    : isSale
                      ? saleChanges(
                          request.beforeValues,
                          request.afterValues,
                        )
                      : isDamage
                        ? damageChanges(
                            request.beforeValues,
                            request.afterValues,
                          )
                        : stockChanges(
                            request.beforeValues,
                            request.afterValues,
                          );

              const approveAction =
                isProduct
                  ? approveProductChangeRequestAction
                  : isCustomer
                    ? approveCustomerFixRequestAction
                  : isExpense
                    ? approveExpenseFixRequestAction
                  : isPayment
                    ? approvePaymentFixRequestAction
                    : isSale
                      ? approveSaleFixRequestAction
                      : isDamage
                        ? approveStockDamageFixRequestAction
                        : approveStockFixRequestAction;

              return (
                <article
                  key={request.id}
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
                >
                  <div className="px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-[var(--text)]">
                          {request.requestedBy}{' '}
                          {isProduct
                            ? 'asked to edit a product'
                            : isCustomer
                              ? 'asked to fix a customer'
                            : isExpense
                              ? 'asked to fix an expense'
                            : isPayment
                              ? request.beforeValues
                                  .paymentType ===
                                'LATER_PAYMENT'
                                ? 'asked to fix a later payment'
                                : 'asked to fix a payment'
                              : isSale
                                ? 'asked to fix a sale'
                                : isDamage
                                  ? 'asked to correct damaged stock'
                                  : isReceipt
                                    ? 'asked to correct a stock receipt'
                                    : 'asked to fix stock'}
                        </p>

                        {requestExpense ? (
                          <>
                            <p className="mt-1 text-sm font-black text-[var(--text)]">
                              {
                                requestExpense.name
                              }
                            </p>

                            <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
                              {
                                requestExpense.category
                              }
                              {' / '}
                              {
                                requestExpense.paymentMethod
                              }
                              {' / '}
                              {
                                requestExpense.expenseDate
                              }
                              {' / '}
                              {
                                requestExpense.amount
                              }
                            </p>
                          </>
                        ) : requestCustomer ? (
                          <>
                            <p className="mt-1 text-sm font-black text-[var(--text)]">
                              {requestCustomer.name}
                            </p>

                            {requestCustomer.phone ? (
                              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                                {requestCustomer.phone}
                              </p>
                            ) : null}
                          </>
                        ) : requestSale ? (
                          <>
                            <p className="mt-1 text-sm font-black text-[var(--text)]">
                              {requestSale.customerName ||
                                'Walk-in customer'}
                            </p>

                            <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
                              {requestItemText}
                              {' / '}
                              {formatWhen(
                                requestSale.saleDate,
                              )}
                              {' / '}
                              {formatMoney(
                                requestSale.totalAmount,
                              )}
                            </p>
                            {isPayment &&
                            request.beforeValues
                              .paymentType ===
                              'LATER_PAYMENT' ? (
                              <p className="mt-1 text-xs font-black text-[var(--text)]">
                                Later payment
                                {' / '}
                                {formatWhen(
                                  new Date(
                                    String(
                                      request.beforeValues
                                        .paidAt,
                                    ),
                                  ),
                                )}
                                {' / '}
                                {formatMoney(
                                  request.beforeValues
                                    .appliedAmount,
                                )}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                            {request.targetLabel}
                          </p>
                        )}
                      </div>

                      <p className="text-xs font-bold text-[var(--muted)]">
                        {formatWhen(
                          request.requestedAt,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border)] px-5 py-4 sm:px-6">
                    <div className="space-y-3">
                      {changes.map(
                        (change) => (
                          <div
                            key={
                              change.label
                            }
                          >
                            <p className="text-xs font-bold text-[var(--muted)]">
                              {
                                change.label
                              }
                            </p>

                            <p className="mt-1 text-sm font-black text-[var(--text)]">
                              {
                                change.before
                              }{' '}
                              →{' '}
                              {
                                change.after
                              }
                            </p>
                          </div>
                        ),
                      )}

                      <div>
                        <p className="text-xs font-bold text-[var(--muted)]">
                          {isProduct
                            ? 'Why it needs changing'
                            : 'What was wrong'}
                        </p>

                        <p className="mt-1 text-sm font-bold leading-6 text-[var(--text)]">
                          {request.reason}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] px-5 py-3 sm:flex sm:justify-end sm:px-6">
                    {requestExpense ? (
                      <Link
                        href={`/expenses/${request.targetId}`}
                        className="col-span-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:col-span-1 sm:w-auto"
                      >
                        Open expense
                      </Link>
                    ) : null}

                    {requestCustomer ? (
                      <Link
                        href={`/customers/${requestCustomer.id}`}
                        className="col-span-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:col-span-1 sm:w-auto"
                      >
                        Open customer
                      </Link>
                    ) : null}

                    {requestSale ? (
                      <Link
                        href={`/sales/${requestSale.id}`}
                        className="col-span-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:col-span-1 sm:w-auto"
                      >
                        Open sale
                      </Link>
                    ) : null}

                    {isReceipt ? (
                      <Link
                        href={`/stock/received/${request.targetId}/fix`}
                        prefetch
                        className="col-span-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:col-span-1 sm:w-auto"
                      >
                        Open receipt
                      </Link>
                    ) : null}

                    {isDamage ? (
                      <Link
                        href={`/stock/damaged/${request.targetId}/fix`}
                        prefetch
                        className="col-span-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:col-span-1 sm:w-auto"
                      >
                        Open damage
                      </Link>
                    ) : null}

                    <form
                      action={
                        rejectRequestAction
                      }
                    >
                      <input
                        type="hidden"
                        name="correctionId"
                        value={
                          request.id
                        }
                      />

                      <button
                        type="submit"
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] sm:w-auto"
                      >
                        Reject
                      </button>
                    </form>

                    <form
                      action={
                        approveAction
                      }
                    >
                      <input
                        type="hidden"
                        name="correctionId"
                        value={
                          request.id
                        }
                      />

                      <button
                        type="submit"
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white sm:w-auto"
                      >
                        Approve
                      </button>
                    </form>
                  </div>
                </article>
              );
            },
          )}
        </section>
      )}
    </section>
  );
}
