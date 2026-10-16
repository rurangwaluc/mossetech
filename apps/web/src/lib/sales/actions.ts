'use server';

import { requirePermission } from '@/lib/auth/require-permission';

import {
  and,
  eq,
  inArray,
} from 'drizzle-orm';

import {
  redirect,
} from 'next/navigation';

import {
  revalidatePath,
} from 'next/cache';

import {
  db,
} from '@mossetech/db/client';

import {
  cashDrawerMovements,
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
  validateMinimumSellingPrices,
} from '@mossetech/validators/minimum-selling-price';

import {
  minimumPriceEnforcementEnabled,
} from './minimum-price-rollout';

import {
} from '@/lib/auth/session';

import {
  lockCurrentOpenDrawer,
} from '@/lib/cash-drawer/locking';

import {
  getProductLedgerTotals,
  lockProductLedgers,
  reconcileProductLedgerQuantity,
} from './stock-ledger';

export type SaleState = {
  error?: string;
};

type SaleLine = {
  item:
    typeof products.$inferSelect;

  quantity: number;

  baseUnitPrice: number;

  unitPrice: number;

  lineTotal: number;
};

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

function toMoney(
  value: number,
) {
  return value.toFixed(2);
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

function getProductSellingPrice(
  item:
    typeof products.$inferSelect,
) {
  return moneyNumber(
    item.sellingPrice,
  );
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
  extraReason: string | null;
}) {
  if (
    amountReceived < 0 ||
    changeReturned < 0 ||
    extraKept < 0
  ) {
    throw new Error(
      'Money amounts cannot be below zero.',
    );
  }

  const paidAmount =
    amountReceived -
    changeReturned -
    extraKept;

  if (
    paidAmount < 0
  ) {
    throw new Error(
      'Returned money and extra kept cannot be more than amount received.',
    );
  }

  if (
    paidAmount >
    totalAmount
  ) {
    throw new Error(
      'Choose how much was returned or how much extra was kept.',
    );
  }

  const balanceAmount =
    totalAmount -
    paidAmount;

  if (
    (
      changeReturned > 0 ||
      extraKept > 0
    ) &&
    balanceAmount > 0
  ) {
    throw new Error(
      'Only record change or extra kept when the sale is fully paid.',
    );
  }

  if (
    amountReceived >
    totalAmount
  ) {
    const overAmount =
      amountReceived -
      totalAmount;

    const allocatedOverAmount =
      changeReturned +
      extraKept;

    if (
      Number(
        allocatedOverAmount
          .toFixed(2),
      ) !==
      Number(
        overAmount
          .toFixed(2),
      )
    ) {
      throw new Error(
        'Account for all extra money between returned money and extra kept.',
      );
    }
  }

  if (
    extraKept > 0 &&
    !extraReason
  ) {
    throw new Error(
      'Explain why extra customer money was kept.',
    );
  }

  return {
    paidAmount,

    balanceAmount,
  };
}

export async function createSaleAction(
  _previousState:
    SaleState,
  formData: FormData,
): Promise<SaleState> {
  const user =
    await requirePermission('sales.create');

  let items:
    unknown = [];

  try {
    items =
      JSON.parse(
        String(
          formData.get(
            'itemsJson',
          ) || '[]',
        ),
      );
  } catch {
    return {
      error:
        'Check the selected items.',
    };
  }

  const parsed =
    saleFormSchema.safeParse({
      customerMode:
        formData.get(
          'customerMode',
        ),

      customerId:
        formData.get(
          'customerId',
        ) || undefined,

      newCustomerName:
        formData.get(
          'newCustomerName',
        ) || undefined,

      newCustomerPhone:
        formData.get(
          'newCustomerPhone',
        ) || undefined,

      paymentMethod:
        formData.get(
          'paymentMethod',
        ),

      discountAmount:
        formData.get(
          'discountAmount',
        ) || '0',

      discountReason:
        formData.get(
          'discountReason',
        ) || undefined,

      amountReceived:
        formData.get(
          'amountReceived',
        ) || '0',

      changeReturned:
        formData.get(
          'changeReturned',
        ) || '0',

      extraKept:
        formData.get(
          'extraKept',
        ) || '0',

      extraReason:
        formData.get(
          'extraReason',
        ) || undefined,

      notes:
        formData.get(
          'notes',
        ) || undefined,

      items,
    });

  if (!parsed.success) {
    return {
      error:
        parsed.error
          .issues[0]
          ?.message ||
        'Check the sale form.',
    };
  }

  // Creating a customer requires its own permission, even
  // when the employee is allowed to record sales.
  if (parsed.data.customerMode === 'NEW') {
    await requirePermission('customers.create');
  }

  if (
    parsed.data
      .customerMode ===
      'EXISTING' &&
    !parsed.data.customerId
  ) {
    return {
      error:
        'Choose an existing customer or use walk-in customer.',
    };
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
    return {
      error:
        'Enter the new customer name.',
    };
  }

  const productIds = [
    ...new Set(
      parsed.data.items.map(
        (item) =>
          item.productId,
      ),
    ),
  ];

  try {
    await db.transaction(
      async (tx) => {
        /*
         * Product rows are the serialization point shared
         * by receiving, damage corrections and Sales.
         */
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
          throw new Error(
            'One product was not found.',
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
                throw new Error(
                  'One product is not available.',
                );
              }

              const baseUnitPrice =
                getProductSellingPrice(
                  item,
                );

              if (
                !minimumPriceEnforcementEnabled &&
                baseUnitPrice <= 0
              ) {
                throw new Error(
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
                throw new Error(
                  `Enter the price for ${item.name}.`,
                );
              }

              /*
               * A lower agreed item price must be represented
               * by the sale-level Discount field so the
               * reduction and its reason remain visible.
               */
              if (
                !minimumPriceEnforcementEnabled &&
                Number(
                  unitPrice.toFixed(
                    2,
                  ),
                ) <
                Number(
                  baseUnitPrice.toFixed(
                    2,
                  ),
                )
              ) {
                throw new Error(
                  `Use Add discount to sell ${item.name} below its normal price.`,
                );
              }

              return {
                item,

                quantity:
                  input.quantity,

                baseUnitPrice,

                unitPrice,

                lineTotal:
                  unitPrice *
                  input.quantity,
              };
            },
          );

        /*
         * A product can appear on more than one row.
         * Validate the combined requested quantity against
         * the authoritative Stock ledger.
         */
        const quantityByProduct =
          new Map<
            string,
            number
          >();

        for (
          const line
          of lines
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
          ] of
          quantityByProduct
        ) {
          const item =
            productRows.find(
              (current) =>
                current.id ===
                productId,
            );

          if (!item) {
            throw new Error(
              'One product was not found.',
            );
          }

          const ledger =
            await getProductLedgerTotals(
              tx,
              productId,
            );

          if (
            ledger.remaining <
            quantity
          ) {
            throw new Error(
              `${item.name} does not have enough stock.`,
            );
          }
        }

        const subtotalAmount =
          lines.reduce(
            (
              sum,
              line,
            ) =>
              sum +
              line.lineTotal,
            0,
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
          throw new Error(
            'Discount cannot be below zero.',
          );
        }

        if (
          discountAmount >
          subtotalAmount
        ) {
          throw new Error(
            'Discount cannot be more than the sale subtotal.',
          );
        }

        if (
          discountAmount >
            0 &&
          !discountReason
        ) {
          throw new Error(
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
            throw new Error(priceCheck.error);
          }
        }

        const totalAmount =
          Number(
            (
              subtotalAmount -
              discountAmount
            ).toFixed(2),
          );

        const amountReceived =
          moneyNumber(
            parsed.data
              .amountReceived,
          );

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
          throw new Error(
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
            throw new Error(
              'Selected customer was not found.',
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

        let openDrawer:
          | Awaited<
              ReturnType<
                typeof lockCurrentOpenDrawer
              >
            >
          | undefined;

        if (
          parsed.data
            .paymentMethod ===
            'CASH' &&
          (
            paidAmount > 0 ||
            extraKept > 0
          )
        ) {
          const drawer =
            await lockCurrentOpenDrawer(
              tx,
            );

          if (!drawer) {
            throw new Error(
              'Open the cash drawer before saving a cash sale.',
            );
          }

          openDrawer =
            drawer;
        }

        const [sale] =
          await tx
            .insert(sales)
            .values({
              customerId,

              customerName,

              customerPhone,

              paymentMethod:
                parsed.data
                  .paymentMethod,

              subtotalAmount:
                toMoney(
                  subtotalAmount,
                ),

              discountAmount:
                toMoney(
                  discountAmount,
                ),

              discountReason:
                discountAmount >
                0
                  ? discountReason
                  : null,

              discountGivenByUserId:
                discountAmount >
                0
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
                  parsed.data
                    .notes,
                ),
            })
            .returning({
              id:
                sales.id,

              saleDate:
                sales.saleDate,

              createdAt:
                sales.createdAt,
            });

        /*
         * A completely unpaid sale has no payment event.
         */
        if (
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
                changeReturned >
                0
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
                sale.saleDate,

              createdAt:
                sale.createdAt,
            });
        }

        /*
         * unit_cost and profit_amount are intentionally
         * omitted. Their physical columns remain only for
         * legacy compatibility and therefore receive DB
         * defaults of zero.
         */
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

                lineTotal:
                  toMoney(
                    line.lineTotal,
                  ),
              }),
            ),
          );

        if (
          openDrawer &&
          paidAmount > 0
        ) {
          await tx
            .insert(
              cashDrawerMovements,
            )
            .values({
              drawerId:
                openDrawer.id,

              createdByUserId:
                user.id,

              movementType:
                'CASH_SALE',

              direction:
                'IN',

              amount:
                toMoney(
                  paidAmount,
                ),

              reason:
                customerName
                  ? `Cash sale / ${customerName}`
                  : 'Cash sale / Walk-in customer',

              saleId:
                sale.id,
            });
        }

        if (
          openDrawer &&
          extraKept > 0
        ) {
          await tx
            .insert(
              cashDrawerMovements,
            )
            .values({
              drawerId:
                openDrawer.id,

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
            });
        }

        /*
         * The sale_items ledger is now authoritative.
         * Recalculate the compatibility quantity rather
         * than blindly subtracting from the compatibility quantity column.
         */
        for (
          const productId
          of productIds
        ) {
          await reconcileProductLedgerQuantity(
            tx,
            productId,
          );
        }
      },
    );
  } catch (error) {
    return {
      error:
        error instanceof
        Error
          ? error.message
          : 'Sale could not be saved.',
    };
  }

  revalidatePath(
    '/sales',
  );

  revalidatePath(
    '/money',
  );

  revalidatePath(
    '/customers',
  );

  revalidatePath(
    '/products',
  );

  revalidatePath(
    '/stock',
  );

  revalidatePath(
    '/dashboard',
  );

  revalidatePath(
    '/reports',
  );

  redirect('/sales');
}
