'use server';

import {
  and,
  eq,
  inArray,
  sql,
} from 'drizzle-orm';
import {
  revalidatePath,
} from 'next/cache';
import {
  redirect,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';

import {
  corrections,
  customers,
  products,
  saleItems,
  sales,
} from '@mossetech/db/schema';

import {
  requireOwner,
  requireUser,
} from '@/lib/auth/session';

import {
  getProductLedgerTotals,
  lockProductLedgers,
  reconcileProductLedgerQuantity,
} from './stock-ledger';


type InputItem = {
  sourceItemId: string | null;
  productId: string;
  quantity: number;
  unitPrice: number;
};


type SaleFixItem = {
  id: string | null;
  productId: string;
  itemName: string;

  quantity: number;

  baseUnitPrice: number;
  unitPrice: number;

  lineTotal: number;

  priceAdjustedByUserId:
    | string
    | null;
};


type SaleFixValues = {
  kind: 'SALE_CONTENT_V1';

  version: string;

  customerId:
    | string
    | null;

  customerName:
    | string
    | null;

  customerPhone:
    | string
    | null;

  subtotalAmount: number;

  discountAmount: number;

  discountReason:
    | string
    | null;

  discountGivenByUserId:
    | string
    | null;

  totalAmount: number;

  /*
   * Money already applied to the sale.
   * This phase never changes it.
   */
  paidAmount: number;

  balanceAmount: number;

  notes:
    | string
    | null;

  items: SaleFixItem[];
};


class SaleFixError extends Error {}


function roundMoney(
  value: number,
) {
  return Math.round(
    value * 100,
  ) / 100;
}


function toMoney(
  value: number,
) {
  return roundMoney(
    value,
  ).toFixed(2);
}


function cleanText(
  value: FormDataEntryValue | null,
) {
  const text =
    String(
      value || '',
    ).trim();

  return text || null;
}


function moneyFromForm(
  value: FormDataEntryValue | null,
  label: string,
) {
  const text =
    String(
      value || '0',
    ).trim();

  if (
    !/^[0-9]+(\.[0-9]{1,2})?$/.test(
      text,
    )
  ) {
    throw new SaleFixError(
      `Enter a valid ${label}.`,
    );
  }

  const number =
    Number(
      text,
    );

  if (
    !Number.isFinite(
      number,
    )
  ) {
    throw new SaleFixError(
      `Enter a valid ${label}.`,
    );
  }

  return roundMoney(
    number,
  );
}


function fixErrorHref(
  saleId: string,
  message: string,
) {
  return (
    `/sales/${saleId}/fix?error=` +
    encodeURIComponent(
      message,
    )
  );
}


function requestsErrorHref(
  message: string,
) {
  return (
    '/requests?error=' +
    encodeURIComponent(
      message,
    )
  );
}


function revalidateSaleFixPaths(
  saleId: string,
) {
  revalidatePath(
    `/sales/${saleId}`,
  );

  revalidatePath(
    `/sales/${saleId}/fix`,
  );

  revalidatePath('/sales');
  revalidatePath('/sales/new');

  revalidatePath('/products');
  revalidatePath('/stock');

  revalidatePath('/customers');
  revalidatePath('/debts');

  revalidatePath('/money');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  revalidatePath('/requests');
}


function parseItems(
  formData: FormData,
): InputItem[] {
  let raw: unknown;

  try {
    raw =
      JSON.parse(
        String(
          formData.get(
            'itemsJson',
          ) || '[]',
        ),
      );
  } catch {
    throw new SaleFixError(
      'Check the sale items.',
    );
  }

  if (
    !Array.isArray(raw) ||
    raw.length === 0
  ) {
    throw new SaleFixError(
      'Keep at least one item on the sale.',
    );
  }

  if (
    raw.length > 50
  ) {
    throw new SaleFixError(
      'Too many sale items.',
    );
  }

  const items =
    raw.map(
      (value) => {
        if (
          !value ||
          typeof value !==
            'object'
        ) {
          throw new SaleFixError(
            'Check the sale items.',
          );
        }

        const record =
          value as Record<
            string,
            unknown
          >;

        const sourceItemId =
          typeof record
            .sourceItemId ===
            'string' &&
          record.sourceItemId
            .trim()
            ? record.sourceItemId
                .trim()
            : null;

        const productId =
          String(
            record.productId ||
              '',
          ).trim();

        const quantity =
          Number(
            record.quantity,
          );

        const unitPrice =
          Number(
            record.unitPrice,
          );

        if (!productId) {
          throw new SaleFixError(
            'Choose a product for every item.',
          );
        }

        if (
          !Number.isInteger(
            quantity,
          ) ||
          quantity < 1
        ) {
          throw new SaleFixError(
            'Quantity must be at least 1.',
          );
        }

        if (
          !Number.isFinite(
            unitPrice,
          ) ||
          unitPrice <= 0
        ) {
          throw new SaleFixError(
            'Selling price must be above zero.',
          );
        }

        return {
          sourceItemId,
          productId,
          quantity,
          unitPrice:
            roundMoney(
              unitPrice,
            ),
        };
      },
    );

  const usedSourceIds =
    items
      .map(
        (item) =>
          item.sourceItemId,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  if (
    new Set(
      usedSourceIds,
    ).size !==
    usedSourceIds.length
  ) {
    throw new SaleFixError(
      'One saved sale item was used more than once.',
    );
  }

  return items;
}


async function getSaleFixValues(
  saleId: string,
): Promise<SaleFixValues> {
  const [sale] =
    await db
      .select()
      .from(sales)
      .where(
        eq(
          sales.id,
          saleId,
        ),
      )
      .limit(1);

  if (!sale) {
    throw new SaleFixError(
      'Sale was not found.',
    );
  }

  const items =
    await db
      .select()
      .from(saleItems)
      .where(
        eq(
          saleItems.saleId,
          saleId,
        ),
      );

  if (
    items.length === 0
  ) {
    throw new SaleFixError(
      'This sale has no saved items.',
    );
  }

  return {
    kind:
      'SALE_CONTENT_V1',

    version:
      sale.updatedAt
        .toISOString(),

    customerId:
      sale.customerId,

    customerName:
      sale.customerName,

    customerPhone:
      sale.customerPhone,

    subtotalAmount:
      Number(
        sale.subtotalAmount,
      ),

    discountAmount:
      Number(
        sale.discountAmount,
      ),

    discountReason:
      sale.discountReason,

    discountGivenByUserId:
      sale
        .discountGivenByUserId,

    totalAmount:
      Number(
        sale.totalAmount,
      ),

    paidAmount:
      Number(
        sale.paidAmount,
      ),

    balanceAmount:
      Number(
        sale.balanceAmount,
      ),

    notes:
      sale.notes,

    items:
      items.map(
        (item) => ({
          id: item.id,

          productId:
            item.productId,

          itemName:
            item.itemName,

          quantity:
            item.quantity,

          baseUnitPrice:
            Number(
              item
                .baseUnitPrice,
            ),

          unitPrice:
            Number(
              item.unitPrice,
            ),

          lineTotal:
            Number(
              item.lineTotal,
            ),

          priceAdjustedByUserId:
            item
              .priceAdjustedByUserId,
        }),
      ),
  };
}


async function prepareAfterValues(
  before: SaleFixValues,
  formData: FormData,
  actorId: string,
): Promise<SaleFixValues> {
  const inputItems =
    parseItems(
      formData,
    );

  const customerId =
    cleanText(
      formData.get(
        'customerId',
      ),
    );

  let customerName:
    | string
    | null = null;

  let customerPhone:
    | string
    | null = null;

  if (customerId) {
    /*
     * An existing historical customer may have been
     * archived after this sale. Keeping that same
     * customer is valid. Choosing a different customer
     * still requires an active customer.
     */
    if (
      customerId ===
      before.customerId
    ) {
      customerName =
        before.customerName;

      customerPhone =
        before.customerPhone;
    } else {
      const [customer] =
        await db
          .select()
          .from(customers)
          .where(
            and(
              eq(
                customers.id,
                customerId,
              ),
              eq(
                customers.status,
                'ACTIVE',
              ),
            ),
          )
          .limit(1);

      if (!customer) {
        throw new SaleFixError(
          'Selected customer was not found.',
        );
      }

      customerName =
        customer.name;

      customerPhone =
        customer.phone;
    }
  }

  const uniqueProductIds =
    [
      ...new Set(
        inputItems.map(
          (item) =>
            item.productId,
        ),
      ),
    ];

  const productRows =
    await db
      .select()
      .from(products)
      .where(
        inArray(
          products.id,
          uniqueProductIds,
        ),
      );

  if (
    productRows.length !==
    uniqueProductIds.length
  ) {
    throw new SaleFixError(
      'One product was not found.',
    );
  }

  const beforeById =
    new Map(
      before.items
        .filter(
          (
            item,
          ): item is SaleFixItem & {
            id: string;
          } =>
            Boolean(
              item.id,
            ),
        )
        .map(
          (item) => [
            item.id,
            item,
          ],
        ),
    );

  const items =
    inputItems.map(
      (input) => {
        const product =
          productRows.find(
            (current) =>
              current.id ===
              input.productId,
          );

        const source =
          input.sourceItemId
            ? beforeById.get(
                input
                  .sourceItemId,
              )
            : null;

        if (
          input.sourceItemId &&
          !source
        ) {
          throw new SaleFixError(
            'One original sale item was not found.',
          );
        }

        const sameProduct =
          Boolean(
            source &&
            source.productId ===
              input.productId,
          );

        /*
         * An archived product may remain on its original
         * historical sale. A newly selected product must
         * still be active.
         */
        if (
          !product ||
          product.itemType !==
            'PRODUCT' ||
          (
            !sameProduct &&
            product.status !==
              'ACTIVE'
          )
        ) {
          throw new SaleFixError(
            'One product is not available.',
          );
        }

        const baseUnitPrice =
          sameProduct &&
          source
            ? source.baseUnitPrice
            : Number(
                product
                  .sellingPrice,
              );

        if (
          baseUnitPrice <= 0
        ) {
          throw new SaleFixError(
            `${product.name} does not have a normal selling price.`,
          );
        }

        if (
          roundMoney(
            input.unitPrice,
          ) <
          roundMoney(
            baseUnitPrice,
          )
        ) {
          throw new SaleFixError(
            `Use the sale discount instead of lowering ${product.name}'s selling price.`,
          );
        }

        const priceChanged =
          !source ||
          roundMoney(
            source.unitPrice,
          ) !==
            roundMoney(
              input.unitPrice,
            );

        const priceAdjustedByUserId =
          input.unitPrice >
          baseUnitPrice
            ? priceChanged
              ? actorId
              : source
                  ?.priceAdjustedByUserId ||
                actorId
            : null;

        const lineTotal =
          roundMoney(
            input.unitPrice *
              input.quantity,
          );

        return {
          id:
            source?.id ||
            null,

          productId:
            product.id,

          itemName:
            sameProduct &&
            source
              ? source.itemName
              : product.name,

          quantity:
            input.quantity,

          baseUnitPrice:
            roundMoney(
              baseUnitPrice,
            ),

          unitPrice:
            roundMoney(
              input.unitPrice,
            ),

          lineTotal,

          priceAdjustedByUserId,
        };
      },
    );

  const subtotalAmount =
    roundMoney(
      items.reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item.lineTotal,
        0,
      ),
    );

  const discountAmount =
    moneyFromForm(
      formData.get(
        'discountAmount',
      ),
      'discount',
    );

  const discountReason =
    cleanText(
      formData.get(
        'discountReason',
      ),
    );

  if (
    discountAmount >
    subtotalAmount
  ) {
    throw new SaleFixError(
      'Discount cannot be more than the sale subtotal.',
    );
  }

  if (
    discountAmount > 0 &&
    !discountReason
  ) {
    throw new SaleFixError(
      'Enter why the discount was given.',
    );
  }

  const totalAmount =
    roundMoney(
      subtotalAmount -
        discountAmount,
    );

  /*
   * Money correction is deliberately separate.
   * Never turn already-paid customer money into
   * an unexplained overpayment here.
   */
  if (
    totalAmount <
    roundMoney(
      before.paidAmount,
    )
  ) {
    throw new SaleFixError(
      'The new sale total is below money already paid. Fix the payment or record the customer refund first.',
    );
  }

  const balanceAmount =
    roundMoney(
      totalAmount -
        before.paidAmount,
    );

  if (
    balanceAmount > 0 &&
    !customerId
  ) {
    throw new SaleFixError(
      'Choose the customer because this corrected sale would have unpaid money.',
    );
  }

  const discountChanged =
    roundMoney(
      discountAmount,
    ) !==
      roundMoney(
        before
          .discountAmount,
      ) ||
    discountReason !==
      before
        .discountReason;

  return {
    kind:
      'SALE_CONTENT_V1',

    version:
      before.version,

    customerId,

    customerName,

    customerPhone,

    subtotalAmount,

    discountAmount,

    discountReason:
      discountAmount > 0
        ? discountReason
        : null,

    discountGivenByUserId:
      discountAmount > 0
        ? discountChanged
          ? actorId
          : before
              .discountGivenByUserId ||
            actorId
        : null,

    totalAmount,

    /*
     * Payment ledger is untouched.
     */
    paidAmount:
      before.paidAmount,

    balanceAmount,

    notes:
      cleanText(
        formData.get(
          'notes',
        ),
      ),

    items,
  };
}


function businessShape(
  value: SaleFixValues,
) {
  return {
    customerId:
      value.customerId,

    customerName:
      value.customerName,

    customerPhone:
      value.customerPhone,

    discountAmount:
      roundMoney(
        value.discountAmount,
      ),

    discountReason:
      value.discountReason,

    totalAmount:
      roundMoney(
        value.totalAmount,
      ),

    notes:
      value.notes,

    items:
      value.items.map(
        (item) => ({
          productId:
            item.productId,

          quantity:
            item.quantity,

          baseUnitPrice:
            roundMoney(
              item
                .baseUnitPrice,
            ),

          unitPrice:
            roundMoney(
              item.unitPrice,
            ),
        }),
      ),
  };
}


function sameBusinessValues(
  before: SaleFixValues,
  after: SaleFixValues,
) {
  return (
    JSON.stringify(
      businessShape(
        before,
      ),
    ) ===
    JSON.stringify(
      businessShape(
        after,
      ),
    )
  );
}


function snapshotValues(
  value:
    Record<string, unknown>,
): SaleFixValues {
  if (
    value.kind !==
      'SALE_CONTENT_V1' ||
    typeof value.version !==
      'string' ||
    !Array.isArray(
      value.items,
    )
  ) {
    throw new SaleFixError(
      'This sale request is no longer valid.',
    );
  }

  return (
    value as unknown as
      SaleFixValues
  );
}


function sameSavedItems(
  current:
    Array<
      typeof saleItems.$inferSelect
    >,
  before: SaleFixValues,
) {
  if (
    current.length !==
    before.items.length
  ) {
    return false;
  }

  const currentById =
    new Map(
      current.map(
        (item) => [
          item.id,
          item,
        ],
      ),
    );

  return before.items.every(
    (saved) => {
      if (!saved.id) {
        return false;
      }

      const item =
        currentById.get(
          saved.id,
        );

      if (!item) {
        return false;
      }

      return (
        item.productId ===
          saved.productId &&
        item.quantity ===
          saved.quantity &&
        roundMoney(
          Number(
            item.unitPrice,
          ),
        ) ===
          roundMoney(
            saved.unitPrice,
          ) &&
        roundMoney(
          Number(
            item
              .baseUnitPrice,
          ),
        ) ===
          roundMoney(
            saved
              .baseUnitPrice,
          )
      );
    },
  );
}


async function applySaleFix(
  saleId: string,
  before: SaleFixValues,
  after: SaleFixValues,
  actorId: string,
  reason: string,
  pendingCorrectionId:
    | string
    | null,
) {
  await db.transaction(
    async (tx) => {
      await tx.execute(sql`
        SELECT id
        FROM sales
        WHERE id = ${saleId}
        FOR UPDATE
      `);

      const [currentSale] =
        await tx
          .select()
          .from(sales)
          .where(
            eq(
              sales.id,
              saleId,
            ),
          )
          .limit(1);

      if (!currentSale) {
        throw new SaleFixError(
          'Sale was not found.',
        );
      }

      if (
        currentSale
          .updatedAt
          .toISOString() !==
        before.version
      ) {
        throw new SaleFixError(
          pendingCorrectionId
            ? 'This sale changed after the request was sent. Review the sale again before approving.'
            : 'This sale has already changed. Open it again before saving.',
        );
      }

      const currentItems =
        await tx
          .select()
          .from(saleItems)
          .where(
            eq(
              saleItems.saleId,
              saleId,
            ),
          );

      if (
        !sameSavedItems(
          currentItems,
          before,
        )
      ) {
        throw new SaleFixError(
          'The saved sale items changed. Open the sale again before applying this fix.',
        );
      }

      /*
       * The currently saved sale items are already counted
       * inside Sold.
       *
       * Lock all affected Product ledgers and calculate what
       * Remaining would become after this correction.
       */
      const oldQuantity =
        new Map<
          string,
          number
        >();

      const newQuantity =
        new Map<
          string,
          number
        >();

      for (
        const item of
        currentItems
      ) {
        oldQuantity.set(
          item.productId,
          (
            oldQuantity.get(
              item.productId,
            ) || 0
          ) +
            item.quantity,
        );
      }

      for (
        const item of
        after.items
      ) {
        newQuantity.set(
          item.productId,
          (
            newQuantity.get(
              item.productId,
            ) || 0
          ) +
            item.quantity,
        );
      }

      const productIds = [
        ...new Set([
          ...oldQuantity.keys(),
          ...newQuantity.keys(),
        ]),
      ];

      await lockProductLedgers(
        tx,
        productIds,
      );

      const lockedProducts =
        productIds.length > 0
          ? await tx
              .select({
                id:
                  products.id,

                name:
                  products.name,

                status:
                  products.status,

                itemType:
                  products.itemType,
              })
              .from(products)
              .where(
                inArray(
                  products.id,
                  productIds,
                ),
              )
          : [];

      if (
        lockedProducts.length !==
        productIds.length
      ) {
        throw new SaleFixError(
          'One product was not found.',
        );
      }

      for (
        const productId of
        productIds
      ) {
        const oldQty =
          oldQuantity.get(
            productId,
          ) || 0;

        const newQty =
          newQuantity.get(
            productId,
          ) || 0;

        const product =
          lockedProducts.find(
            (current) =>
              current.id ===
              productId,
          );

        if (
          !product ||
          product.itemType !==
            'PRODUCT'
        ) {
          throw new SaleFixError(
            'One product is not available.',
          );
        }

        /*
         * Existing historical products may be archived.
         * A newly introduced Product must still be active
         * when the correction is actually applied.
         */
        if (
          oldQty === 0 &&
          newQty > 0 &&
          product.status !==
            'ACTIVE'
        ) {
          throw new SaleFixError(
            `${product.name} is no longer available.`,
          );
        }

        const ledger =
          await getProductLedgerTotals(
            tx,
            productId,
          );

        /*
         * Current sale quantity is already inside ledger.sold,
         * so add the old quantity back before applying the
         * corrected quantity.
         */
        const finalRemaining =
          ledger.remaining +
          oldQty -
          newQty;

        if (
          finalRemaining < 0
        ) {
          throw new SaleFixError(
            `There is not enough stock for ${product.name}.`,
          );
        }
      }

      await tx
        .delete(
          saleItems,
        )
        .where(
          eq(
            saleItems.saleId,
            saleId,
          ),
        );

      await tx
        .insert(
          saleItems,
        )
        .values(
          after.items.map(
            (item) => ({
              saleId,

              productId:
                item.productId,

              itemName:
                item.itemName,

              itemType:
                'PRODUCT' as const,

              quantity:
                item.quantity,

              baseUnitPrice:
                toMoney(
                  item
                    .baseUnitPrice,
                ),

              unitPrice:
                toMoney(
                  item.unitPrice,
                ),

              lineTotal:
                toMoney(
                  item.lineTotal,
                ),

              priceAdjustedByUserId:
                item
                  .priceAdjustedByUserId,
            }),
          ),
        );

      for (
        const productId of
        productIds
      ) {
        await reconcileProductLedgerQuantity(
          tx,
          productId,
        );
      }

      const now =
        new Date();

      await tx
        .update(sales)
        .set({
          customerId:
            after.customerId,

          customerName:
            after.customerName,

          customerPhone:
            after.customerPhone,

          subtotalAmount:
            toMoney(
              after
                .subtotalAmount,
            ),

          discountAmount:
            toMoney(
              after
                .discountAmount,
            ),

          discountReason:
            after
              .discountAmount >
            0
              ? after
                  .discountReason
              : null,

          discountGivenByUserId:
            after
              .discountAmount >
            0
              ? after
                  .discountGivenByUserId
              : null,

          totalAmount:
            toMoney(
              after
                .totalAmount,
            ),

          /*
           * Keep already-received money exactly as recorded.
           */
          paidAmount:
            toMoney(
              before
                .paidAmount,
            ),

          balanceAmount:
            toMoney(
              after
                .balanceAmount,
            ),

          notes:
            after.notes,

          updatedAt:
            now,
        })
        .where(
          eq(
            sales.id,
            saleId,
          ),
        );

      if (
        pendingCorrectionId
      ) {
        const applied =
          await tx
            .update(
              corrections,
            )
            .set({
              status:
                'APPLIED',

              reviewedByUserId:
                actorId,

              reviewedAt:
                now,

              appliedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  corrections.id,
                  pendingCorrectionId,
                ),
                eq(
                  corrections.status,
                  'PENDING',
                ),
              ),
            )
            .returning({
              id:
                corrections.id,
            });

        if (
          applied.length ===
          0
        ) {
          throw new SaleFixError(
            'This request has already been handled.',
          );
        }
      } else {
        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'SALE',

            targetId:
              saleId,

            targetLabel:
              `Sale / ${
                before
                  .customerName ||
                'Walk-in customer'
              }`,

            requestedByUserId:
              actorId,

            reviewedByUserId:
              actorId,

            status:
              'APPLIED',

            beforeValues:
              before as unknown as
                Record<
                  string,
                  unknown
                >,

            afterValues:
              after as unknown as
                Record<
                  string,
                  unknown
                >,

            reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      }
    },
  );
}


export async function submitSaleFixAction(
  formData: FormData,
) {
  const user =
    await requireUser();

  const saleId =
    String(
      formData.get(
        'saleId',
      ) || '',
    ).trim();

  if (!saleId) {
    redirect('/sales');
  }

  const reason =
    cleanText(
      formData.get(
        'reason',
      ),
    );

  if (!reason) {
    redirect(
      fixErrorHref(
        saleId,
        'Explain what was entered wrong.',
      ),
    );
  }

  let before:
    SaleFixValues;

  let after:
    SaleFixValues;

  try {
    before =
      await getSaleFixValues(
        saleId,
      );

    after =
      await prepareAfterValues(
        before,
        formData,
        user.id,
      );
  } catch (error) {
    if (
      error instanceof
      SaleFixError
    ) {
      redirect(
        fixErrorHref(
          saleId,
          error.message,
        ),
      );
    }

    throw error;
  }

  if (
    sameBusinessValues(
      before,
      after,
    )
  ) {
    redirect(
      fixErrorHref(
        saleId,
        'Nothing was changed.',
      ),
    );
  }

  const [pending] =
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
            'SALE',
          ),
          eq(
            corrections.targetId,
            saleId,
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  if (pending) {
    redirect(
      fixErrorHref(
        saleId,
        user.role ===
          'OWNER'
          ? 'A request is already waiting for this sale. Review it first.'
          : 'A request for this sale is already waiting for the owner.',
      ),
    );
  }

  if (
    user.role ===
    'EMPLOYEE'
  ) {
    await db
      .insert(
        corrections,
      )
      .values({
        targetType:
          'SALE',

        targetId:
          saleId,

        targetLabel:
          `Sale / ${
            before
              .customerName ||
            'Walk-in customer'
          }`,

        requestedByUserId:
          user.id,

        status:
          'PENDING',

        beforeValues:
          before as unknown as
            Record<
              string,
              unknown
            >,

        afterValues:
          after as unknown as
            Record<
              string,
              unknown
            >,

        reason,
      });

    revalidateSaleFixPaths(
      saleId,
    );

    redirect(
      `/sales/${saleId}?request=1`,
    );
  }

  try {
    await applySaleFix(
      saleId,
      before,
      after,
      user.id,
      reason,
      null,
    );
  } catch (error) {
    if (
      error instanceof
      SaleFixError
    ) {
      redirect(
        fixErrorHref(
          saleId,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateSaleFixPaths(
    saleId,
  );

  redirect(
    `/sales/${saleId}?fixed=1`,
  );
}


export async function approveSaleFixRequestAction(
  formData: FormData,
) {
  const owner =
    await requireOwner();

  const correctionId =
    String(
      formData.get(
        'correctionId',
      ) || '',
    ).trim();

  if (!correctionId) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  const [request] =
    await db
      .select()
      .from(
        corrections,
      )
      .where(
        and(
          eq(
            corrections.id,
            correctionId,
          ),
          eq(
            corrections.targetType,
            'SALE',
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  if (!request) {
    redirect(
      requestsErrorHref(
        'Request was not found.',
      ),
    );
  }

  let before:
    SaleFixValues;

  let after:
    SaleFixValues;

  try {
    before =
      snapshotValues(
        request
          .beforeValues,
      );

    after =
      snapshotValues(
        request
          .afterValues,
      );

    await applySaleFix(
      request.targetId,
      before,
      after,
      owner.id,
      request.reason,
      request.id,
    );
  } catch (error) {
    if (
      error instanceof
      SaleFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateSaleFixPaths(
    request.targetId,
  );

  redirect(
    '/requests?approved=1',
  );
}
