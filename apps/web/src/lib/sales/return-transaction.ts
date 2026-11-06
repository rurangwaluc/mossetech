import { and, eq, sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  cashDrawerMovements,
  corrections,
  saleItems,
  saleReturnItems,
  saleReturnRefunds,
  saleReturns,
  sales,
} from '@mossetech/db/schema';

import {
  prepareSaleReturn,
  type ReturnQuantity,
} from './return-items';
import { calculateReturnBalance } from './returns-calculation';
import { prepareReturnRefund } from './return-refund-policy';
import { getLockedCurrentDrawerState } from '@/lib/cash-drawer/locking';
import {
  lockProductLedgers,
  reconcileProductLedgerQuantity,
} from './stock-ledger';

type DbTransaction =
  Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReturnTransactionLine = {
  saleItemId: string;
  quantity: number;
  condition: 'RESTOCK' | 'DAMAGED';
};

export type ReturnTransactionInput = {
  ownerId: string;
  saleId: string;
  idempotencyKey: string;
  reason: string;
  requested: ReturnTransactionLine[];
  cashRefundConfirmed: FormDataEntryValue | null;
  refundMethod: FormDataEntryValue | null;
  cashRefundExpectedAmount?: FormDataEntryValue | null;
};

function cents(value: string): number {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) {
    throw new Error('Invalid saved money amount.');
  }

  const result =
    BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] || '').padEnd(2, '0'));

  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Money amount exceeds supported range.');
  }

  return Number(result);
}

function money(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid money amount.');
  }

  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}


export async function executeProductReturnTransaction(
  tx: DbTransaction,
  input: ReturnTransactionInput,
) {
  const {
    ownerId,
    saleId,
    idempotencyKey,
    reason,
    requested,
    cashRefundConfirmed,
    refundMethod,
    cashRefundExpectedAmount,
  } = input;

      // Serialize returns with payments and sale corrections.
      await tx.execute(sql`
        SELECT id
        FROM sales
        WHERE id = ${saleId}
        FOR UPDATE
      `);

      const [sale] = await tx
        .select()
        .from(sales)
        .where(eq(sales.id, saleId))
        .limit(1);

      if (!sale) {
        throw new Error('Sale not found.');
      }

      const [duplicate] = await tx
        .select({
          id: saleReturns.id,
          saleId: saleReturns.saleId,
        })
        .from(saleReturns)
        .where(eq(saleReturns.idempotencyKey, idempotencyKey))
        .limit(1);

      if (duplicate) {
        if (duplicate.saleId !== saleId) {
          throw new Error('Return request belongs to another sale.');
        }
        return 'already-recorded';
      }

      const [pending] = await tx
        .select({ id: corrections.id })
        .from(corrections)
        .where(and(
          eq(corrections.targetType, 'SALE'),
          eq(corrections.targetId, saleId),
          eq(corrections.status, 'PENDING'),
        ))
        .limit(1);

      if (pending) {
        throw new Error('Resolve the pending sale correction first.');
      }

      const items = await tx
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, saleId));

      if (!items.length) {
        throw new Error('No returnable products found.');
      }

      if (items.some((item) => item.itemType !== 'PRODUCT')) {
        throw new Error(
          'This sale contains unsupported items. Review before returning.',
        );
      }

      const originalItems = items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPriceCents: cents(item.unitPrice),
      }));

      const previousLines = await tx
        .select({
          saleItemId: saleReturnItems.originalSaleItemId,
          quantity: saleReturnItems.quantityReturned,
        })
        .from(saleReturnItems)
        .innerJoin(
          saleReturns,
          eq(saleReturnItems.saleReturnId, saleReturns.id),
        )
        .where(eq(saleReturns.saleId, saleId));

      const totals = new Map<string, number>();

      for (const line of previousLines) {
        totals.set(
          line.saleItemId,
          (totals.get(line.saleItemId) || 0) + line.quantity,
        );
      }

      const previousReturns: ReturnQuantity[] =
        [...totals].map(([saleItemId, quantity]) => ({
          saleItemId,
          quantity,
        }));

      const requestedReturns: ReturnQuantity[] =
        requested.map((line) => ({
          saleItemId: line.saleItemId,
          quantity: line.quantity,
        }));

      const discount = cents(sale.discountAmount);

      const plan = prepareSaleReturn({
        items: originalItems,
        previousReturns,
        requestedReturns,
        originalDiscountCents: discount,
      });

      if (
        plan.originalSubtotalCents !== cents(sale.subtotalAmount) ||
        plan.originalTotalCents !==
          cents(sale.subtotalAmount) - discount
      ) {
        throw new Error('Sale financial history requires review.');
      }

      const previousTotal =
        plan.originalTotalCents - plan.previousReturnCreditCents;

      if (cents(sale.totalAmount) !== previousTotal) {
        throw new Error('Sale total does not match its return history.');
      }

      if (
        cents(sale.balanceAmount) !==
        previousTotal - cents(sale.paidAmount)
      ) {
        throw new Error('Sale payment balance requires review.');
      }

      // refundBackend564A
      // Paid amount is net of product-return refunds.
      // Preserve gross payment history in sale_payments.
      const previousRefundRows = await tx
        .select({ amount: saleReturnRefunds.amount })
        .from(saleReturnRefunds)
        .where(eq(saleReturnRefunds.saleId, saleId));

      const previousRefundsCents =
        previousRefundRows.reduce(
          (sum, row) => sum + cents(row.amount),
          0,
        );

      if (!Number.isSafeInteger(previousRefundsCents)) {
        throw new Error('Refund history exceeds supported money range.');
      }

      const currentPaidCents = cents(sale.paidAmount);
      const grossReceivedCents =
        currentPaidCents + previousRefundsCents;

      if (!Number.isSafeInteger(grossReceivedCents)) {
        throw new Error('Payment history exceeds supported money range.');
      }

      const balances = calculateReturnBalance({
        originalTotalCents: plan.originalTotalCents,
        totalReturnCreditCents: plan.totalReturnCreditCents,
        totalPaymentsReceivedCents: grossReceivedCents,
        refundsAlreadyIssuedCents: previousRefundsCents,
      });

      // REFUNDS_ENABLED_564B
      // A client-supplied confirmation is not authorization
      // to issue money. Remain fail-closed until independent
      // approval, payment verification and database concurrency
      // tests are completed.
      // Server-only opt-in; omitted or any other value means disabled.
      // Requires the authenticated owner and verified amount confirmation.
      const refundsEnabled =
        process.env.MOSSETECH_ENABLE_RETURN_CASH_REFUNDS === 'YES';

      if (balances.refundDueCents > 0 && !refundsEnabled) {
        throw new Error(
          'Refunds are not activated. No money has been returned.',
        );
      }

      // No cash movement without an explicit user confirmation.
      // The current UI does not provide this confirmation,
      // so refund-required returns remain blocked until the
      // refund preview and integration tests are completed.
      if (
        balances.refundDueCents > 0 &&
        (
          cashRefundConfirmed !== 'YES' ||
          refundMethod !== 'CASH'
        )
      ) {
        throw new Error(
          'Cash refund requires a verified amount preview and confirmation.',
        );
      }

      if (
        balances.refundDueCents > 0 &&
        cashRefundExpectedAmount !== money(balances.refundDueCents)
      ) {
        throw new Error(
          'The expected cash refund amount has changed. Review before confirming.',
        );
      }

      if (balances.outstandingCents > 0 && !sale.customerId) {
        throw new Error('Link the customer before leaving unpaid debt.');
      }

      const selected = requested.map((line) => {
        const original = items.find(
          (item) => item.id === line.saleItemId,
        );

        if (!original) {
          throw new Error('Product is not part of this sale.');
        }

        return { line, original };
      });

      const productIds = [
        ...new Set(selected.map(({ original }) => original.productId)),
      ];

      await lockProductLedgers(tx, productIds);

      // Allocate discount-adjusted credit across selected lines.
      const creditByLine: number[] = [];
      const prefix: ReturnQuantity[] = [];
      let allocated = 0;

      for (const { line } of selected) {
        prefix.push({
          saleItemId: line.saleItemId,
          quantity: line.quantity,
        });

        const partial = prepareSaleReturn({
          items: originalItems,
          previousReturns,
          requestedReturns: prefix,
          originalDiscountCents: discount,
        });

        const credit = partial.newReturnCreditCents - allocated;

        if (credit < 0) {
          throw new Error('Invalid return credit allocation.');
        }

        creditByLine.push(credit);
        allocated = partial.newReturnCreditCents;
      }

      if (allocated !== plan.newReturnCreditCents) {
        throw new Error('Return credits do not balance.');
      }

      // Lock the drawer before recording any refund.
      // All validation and writes remain in one transaction.
      let refundDrawerId: string | null = null;
      let refundAmountCents = 0;

      if (balances.refundDueCents > 0) {
        const drawerState =
          await getLockedCurrentDrawerState(tx);

        if (!drawerState) {
          throw new Error(
            'Open the cash drawer before recording a cash refund.',
          );
        }

        const drawerCash = drawerState.expectedCash;

        if (
          !Number.isFinite(drawerCash) ||
          drawerCash < 0 ||
          !Number.isSafeInteger(Math.round(drawerCash * 100))
        ) {
          throw new Error('Cash drawer balance requires review.');
        }

        const decision = prepareReturnRefund({
          adjustedTotalCents: balances.adjustedTotalCents,
          paymentsReceivedCents: grossReceivedCents,
          previousRefundsCents,
          availableDrawerCashCents: Math.round(drawerCash * 100),
          paymentMethod: 'CASH',
        });

        if (decision.refundAmountCents !== balances.refundDueCents) {
          throw new Error('Refund calculation did not reconcile.');
        }

        refundAmountCents = decision.refundAmountCents;
        refundDrawerId = drawerState.drawer.id;
      }

      const [created] = await tx
        .insert(saleReturns)
        .values({
          saleId,
          recordedByUserId: ownerId,
          idempotencyKey,
          previousSaleTotal: money(previousTotal),
          creditAmount: money(plan.newReturnCreditCents),
          reason,
        })
        .returning({ id: saleReturns.id });

      if (!created) {
        throw new Error('Return history could not be saved.');
      }

      await tx.insert(saleReturnItems).values(
        selected.map(({ line, original }, index) => ({
          saleReturnId: created.id,
          originalSaleItemId: original.id,
          productId: original.productId,
          productName: original.itemName,
          quantityReturned: line.quantity,
          condition: line.condition,
          unitPriceSnapshot: original.unitPrice,
          unitCostSnapshot: original.unitCost,
          creditAmount: money(creditByLine[index]),
        })),
      );

      if (refundAmountCents > 0) {
        if (!refundDrawerId) {
          throw new Error('Cash drawer lock was not acquired.');
        }

        await tx.insert(saleReturnRefunds).values({
          saleId,
          saleReturnId: created.id,
          issuedByUserId: ownerId,
          idempotencyKey,
          amount: money(refundAmountCents),
          paymentMethod: 'CASH',
          notes: `Product return / ${reason}`,
        });

        await tx.insert(cashDrawerMovements).values({
          drawerId: refundDrawerId,
          createdByUserId: ownerId,
          movementType: 'SALE_RETURN_REFUND',
          direction: 'OUT',
          amount: money(refundAmountCents),
          reason: `Customer product return / ${reason}`,
          saleId,
        });
      }

      const newNetPaidCents =
        currentPaidCents - refundAmountCents;

      if (newNetPaidCents < 0) {
        throw new Error('Refund exceeds the net paid amount.');
      }

      if (
        balances.adjustedTotalCents - newNetPaidCents !==
        balances.outstandingCents
      ) {
        throw new Error('Refund and debt balances do not reconcile.');
      }

      const [updated] = await tx
        .update(sales)
        .set({
          totalAmount: money(balances.adjustedTotalCents),
          paidAmount: money(newNetPaidCents),
          balanceAmount: money(balances.outstandingCents),
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId))
        .returning({ id: sales.id });

      if (!updated) {
        throw new Error('Sale balance update failed.');
      }

      for (const productId of [...productIds].sort()) {
        await reconcileProductLedgerQuantity(tx, productId);
      }

      return 'recorded';
}
