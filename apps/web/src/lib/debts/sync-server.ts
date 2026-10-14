import {
  eq,
  sql,
} from 'drizzle-orm';

import {
  db,
} from '@mossetech/db/client';

import {
  cashDrawerMovements,
  cashDrawers,
  debtPayments,
  salePayments,
  sales,
} from '@mossetech/db/schema';

import {
  debtPaymentSchema,
} from '@mossetech/validators/debt';

type DbTransaction =
  Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0];

type SyncUser = {
  id: string;
};

type DebtPaymentPayload = {
  saleId?: unknown;
  paymentMethod?: unknown;
  amount?: unknown;
  notes?: unknown;
  cashDrawerId?: unknown;
};

export class DebtPaymentSyncError
  extends Error {
  status: number;

  constructor(
    message: string,
    status = 422,
  ) {
    super(message);

    this.name =
      'DebtPaymentSyncError';

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
    throw new DebtPaymentSyncError(
      'The cash drawer reference is invalid.',
      400,
    );
  }

  return value;
}

async function resolveCashDrawer(
  tx: DbTransaction,
  drawerId: string,
  paymentTime: Date,
) {
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
    throw new DebtPaymentSyncError(
      'The cash drawer used for this payment was not found.',
      409,
    );
  }

  const happenedAfterOpen =
    paymentTime.getTime() >=
    drawer.openedAt.getTime();

  const happenedBeforeClose =
    !drawer.closedAt ||
    paymentTime.getTime() <=
      drawer.closedAt
        .getTime();

  if (
    !happenedAfterOpen ||
    !happenedBeforeClose
  ) {
    throw new DebtPaymentSyncError(
      'This cash payment does not belong to the recorded drawer session.',
      409,
    );
  }

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
          cashDrawerMovements.drawerId,
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

  const differenceType =
    difference > 0
      ? 'EXTRA'
      : difference < 0
        ? 'MISSING'
        : 'NONE';

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

      differenceType,

      differenceReason:
        differenceType ===
          'NONE'
          ? null
          : drawer
              .differenceReason ||
            'Adjusted after an offline customer payment synchronized.',

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

export async function executeDebtPaymentSync(
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
    throw new DebtPaymentSyncError(
      'Invalid payment information.',
      400,
    );
  }

  const raw =
    payload as DebtPaymentPayload;

  const parsed =
    debtPaymentSchema.safeParse({
      saleId:
        raw.saleId,

      paymentMethod:
        raw.paymentMethod,

      amount:
        raw.amount,

      notes:
        raw.notes ||
        undefined,
    });

  if (!parsed.success) {
    throw new DebtPaymentSyncError(
      parsed.error
        .issues[0]
        ?.message ||
        'Check the payment information.',
      400,
    );
  }

  const amount =
    Number(
      parsed.data.amount,
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new DebtPaymentSyncError(
      'Payment amount must be above zero.',
      400,
    );
  }

  const cashDrawerId =
    validDrawerId(
      raw.cashDrawerId,
    );

  /*
   * Serialize all payments against this sale.
   *
   * A payment recorded offline must be checked
   * against the balance that exists when it
   * eventually reaches the server.
   */
  await tx.execute(sql`
    SELECT id
    FROM sales
    WHERE id = ${parsed.data.saleId}
    FOR UPDATE
  `);

  const [sale] =
    await tx
      .select()
      .from(
        sales,
      )
      .where(
        eq(
          sales.id,
          parsed.data.saleId,
        ),
      )
      .limit(1);

  if (!sale) {
    throw new DebtPaymentSyncError(
      'Debt was not found.',
      404,
    );
  }

  const currentBalance =
    roundMoney(
      Number(
        sale.balanceAmount,
      ),
    );

  if (
    currentBalance <= 0
  ) {
    throw new DebtPaymentSyncError(
      'This debt is already cleared.',
      409,
    );
  }

  if (
    roundMoney(
      amount,
    ) >
    currentBalance
  ) {
    throw new DebtPaymentSyncError(
      'The unpaid amount changed while this payment was waiting to sync. Review the current balance before recording it again.',
      409,
    );
  }

  let drawer:
    | typeof cashDrawers.$inferSelect
    | null = null;

  if (
    parsed.data
      .paymentMethod ===
    'CASH'
  ) {
    if (!cashDrawerId) {
      throw new DebtPaymentSyncError(
        'This cash payment is missing its cash drawer.',
        409,
      );
    }

    drawer =
      await resolveCashDrawer(
        tx,
        cashDrawerId,
        clientCreatedAt,
      );
  }

  const amountMoney =
    toMoney(
      roundMoney(
        amount,
      ),
    );

  await tx
    .update(
      sales,
    )
    .set({
      paidAmount:
        sql`${sales.paidAmount} + ${amountMoney}`,

      balanceAmount:
        sql`${sales.balanceAmount} - ${amountMoney}`,

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        sales.id,
        sale.id,
      ),
    );

  /*
   * Keep debt_payments only for the existing
   * compatibility bridge. sale_payments is the
   * canonical payment ledger.
   */
  const [legacyPayment] =
    await tx
      .insert(
        debtPayments,
      )
      .values({
        saleId:
          sale.id,

        receivedByUserId:
          user.id,

        paymentMethod:
          parsed.data
            .paymentMethod,

        amount:
          amountMoney,

        notes:
          cleanOptional(
            parsed.data.notes,
          ),

        paidAt:
          clientCreatedAt,

        createdAt:
          clientCreatedAt,
      })
      .returning({
        id:
          debtPayments.id,
      });

  if (!legacyPayment) {
    throw new DebtPaymentSyncError(
      'Payment history could not be saved.',
    );
  }

  const [payment] =
    await tx
      .insert(
        salePayments,
      )
      .values({
        saleId:
          sale.id,

        receivedByUserId:
          user.id,

        sourceDebtPaymentId:
          legacyPayment.id,

        paymentType:
          'LATER_PAYMENT',

        paymentMethod:
          parsed.data
            .paymentMethod,

        receivedAmount:
          amountMoney,

        appliedAmount:
          amountMoney,

        returnedAmount:
          toMoney(0),

        returnMethod:
          null,

        extraKeptAmount:
          toMoney(0),

        extraReason:
          null,

        notes:
          cleanOptional(
            parsed.data.notes,
          ),

        paidAt:
          clientCreatedAt,

        createdAt:
          clientCreatedAt,
      })
      .returning({
        id:
          salePayments.id,
      });

  if (!payment) {
    throw new DebtPaymentSyncError(
      'Payment ledger could not be saved.',
    );
  }

  if (drawer) {
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
          'CASH_DEBT_PAYMENT',

        direction:
          'IN',

        amount:
          amountMoney,

        reason:
          `Unpaid sale payment / ${
            sale.customerName ||
            'Walk-in customer'
          }`,

        saleId:
          sale.id,

        createdAt:
          clientCreatedAt,
      });

    await reconcileClosedDrawer(
      tx,
      drawer,
    );
  }

  return {
    saleId:
      sale.id,

    paymentId:
      payment.id,

    paidAmount:
      toMoney(
        roundMoney(
          Number(
            sale.paidAmount,
          ) +
            amount,
        ),
      ),

    balanceAmount:
      toMoney(
        roundMoney(
          currentBalance -
            amount,
        ),
      ),
  };
}
