'use server';

import { requirePermission } from '@/lib/auth/require-permission';

import {
  and,
  eq,
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
  cashDrawerMovements,
  corrections,
  salePayments,
  sales,
} from '@mossetech/db/schema';

import {
  requireOwner,
} from '@/lib/auth/session';

import {
  getLockedCurrentDrawerState,
} from '@/lib/cash-drawer/locking';


type PaymentMethod =
  | 'CASH'
  | 'MOBILE_MONEY'
  | 'BANK'
  | 'CARD';


type PaymentFixValues = {
  kind:
    | 'SALE_PAYMENT_V1'
    | 'SALE_PAYMENT_V2';

  saleVersion: string;

  paymentId: string;

  paymentType:
    | 'AT_SALE'
    | 'LATER_PAYMENT';

  paymentMethod:
    PaymentMethod;

  receivedAmount: number;
  appliedAmount: number;
  returnedAmount: number;

  returnMethod:
    | PaymentMethod
    | null;

  extraKeptAmount: number;

  extraReason:
    | string
    | null;

  notes:
    | string
    | null;

  paidAt: string;

  receivedByUserId:
    | string
    | null;
};


class PaymentFixError extends Error {}


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
  value:
    | FormDataEntryValue
    | null,
) {
  const text =
    String(
      value || '',
    ).trim();

  return text || null;
}


function parsePaymentMethod(
  value:
    | FormDataEntryValue
    | null,
): PaymentMethod {
  const method =
    String(
      value || '',
    );

  if (
    method !== 'CASH' &&
    method !== 'MOBILE_MONEY' &&
    method !== 'BANK' &&
    method !== 'CARD'
  ) {
    throw new PaymentFixError(
      'Choose the payment method.',
    );
  }

  return method;
}


function moneyFromForm(
  value:
    | FormDataEntryValue
    | null,
  label: string,
) {
  const text =
    String(
      value ?? '0',
    ).trim() || '0';

  if (
    !/^[0-9]+(\.[0-9]{1,2})?$/.test(
      text,
    )
  ) {
    throw new PaymentFixError(
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
    throw new PaymentFixError(
      `Enter a valid ${label}.`,
    );
  }

  return roundMoney(
    number,
  );
}


function paymentFixErrorHref(
  saleId: string,
  message: string,
) {
  return (
    `/sales/${saleId}/payment-fix?error=` +
    encodeURIComponent(
      message,
    )
  );
}


function laterPaymentFixErrorHref(
  saleId: string,
  paymentId: string,
  message: string,
) {
  return (
    `/sales/${saleId}/later-payment-fix/${paymentId}?error=` +
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


function revalidatePaymentPaths(
  saleId: string,
) {
  revalidatePath(
    `/sales/${saleId}`,
  );

  revalidatePath(
    `/sales/${saleId}/payment-fix`,
  );

  revalidatePath('/sales');
  revalidatePath('/debts');
  revalidatePath('/customers');

  revalidatePath('/money');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  revalidatePath('/requests');
}


function snapshotValues(
  value:
    Record<
      string,
      unknown
    >,
): PaymentFixValues {
  if (
    (
      value.kind !==
        'SALE_PAYMENT_V1' &&
      value.kind !==
        'SALE_PAYMENT_V2'
    ) ||
    typeof value.paymentId !==
      'string' ||
    !value.paymentId ||
    (
      value.paymentType !==
        'AT_SALE' &&
      value.paymentType !==
        'LATER_PAYMENT'
    )
  ) {
    throw new PaymentFixError(
      'This payment request is no longer valid.',
    );
  }

  return value as unknown as
    PaymentFixValues;
}


function paymentSnapshot(
  sale:
    typeof sales.$inferSelect,
  payment:
    typeof salePayments.$inferSelect,
): PaymentFixValues {
  return {
    kind:
      'SALE_PAYMENT_V2',

    saleVersion:
      sale.updatedAt
        .toISOString(),

    paymentId:
      payment.id,

    paymentType:
      payment.paymentType,

    paymentMethod:
      payment.paymentMethod,

    receivedAmount:
      Number(
        payment.receivedAmount,
      ),

    appliedAmount:
      Number(
        payment.appliedAmount,
      ),

    returnedAmount:
      Number(
        payment.returnedAmount,
      ),

    returnMethod:
      payment.returnMethod,

    extraKeptAmount:
      Number(
        payment.extraKeptAmount,
      ),

    extraReason:
      payment.extraReason,

    notes:
      payment.notes,

    paidAt:
      payment.paidAt
        .toISOString(),

    receivedByUserId:
      payment.receivedByUserId,
  };
}


function samePayment(
  payment:
    typeof salePayments.$inferSelect,
  before:
    PaymentFixValues,
) {
  return (
    payment.id ===
      before.paymentId &&

    payment.paymentType ===
      before.paymentType &&

    payment.paymentMethod ===
      before.paymentMethod &&

    roundMoney(
      Number(
        payment.receivedAmount,
      ),
    ) ===
      roundMoney(
        before.receivedAmount,
      ) &&

    roundMoney(
      Number(
        payment.appliedAmount,
      ),
    ) ===
      roundMoney(
        before.appliedAmount,
      ) &&

    roundMoney(
      Number(
        payment.returnedAmount,
      ),
    ) ===
      roundMoney(
        before.returnedAmount,
      ) &&

    payment.returnMethod ===
      before.returnMethod &&

    roundMoney(
      Number(
        payment.extraKeptAmount,
      ),
    ) ===
      roundMoney(
        before.extraKeptAmount,
      ) &&

    payment.extraReason ===
      before.extraReason &&

    payment.notes ===
      before.notes &&

    payment.receivedByUserId ===
      before.receivedByUserId &&

    payment.paidAt
      .toISOString() ===
      before.paidAt
  );
}


function cashEffect(
  payment:
    PaymentFixValues,
) {
  let total = 0;

  if (
    payment.paymentMethod ===
    'CASH'
  ) {
    total +=
      payment.receivedAmount;
  }

  if (
    payment.returnMethod ===
    'CASH'
  ) {
    total -=
      payment.returnedAmount;
  }

  return roundMoney(
    total,
  );
}


function validatePaymentAfter(
  sale:
    typeof sales.$inferSelect,
  after:
    PaymentFixValues,
  otherApplied: number,
) {
  if (
    after.receivedAmount < 0 ||
    after.returnedAmount < 0 ||
    after.extraKeptAmount < 0
  ) {
    throw new PaymentFixError(
      'Money amounts cannot be below zero.',
    );
  }

  const appliedAmount =
    roundMoney(
      after.receivedAmount -
      after.returnedAmount -
      after.extraKeptAmount,
    );

  if (
    appliedAmount < 0
  ) {
    throw new PaymentFixError(
      'Returned money and extra kept cannot be more than money received.',
    );
  }

  if (
    roundMoney(
      appliedAmount,
    ) !==
    roundMoney(
      after.appliedAmount,
    )
  ) {
    throw new PaymentFixError(
      'The payment amounts do not add up.',
    );
  }

  if (
    after.extraKeptAmount > 0 &&
    !after.extraReason
  ) {
    throw new PaymentFixError(
      'Explain why extra customer money was kept.',
    );
  }

  const saleTotal =
    roundMoney(
      Number(
        sale.totalAmount,
      ),
    );

  const newPaidAmount =
    roundMoney(
      otherApplied +
      appliedAmount,
    );

  if (
    newPaidAmount >
    saleTotal
  ) {
    throw new PaymentFixError(
      'This payment would make the sale overpaid. Account for the extra money as returned or extra kept.',
    );
  }

  const balanceAmount =
    roundMoney(
      saleTotal -
      newPaidAmount,
    );

  if (
    (
      after.returnedAmount > 0 ||
      after.extraKeptAmount > 0
    ) &&
    balanceAmount > 0
  ) {
    throw new PaymentFixError(
      'Only record returned money or extra kept when the sale is fully paid.',
    );
  }

  if (
    balanceAmount > 0 &&
    !sale.customerId
  ) {
    throw new PaymentFixError(
      'This fix would leave unpaid money. Add the customer to the sale first.',
    );
  }

  return {
    newPaidAmount,
    balanceAmount,
  };
}


function changed(
  before:
    PaymentFixValues,
  after:
    PaymentFixValues,
) {
  return (
    before.paymentMethod !==
      after.paymentMethod ||

    roundMoney(
      before.receivedAmount,
    ) !==
      roundMoney(
        after.receivedAmount,
      ) ||

    roundMoney(
      before.returnedAmount,
    ) !==
      roundMoney(
        after.returnedAmount,
      ) ||

    roundMoney(
      before.extraKeptAmount,
    ) !==
      roundMoney(
        after.extraKeptAmount,
      ) ||

    before.extraReason !==
      after.extraReason
  );
}


async function buildAfter(
  sale:
    typeof sales.$inferSelect,
  payment:
    typeof salePayments.$inferSelect,
  activePayments:
    Array<
      typeof salePayments.$inferSelect
    >,
  formData:
    FormData,
) {
  const before =
    paymentSnapshot(
      sale,
      payment,
    );

  const paymentMethod =
    parsePaymentMethod(
      formData.get(
        'paymentMethod',
      ),
    );

  const receivedAmount =
    moneyFromForm(
      formData.get(
        'receivedAmount',
      ),
      'amount received',
    );

  const isLaterPayment =
    payment.paymentType ===
    'LATER_PAYMENT';

  const returnedAmount =
    isLaterPayment
      ? 0
      : moneyFromForm(
          formData.get(
            'returnedAmount',
          ),
          paymentMethod ===
            'CASH'
            ? 'change returned'
            : 'amount refunded',
        );

  const extraKeptAmount =
    isLaterPayment
      ? 0
      : moneyFromForm(
          formData.get(
            'extraKeptAmount',
          ),
          'extra kept amount',
        );

  const extraReason =
    !isLaterPayment &&
    extraKeptAmount > 0
      ? cleanText(
          formData.get(
            'extraReason',
          ),
        )
      : null;

  const appliedAmount =
    roundMoney(
      receivedAmount -
      returnedAmount -
      extraKeptAmount,
    );

  const after:
    PaymentFixValues = {
      ...before,

      paymentMethod,

      receivedAmount,
      appliedAmount,

      returnedAmount,

      returnMethod:
        returnedAmount > 0
          ? paymentMethod
          : null,

      extraKeptAmount,
      extraReason,
  };

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

  validatePaymentAfter(
    sale,
    after,
    otherApplied,
  );

  return {
    before,
    after,
  };
}


async function applyPaymentFix(
  saleId: string,
  before:
    PaymentFixValues,
  after:
    PaymentFixValues,
  actorId: string,
  reason: string,
  pendingCorrectionId:
    | string
    | null,
) {
  await db.transaction(
    async (tx) => {
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
        throw new PaymentFixError(
          'Sale was not found.',
        );
      }

      if (
        currentSale.updatedAt
          .toISOString() !==
        before.saleVersion
      ) {
        throw new PaymentFixError(
          'The sale changed after this fix was prepared. Open it again and check the payment.',
        );
      }

      const [currentPayment] =
        await tx
          .select()
          .from(
            salePayments,
          )
          .where(
            and(
              eq(
                salePayments.id,
                before.paymentId,
              ),
              eq(
                salePayments.saleId,
                saleId,
              ),
              eq(
                salePayments.paymentType,
                before.paymentType,
              ),
              eq(
                salePayments.isActive,
                true,
              ),
            ),
          )
          .limit(1);

      if (
        !currentPayment ||
        !samePayment(
          currentPayment,
          before,
        )
      ) {
        throw new PaymentFixError(
          'The payment changed after this fix was prepared. Open it again and check the payment.',
        );
      }

      const activePayments =
        await tx
          .select()
          .from(
            salePayments,
          )
          .where(
            and(
              eq(
                salePayments.saleId,
                saleId,
              ),
              eq(
                salePayments.isActive,
                true,
              ),
            ),
          );

      const otherApplied =
        activePayments
          .filter(
            (current) =>
              current.id !==
              currentPayment.id,
          )
          .reduce(
            (sum, current) =>
              sum +
              Number(
                current.appliedAmount,
              ),
            0,
          );

      const {
        newPaidAmount,
        balanceAmount,
      } =
        validatePaymentAfter(
          currentSale,
          after,
          otherApplied,
        );

      const now =
        new Date();

      const replaced =
        await tx
          .update(
            salePayments,
          )
          .set({
            isActive:
              false,

            replacedAt:
              now,

            replacedByUserId:
              actorId,
          })
          .where(
            and(
              eq(
                salePayments.id,
                currentPayment.id,
              ),
              eq(
                salePayments.isActive,
                true,
              ),
            ),
          )
          .returning({
            id:
              salePayments.id,
          });

      if (
        replaced.length !== 1
      ) {
        throw new PaymentFixError(
          'The payment changed. Open it again and try once more.',
        );
      }

      await tx
        .insert(
          salePayments,
        )
        .values({
          saleId,

          receivedByUserId:
            before
              .receivedByUserId,

          paymentType:
            before.paymentType,

          paymentMethod:
            after
              .paymentMethod,

          receivedAmount:
            toMoney(
              after
                .receivedAmount,
            ),

          appliedAmount:
            toMoney(
              after
                .appliedAmount,
            ),

          returnedAmount:
            toMoney(
              after
                .returnedAmount,
            ),

          returnMethod:
            after
              .returnMethod,

          extraKeptAmount:
            toMoney(
              after
                .extraKeptAmount,
            ),

          extraReason:
            after
              .extraReason,

          notes:
            before.notes,

          paidAt:
            new Date(
              before.paidAt,
            ),

          createdAt:
            now,
        });

      const drawerState =
        await getLockedCurrentDrawerState(
          tx,
        );

      const openDrawer =
        drawerState?.drawer;

      if (
        openDrawer &&
        new Date(
          before.paidAt,
        ).getTime() >=
          openDrawer.openedAt
            .getTime()
      ) {
        const cashDifference =
          roundMoney(
            cashEffect(
              after,
            ) -
            cashEffect(
              before,
            ),
          );

        if (
          cashDifference < 0 &&
          Math.abs(
            cashDifference,
          ) >
            drawerState.expectedCash
        ) {
          throw new PaymentFixError(
            `Not enough drawer cash. Expected cash is RWF ${drawerState.expectedCash.toLocaleString(
              'en-US',
            )}.`,
          );
        }

        if (
          cashDifference !== 0
        ) {
          await tx
            .insert(
              cashDrawerMovements,
            )
            .values({
              drawerId:
                openDrawer.id,

              createdByUserId:
                actorId,

              movementType:
                'PAYMENT_CORRECTION',

              direction:
                cashDifference > 0
                  ? 'IN'
                  : 'OUT',

              amount:
                toMoney(
                  Math.abs(
                    cashDifference,
                  ),
                ),

              reason:
                `Payment fix / ${reason}`,

              saleId,
            });
        }
      }

      if (
        before.paymentType ===
          'AT_SALE' &&
        activePayments.filter(
          (payment) =>
            payment.paymentType === 'AT_SALE',
        ).length === 1
      ) {
        await tx
          .update(
            sales,
          )
          .set({
            /*
             * These remain the compatibility snapshot
             * for the original at-sale payment only.
             * The permanent source is sale_payments.
             */
            paymentMethod:
              after
                .paymentMethod,

            amountReceived:
              toMoney(
                after
                  .receivedAmount,
              ),

            changeReturned:
              toMoney(
                after
                  .returnedAmount,
              ),

            extraKept:
              toMoney(
                after
                  .extraKeptAmount,
              ),

            extraReason:
              after
                .extraReason,

            paidAmount:
              toMoney(
                newPaidAmount,
              ),

            balanceAmount:
              toMoney(
                balanceAmount,
              ),

            updatedAt:
              now,
          })
          .where(
            eq(
              sales.id,
              saleId,
            ),
          );
      } else {
        /*
         * A later-payment fix changes only the current
         * paid/unpaid position. It must never overwrite
         * the original sale-payment compatibility fields.
         */
        await tx
          .update(
            sales,
          )
          .set({
            paidAmount:
              toMoney(
                newPaidAmount,
              ),

            balanceAmount:
              toMoney(
                balanceAmount,
              ),

            updatedAt:
              now,
          })
          .where(
            eq(
              sales.id,
              saleId,
            ),
          );
      }

      const beforeJson =
        before as unknown as
          Record<
            string,
            unknown
          >;

      const afterJson =
        after as unknown as
          Record<
            string,
            unknown
          >;

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

              beforeValues:
                beforeJson,

              afterValues:
                afterJson,

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
                  corrections.targetType,
                  'SALE_PAYMENT',
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
          applied.length !== 1
        ) {
          throw new PaymentFixError(
            'This request is no longer waiting for approval.',
          );
        }
      } else {
        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'SALE_PAYMENT',

            targetId:
              saleId,

            targetLabel:
              `Sale payment / ${
                currentSale
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
              beforeJson,

            afterValues:
              afterJson,

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


export async function submitAtSalePaymentFixAction(
  formData: FormData,
) {
  const user =
    await requirePermission('sales.correct');

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
      paymentFixErrorHref(
        saleId,
        'Explain what was entered wrong.',
      ),
    );
  }

  try {
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
      throw new PaymentFixError(
        'Sale was not found.',
      );
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
              saleId,
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
      String(formData.get('paymentId') || '').trim();

    const payment =
      selectedPaymentId
        ? atSalePayments.find(
            (item) => item.id === selectedPaymentId,
          )
        : atSalePayments.length === 1
          ? atSalePayments[0]
          : undefined;

    if (!payment) {
      throw new PaymentFixError(
        'The selected original payment could not be found.',
      );
    }

    const {
      before,
      after,
    } =
      await buildAfter(
        sale,
        payment,
        activePayments,
        formData,
      );

    if (
      !changed(
        before,
        after,
      )
    ) {
      throw new PaymentFixError(
        'Nothing was changed.',
      );
    }

    if (
      user.role ===
      'EMPLOYEE'
    ) {
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
                'SALE_PAYMENT',
              ),
              eq(
                corrections.targetId,
                saleId,
              ),
              eq(
                corrections.status,
                'PENDING',
              ),
              sql`${corrections.beforeValues}->>'paymentId' = ${payment.id}`,
            ),
          )
          .limit(1);

      if (pending) {
        throw new PaymentFixError(
          'A payment fix request is already waiting for the owner.',
        );
      }

      await db
        .insert(
          corrections,
        )
        .values({
          targetType:
            'SALE_PAYMENT',

          targetId:
            saleId,

          targetLabel:
            `Sale payment / ${
              sale
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

      revalidatePaymentPaths(
        saleId,
      );

      redirect(
        `/sales/${saleId}?paymentRequest=1`,
      );
    }

    await applyPaymentFix(
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
      PaymentFixError
    ) {
      redirect(
        paymentFixErrorHref(
          saleId,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidatePaymentPaths(
    saleId,
  );

  redirect(
    `/sales/${saleId}?paymentFixed=1`,
  );
}



export async function submitLaterPaymentFixAction(
  formData: FormData,
) {
  const user =
    await requirePermission('sales.correct');

  const saleId =
    String(
      formData.get(
        'saleId',
      ) || '',
    ).trim();

  const paymentId =
    String(
      formData.get(
        'paymentId',
      ) || '',
    ).trim();

  if (
    !saleId ||
    !paymentId
  ) {
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
      laterPaymentFixErrorHref(
        saleId,
        paymentId,
        'Explain what was entered wrong.',
      ),
    );
  }

  try {
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
      throw new PaymentFixError(
        'Sale was not found.',
      );
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
              saleId,
            ),
            eq(
              salePayments.isActive,
              true,
            ),
          ),
        );

    const payment =
      activePayments.find(
        (current) =>
          current.id ===
            paymentId &&
          current.paymentType ===
            'LATER_PAYMENT',
      );

    if (!payment) {
      throw new PaymentFixError(
        'This later payment could not be found.',
      );
    }

    const {
      before,
      after,
    } =
      await buildAfter(
        sale,
        payment,
        activePayments,
        formData,
      );

    if (
      !changed(
        before,
        after,
      )
    ) {
      throw new PaymentFixError(
        'Nothing was changed.',
      );
    }

    if (
      user.role ===
      'EMPLOYEE'
    ) {
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
                'SALE_PAYMENT',
              ),
              eq(
                corrections.targetId,
                saleId,
              ),
              eq(
                corrections.status,
                'PENDING',
              ),
              sql`${corrections.beforeValues}->>'paymentId' = ${payment.id}`,
            ),
          )
          .limit(1);

      if (pending) {
        throw new PaymentFixError(
          'This payment fix is already waiting for the owner.',
        );
      }

      await db
        .insert(
          corrections,
        )
        .values({
          targetType:
            'SALE_PAYMENT',

          targetId:
            saleId,

          targetLabel:
            `Later payment / ${
              sale.customerName ||
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

      revalidatePaymentPaths(
        saleId,
      );

      redirect(
        `/sales/${saleId}?paymentRequest=1`,
      );
    }

    await applyPaymentFix(
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
      PaymentFixError
    ) {
      redirect(
        laterPaymentFixErrorHref(
          saleId,
          paymentId,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidatePaymentPaths(
    saleId,
  );

  redirect(
    `/sales/${saleId}?paymentFixed=1`,
  );
}


export async function approvePaymentFixRequestAction(
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
            'SALE_PAYMENT',
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

  try {
    const before =
      snapshotValues(
        request
          .beforeValues,
      );

    const after =
      snapshotValues(
        request
          .afterValues,
      );

    await applyPaymentFix(
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
      PaymentFixError
    ) {
      redirect(
        requestsErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidatePaymentPaths(
    request.targetId,
  );

  redirect(
    '/requests?approved=1',
  );
}
