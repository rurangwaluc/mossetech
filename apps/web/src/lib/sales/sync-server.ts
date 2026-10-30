import {
  and,
  desc,
  eq,
  inArray,
  sql,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  cashDrawerMovements,
  cashDrawers,
  customers,
  products,
  saleItems,
  salePayments,
  sales,
} from '@mossetech/db/schema';

import {
  saleFormSchema,
} from '@mossetech/validators/sale';

import {
  calculateSalePaymentSplit,
} from '@mossetech/validators/sale-payment-split';

import {
  validateMinimumSellingPrices,
} from '@mossetech/validators/minimum-selling-price';

import {
  minimumPriceEnforcementEnabled,
} from './minimum-price-rollout';

import {
  getProductLedgerTotals,
  lockProductLedgers,
  reconcileProductLedgerQuantity,
} from './stock-ledger';

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

type SyncUser = {
  id: string;
};

type SaleCreatePayload = {
  customerMode?: unknown;
  customerId?: unknown;
  newCustomerName?: unknown;
  newCustomerPhone?: unknown;

  paymentMethod?: unknown;
  payments?: unknown;

  discountAmount?: unknown;
  discountReason?: unknown;

  amountReceived?: unknown;
  changeReturned?: unknown;
  extraKept?: unknown;
  extraReason?: unknown;

  notes?: unknown;

  items?: unknown;

  /*
   * The drawer observed by the client when the sale was
   * entered. Needed so an offline cash sale is not attached
   * to a different drawer after reconnection.
   */
  cashDrawerId?: unknown;
};

type SaleLine = {
  item:
    typeof products.$inferSelect;

  quantity: number;

  baseUnitPrice: number;
  unitPrice: number;

  lineTotal: number;
};

export class SaleSyncError
  extends Error {
  status: number;

  constructor(
    message: string,
    status = 422,
  ) {
    super(message);

    this.name =
      'SaleSyncError';

    this.status =
      status;
  }
}

function cleanOptional(
  value:
    | string
    | undefined,
) {
  const cleaned =
    value?.trim();

  return cleaned
    ? cleaned
    : null;
}

function moneyNumber(
  value:
    | string
    | number
    | null
    | undefined,
) {
  return Number(
    value || 0,
  );
}

function toMoney(
  value: number,
) {
  return value.toFixed(2);
}

function roundMoney(
  value: number,
) {
  return Math.round(
    value * 100,
  ) / 100;
}

function differenceType(
  value: number,
):
  | 'EXTRA'
  | 'MISSING'
  | 'NONE' {
  if (value > 0) {
    return 'EXTRA';
  }

  if (value < 0) {
    return 'MISSING';
  }

  return 'NONE';
}

function validatePayment({
  totalAmount,
  amountReceived,
  changeReturned,
  extraKept,
  extraReason,
}: {
  totalAmount: number;
  amountReceived: number;
  changeReturned: number;
  extraKept: number;
  extraReason:
    | string
    | null;
}) {
  if (
    amountReceived < 0 ||
    changeReturned < 0 ||
    extraKept < 0
  ) {
    throw new SaleSyncError(
      'Money amounts cannot be below zero.',
    );
  }

  const paidAmount =
    roundMoney(
      amountReceived -
        changeReturned -
        extraKept,
    );

  if (
    paidAmount < 0
  ) {
    throw new SaleSyncError(
      'Returned money and extra kept cannot be more than amount received.',
    );
  }

  if (
    paidAmount >
    totalAmount
  ) {
    throw new SaleSyncError(
      'Choose how much was returned or how much extra was kept.',
    );
  }

  const balanceAmount =
    roundMoney(
      totalAmount -
        paidAmount,
    );

  if (
    (
      changeReturned >
        0 ||
      extraKept > 0
    ) &&
    balanceAmount > 0
  ) {
    throw new SaleSyncError(
      'Only record change or extra kept when the sale is fully paid.',
    );
  }

  if (
    amountReceived >
    totalAmount
  ) {
    const overAmount =
      roundMoney(
        amountReceived -
          totalAmount,
      );

    const allocated =
      roundMoney(
        changeReturned +
          extraKept,
      );

    if (
      allocated !==
      overAmount
    ) {
      throw new SaleSyncError(
        'Account for all extra money between returned money and extra kept.',
      );
    }
  }

  if (
    extraKept > 0 &&
    !extraReason
  ) {
    throw new SaleSyncError(
      'Explain why extra customer money was kept.',
    );
  }

  return {
    paidAmount,
    balanceAmount,
  };
}

function validDrawerId(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (
    typeof value !==
    'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new SaleSyncError(
      'The cash drawer reference is invalid.',
      400,
    );
  }

  return value;
}

async function resolveCashDrawer(
  tx: DbTransaction,
  drawerId: string | null,
  saleTime: Date,
) {
  if (drawerId) {
    await tx.execute(sql`
      SELECT id
      FROM cash_drawers
      WHERE id = ${drawerId}
      FOR UPDATE
    `);

    const [drawer] =
      await tx
        .select()
        .from(
          cashDrawers,
        )
        .where(
          eq(
            cashDrawers.id,
            drawerId,
          ),
        )
        .limit(1);

    if (!drawer) {
      throw new SaleSyncError(
        'The cash drawer used for this sale was not found.',
        409,
      );
    }

    const happenedAfterOpen =
      saleTime.getTime() >=
      drawer.openedAt
        .getTime();

    const happenedBeforeClose =
      !drawer.closedAt ||
      saleTime.getTime() <=
        drawer.closedAt
          .getTime();

    if (
      !happenedAfterOpen ||
      !happenedBeforeClose
    ) {
      throw new SaleSyncError(
        'This cash sale does not belong to the recorded drawer session.',
        409,
      );
    }

    return drawer;
  }

  const [drawer] =
    await tx
      .select()
      .from(
        cashDrawers,
      )
      .where(
        eq(
          cashDrawers.status,
          'OPEN',
        ),
      )
      .orderBy(
        desc(
          cashDrawers.openedAt,
        ),
      )
      .limit(1);

  if (!drawer) {
    throw new SaleSyncError(
      'Open the cash drawer before saving a cash sale.',
      409,
    );
  }

  await tx.execute(sql`
    SELECT id
    FROM cash_drawers
    WHERE id = ${drawer.id}
    FOR UPDATE
  `);

  return drawer;
}

async function reconcileClosedDrawer(
  tx: DbTransaction,
  drawer:
    typeof cashDrawers.$inferSelect,
) {
  if (
    drawer.status !==
    'CLOSED'
  ) {
    return;
  }

  /*
   * An offline sale may synchronize after the drawer was
   * already counted and closed. Recalculate the stored close
   * figures so the historical drawer remains mathematically
   * correct after the late movement arrives.
   */
  const [totals] =
    await tx
      .select({
        cashIn:
          sql<string>`
            coalesce(
              sum(
                case
                  when
                    ${cashDrawerMovements.direction} = 'IN'
                    and ${cashDrawerMovements.movementType}
                      not in (
                        'OPENING_CASH',
                        'CLOSING_COUNT',
                        'CASH_DIFFERENCE'
                      )
                  then ${cashDrawerMovements.amount}
                  else 0
                end
              ),
              0
            )
          `,

        cashOut:
          sql<string>`
            coalesce(
              sum(
                case
                  when
                    ${cashDrawerMovements.direction} = 'OUT'
                    and ${cashDrawerMovements.movementType}
                      not in (
                        'OPENING_CASH',
                        'CLOSING_COUNT',
                        'CASH_DIFFERENCE'
                      )
                  then ${cashDrawerMovements.amount}
                  else 0
                end
              ),
              0
            )
          `,
      })
      .from(
        cashDrawerMovements,
      )
      .where(
        eq(
          cashDrawerMovements
            .drawerId,
          drawer.id,
        ),
      );

  const expected =
    roundMoney(
      Number(
        drawer.openingCash,
      ) +
        Number(
          totals?.cashIn ||
            0,
        ) -
        Number(
          totals?.cashOut ||
            0,
        ),
    );

  const difference =
    roundMoney(
      Number(
        drawer.countedCash,
      ) -
        expected,
    );

  const type =
    differenceType(
      difference,
    );

  await tx
    .update(
      cashDrawers,
    )
    .set({
      expectedCashAtClose:
        toMoney(
          expected,
        ),

      differenceAmount:
        toMoney(
          Math.abs(
            difference,
          ),
        ),

      differenceType:
        type,

      differenceReason:
        type === 'NONE'
          ? null
          : drawer
              .differenceReason ||
            'Adjusted after an offline cash sale synchronized.',

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        cashDrawers.id,
        drawer.id,
      ),
    );
}

export async function executeSaleCreateSync(
  tx: DbTransaction,
  user: SyncUser,
  payload: unknown,
  clientCreatedAt: Date,
) {
  if (
    !payload ||
    typeof payload !==
      'object' ||
    Array.isArray(
      payload,
    )
  ) {
    throw new SaleSyncError(
      'Invalid sale information.',
      400,
    );
  }

  const raw =
    payload as SaleCreatePayload;

  const parsed =
    saleFormSchema.safeParse({
      customerMode:
        raw.customerMode,

      customerId:
        raw.customerId ||
        undefined,

      newCustomerName:
        raw.newCustomerName ||
        undefined,

      newCustomerPhone:
        raw.newCustomerPhone ||
        undefined,

      paymentMethod:
        raw.paymentMethod,

      payments:
        raw.payments,

      discountAmount:
        raw.discountAmount ||
        '0',

      discountReason:
        raw.discountReason ||
        undefined,

      amountReceived:
        raw.amountReceived ||
        '0',

      changeReturned:
        raw.changeReturned ||
        '0',

      extraKept:
        raw.extraKept ||
        '0',

      extraReason:
        raw.extraReason ||
        undefined,

      notes:
        raw.notes ||
        undefined,

      items:
        raw.items,
    });

  if (!parsed.success) {
    throw new SaleSyncError(
      parsed.error
        .issues[0]
        ?.message ||
        'Check the sale information.',
      400,
    );
  }



  const cashDrawerId =
    validDrawerId(
      raw.cashDrawerId,
    );

  if (
    parsed.data
      .customerMode ===
      'EXISTING' &&
    !parsed.data.customerId
  ) {
    throw new SaleSyncError(
      'Choose an existing customer or use walk-in customer.',
    );
  }

  if (
    parsed.data
      .customerMode ===
      'NEW' &&
    !cleanOptional(
      parsed.data
        .newCustomerName,
    )
  ) {
    throw new SaleSyncError(
      'Enter the new customer name.',
    );
  }

  const productIds = [
    ...new Set(
      parsed.data.items.map(
        (item) =>
          item.productId,
      ),
    ),
  ];

  await lockProductLedgers(
    tx,
    productIds,
  );

  const productRows =
    productIds.length > 0
      ? await tx
          .select()
          .from(products)
          .where(
            and(
              inArray(
                products.id,
                productIds,
              ),

              eq(
                products.itemType,
                'PRODUCT',
              ),
            ),
          )
      : [];

  if (
    productRows.length !==
    productIds.length
  ) {
    throw new SaleSyncError(
      'One product was not found.',
      404,
    );
  }

  const lines:
    SaleLine[] =
    parsed.data.items.map(
      (input) => {
        const item =
          productRows.find(
            (current) =>
              current.id ===
              input.productId,
          );

        if (
          !item ||
          item.status !==
            'ACTIVE'
        ) {
          throw new SaleSyncError(
            'One product is no longer available.',
            409,
          );
        }

        const baseUnitPrice =
          moneyNumber(
            item.sellingPrice,
          );

        if (
          !minimumPriceEnforcementEnabled &&
          baseUnitPrice <= 0
        ) {
          throw new SaleSyncError(
            `${item.name} does not have a selling price.`,
          );
        }

        const enteredPrice =
          moneyNumber(
            input.unitPrice,
          );

        const unitPrice =
          minimumPriceEnforcementEnabled
            ? enteredPrice
            : enteredPrice > 0
              ? enteredPrice
              : baseUnitPrice;

        if (
          unitPrice <= 0
        ) {
          throw new SaleSyncError(
            `Enter the price for ${item.name}.`,
          );
        }

        if (
          !minimumPriceEnforcementEnabled &&
          roundMoney(
            unitPrice,
          ) <
          roundMoney(
            baseUnitPrice,
          )
        ) {
          throw new SaleSyncError(
            `Use Add discount to sell ${item.name} below its normal price.`,
          );
        }

        return {
          item,

          quantity:
            input.quantity,

          baseUnitPrice:
            roundMoney(
              baseUnitPrice,
            ),

          unitPrice:
            roundMoney(
              unitPrice,
            ),

          lineTotal:
            roundMoney(
              unitPrice *
                input.quantity,
            ),
        };
      },
    );

  const quantityByProduct =
    new Map<
      string,
      number
    >();

  for (
    const line of lines
  ) {
    quantityByProduct.set(
      line.item.id,

      (
        quantityByProduct.get(
          line.item.id,
        ) || 0
      ) +
        line.quantity,
    );
  }

  for (
    const [
      productId,
      quantity,
    ]
    of quantityByProduct
  ) {
    const item =
      productRows.find(
        (current) =>
          current.id ===
          productId,
      );

    const ledger =
      await getProductLedgerTotals(
        tx,
        productId,
      );

    if (
      ledger.remaining <
      quantity
    ) {
      throw new SaleSyncError(
        `${item?.name || 'Product'} does not have enough stock.`,
        409,
      );
    }
  }

  const subtotalAmount =
    roundMoney(
      lines.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          line.lineTotal,
        0,
      ),
    );

  const discountAmount =
    moneyNumber(
      parsed.data
        .discountAmount,
    );

  const discountReason =
    cleanOptional(
      parsed.data
        .discountReason,
    );

  if (
    discountAmount < 0
  ) {
    throw new SaleSyncError(
      'Discount cannot be below zero.',
    );
  }

  if (
    discountAmount >
    subtotalAmount
  ) {
    throw new SaleSyncError(
      'Discount cannot be more than the sale subtotal.',
    );
  }

  if (
    discountAmount > 0 &&
    !discountReason
  ) {
    throw new SaleSyncError(
      'Enter why the discount was given.',
    );
  }

  if (minimumPriceEnforcementEnabled) {
    const priceCheck = validateMinimumSellingPrices(
      lines.map((line) => ({
        name: line.item.name,
        quantity: line.quantity,
        agreedUnitPrice: line.unitPrice,
        minimumUnitPrice:
          line.item.minimumSellingPrice,
      })),
      discountAmount,
    );

    if (!priceCheck.valid) {
      throw new SaleSyncError(
        priceCheck.error,
        409,
      );
    }
  }

  const totalAmount =
    roundMoney(
      subtotalAmount -
        discountAmount,
    );

  const mixedPayments =
    parsed.data.payments !== undefined
      ? calculateSalePaymentSplit(
          totalAmount.toFixed(2),
          parsed.data.payments,
        )
      : null;

  if (
    mixedPayments &&
    (
      Number(parsed.data.amountReceived) !== 0 ||
      Number(parsed.data.changeReturned) !== 0 ||
      Number(parsed.data.extraKept) !== 0
    )
  ) {
    throw new Error(
      'Do not combine mixed payments with the old payment amounts.',
    );
  }

  const amountReceived =
    mixedPayments
      ? Number(mixedPayments.received)
      : moneyNumber(parsed.data.amountReceived);

  const changeReturned =
    moneyNumber(
      parsed.data
        .changeReturned,
    );

  const extraKept =
    moneyNumber(
      parsed.data
        .extraKept,
    );

  const extraReason =
    cleanOptional(
      parsed.data
        .extraReason,
    );

  const {
    paidAmount,
    balanceAmount,
  } =
    validatePayment({
      totalAmount,
      amountReceived,
      changeReturned,
      extraKept,
      extraReason,
    });

  if (
    balanceAmount > 0 &&
    parsed.data
      .customerMode ===
      'WALK_IN'
  ) {
    throw new SaleSyncError(
      'Choose or save the customer before giving credit.',
    );
  }

  let customerId:
    | string
    | null = null;

  let customerName:
    | string
    | null = null;

  let customerPhone:
    | string
    | null = null;

  if (
    parsed.data
      .customerMode ===
      'EXISTING' &&
    parsed.data.customerId
  ) {
    const [customer] =
      await tx
        .select()
        .from(
          customers,
        )
        .where(
          eq(
            customers.id,
            parsed.data
              .customerId,
          ),
        )
        .limit(1);

    if (
      !customer ||
      customer.status !==
        'ACTIVE'
    ) {
      throw new SaleSyncError(
        'Selected customer was not found.',
        409,
      );
    }

    customerId =
      customer.id;

    customerName =
      customer.name;

    customerPhone =
      customer.phone;
  }

  if (
    parsed.data
      .customerMode ===
    'NEW'
  ) {
    const [customer] =
      await tx
        .insert(
          customers,
        )
        .values({
          name:
            cleanOptional(
              parsed.data
                .newCustomerName,
            ) ||
            'Customer',

          phone:
            cleanOptional(
              parsed.data
                .newCustomerPhone,
            ),
        })
        .returning({
          id:
            customers.id,

          name:
            customers.name,

          phone:
            customers.phone,
        });

    customerId =
      customer.id;

    customerName =
      customer.name;

    customerPhone =
      customer.phone;
  }

  let drawer:
    | typeof cashDrawers.$inferSelect
    | null = null;

  if (
    (mixedPayments
      ? mixedPayments.hasCash
      : parsed.data.paymentMethod === 'CASH') &&
    (
      paidAmount > 0 ||
      extraKept > 0
    )
  ) {
    drawer =
      await resolveCashDrawer(
        tx,
        cashDrawerId,
        clientCreatedAt,
      );
  }

  const [sale] =
    await tx
      .insert(
        sales,
      )
      .values({
        customerId,

        customerName,

        customerPhone,

        paymentMethod:
          mixedPayments?.payments[0]?.method ??
          parsed.data.paymentMethod,

        subtotalAmount:
          toMoney(
            subtotalAmount,
          ),

        discountAmount:
          toMoney(
            discountAmount,
          ),

        discountReason:
          discountAmount > 0
            ? discountReason
            : null,

        discountGivenByUserId:
          discountAmount > 0
            ? user.id
            : null,

        totalAmount:
          toMoney(
            totalAmount,
          ),

        paidAmount:
          toMoney(
            paidAmount,
          ),

        amountReceived:
          toMoney(
            amountReceived,
          ),

        changeReturned:
          toMoney(
            changeReturned,
          ),

        extraKept:
          toMoney(
            extraKept,
          ),

        balanceAmount:
          toMoney(
            balanceAmount,
          ),

        extraReason,

        notes:
          cleanOptional(
            parsed.data.notes,
          ),

        saleDate:
          clientCreatedAt,
      })
      .returning({
        id:
          sales.id,
      });

  if (mixedPayments) {
    if (mixedPayments.payments.length > 0) {
      await tx.insert(salePayments).values(
        mixedPayments.payments.map((payment) => ({
          saleId: sale.id,
          receivedByUserId: user.id,
          paymentType: 'AT_SALE' as const,
          paymentMethod: payment.method,
          receivedAmount: payment.amount,
          appliedAmount: payment.amount,
          returnedAmount: '0',
          returnMethod: null,
          extraKeptAmount: '0',
          extraReason: null,
          paidAt: clientCreatedAt,
        })),
      );
    }
  } else if (
    amountReceived > 0
  ) {
    await tx
      .insert(
        salePayments,
      )
      .values({
        saleId:
          sale.id,

        receivedByUserId:
          user.id,

        paymentType:
          'AT_SALE',

        paymentMethod:
          parsed.data
            .paymentMethod,

        receivedAmount:
          toMoney(
            amountReceived,
          ),

        appliedAmount:
          toMoney(
            paidAmount,
          ),

        returnedAmount:
          toMoney(
            changeReturned,
          ),

        returnMethod:
          changeReturned > 0
            ? parsed.data
                .paymentMethod
            : null,

        extraKeptAmount:
          toMoney(
            extraKept,
          ),

        extraReason:
          extraKept > 0
            ? extraReason
            : null,

        paidAt:
          clientCreatedAt,
      });
  }

  await tx
    .insert(
      saleItems,
    )
    .values(
      lines.map(
        (line) => ({
          saleId:
            sale.id,

          productId:
            line.item.id,

          itemName:
            line.item.name,

          itemType:
            'PRODUCT' as const,

          quantity:
            line.quantity,

          baseUnitPrice:
            toMoney(
              line
                .baseUnitPrice,
            ),

          unitPrice:
            toMoney(
              line.unitPrice,
            ),

          priceAdjustedByUserId:
            Math.round(line.unitPrice * 100) !==
                  Math.round(line.baseUnitPrice * 100)
              ? user.id
              : null,

          unitCost:
            toMoney(Number(line.item.buyingPrice)),

          lineTotal:
            toMoney(
              line.lineTotal,
            ),
        }),
      ),
    );

  const cashSaleAmount =
    mixedPayments
      ? Number(
          mixedPayments.payments.find(
            (payment) => payment.method === 'CASH',
          )?.amount ?? '0',
        )
      : paidAmount;

  if (
    drawer &&
    cashSaleAmount > 0
  ) {
    await tx
      .insert(
        cashDrawerMovements,
      )
      .values({
        drawerId:
          drawer.id,

        createdByUserId:
          user.id,

        movementType:
          'CASH_SALE',

        direction:
          'IN',

        amount:
          toMoney(
            cashSaleAmount,
          ),

        reason:
          customerName
            ? `Cash sale / ${customerName}`
            : 'Cash sale / Walk-in customer',

        saleId:
          sale.id,

        createdAt:
          clientCreatedAt,
      });
  }

  if (
    drawer &&
    extraKept > 0
  ) {
    await tx
      .insert(
        cashDrawerMovements,
      )
      .values({
        drawerId:
          drawer.id,

        createdByUserId:
          user.id,

        movementType:
          'CUSTOMER_EXTRA_KEPT',

        direction:
          'IN',

        amount:
          toMoney(
            extraKept,
          ),

        reason:
          extraReason ||
          'Customer extra kept',

        saleId:
          sale.id,

        createdAt:
          clientCreatedAt,
      });
  }

  for (
    const productId
    of productIds
  ) {
    await reconcileProductLedgerQuantity(
      tx,
      productId,
    );
  }

  if (drawer) {
    await reconcileClosedDrawer(
      tx,
      drawer,
    );
  }

  return {
    saleId:
      sale.id,

    customerId,

    totalAmount:
      toMoney(
        totalAmount,
      ),

    paidAmount:
      toMoney(
        paidAmount,
      ),

    balanceAmount:
      toMoney(
        balanceAmount,
      ),
  };
}
