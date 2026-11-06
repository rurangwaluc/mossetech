import { and, eq, sql } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import {
  corrections,
  saleItems,
  saleReturnCustomerCredits,
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
import { calculateCustomerCreditAllocation } from './customer-credit-allocation';
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
  customerCreditConfirmed?: FormDataEntryValue | null;
  customerCreditExpectedAmount?: FormDataEntryValue | null;
  settlementMethod?: FormDataEntryValue | null;
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
    customerCreditConfirmed,
    customerCreditExpectedAmount,
    settlementMethod,
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

      // Credit is held as a liability, not as sale-paid money.
      // Reconstruct customer receipts including any earlier credits.
      const previousCreditRows = await tx
        .select({
          amount: saleReturnCustomerCredits.amount,
          remaining: saleReturnCustomerCredits.remainingAmount,
          customerId: saleReturnCustomerCredits.customerId,
        })
        .from(saleReturnCustomerCredits)
        .where(eq(saleReturnCustomerCredits.saleId, saleId));

      let priorCreditsCents = 0;
      for (const credit of previousCreditRows) {
        if (credit.customerId !== sale.customerId ||
            cents(credit.amount) !== cents(credit.remaining)) {
          throw new Error('Customer credit history requires review.');
        }
        priorCreditsCents += cents(credit.amount);
        if (!Number.isSafeInteger(priorCreditsCents)) {
          throw new Error('Customer credit exceeds supported money range.');
        }
      }

      const currentPaidCents = cents(sale.paidAmount);
      const grossReceivedCents =
        currentPaidCents + previousRefundsCents + priorCreditsCents;

      if (!Number.isSafeInteger(grossReceivedCents)) {
        throw new Error('Payment history exceeds supported money range.');
      }

      const balances = calculateReturnBalance({
        originalTotalCents: plan.originalTotalCents,
        totalReturnCreditCents: plan.totalReturnCreditCents,
        totalPaymentsReceivedCents: grossReceivedCents,
        refundsAlreadyIssuedCents: previousRefundsCents,
      });

      // Issuing store credit never moves cash. Refund execution is
      // disabled independently of any environment flag or client input.
      if (cashRefundConfirmed === 'YES' || refundMethod === 'CASH' ||
          cashRefundExpectedAmount) {
        throw new Error('Cash refunds are disabled. Choose customer credit.');
      }

      const allocation = calculateCustomerCreditAllocation({
        salePaidCents: currentPaidCents,
        adjustedTotalCents: balances.adjustedTotalCents,
        previouslyIssuedCreditCents: priorCreditsCents,
        totalCreditEntitlementCents: balances.refundDueCents,
      });
      const { newlyOwedCreditCents } = allocation;

      if (newlyOwedCreditCents > 0) {
        if (!sale.customerId) {
          throw new Error(
            'Link this sale to a customer before recording money owed to them.',
          );
        }
        if (settlementMethod !== 'CUSTOMER_CREDIT' ||
            customerCreditConfirmed !== 'YES' ||
            customerCreditExpectedAmount !== money(newlyOwedCreditCents)) {
          throw new Error(
            'Review and explicitly confirm the exact customer credit amount.',
          );
        }
      } else if (settlementMethod === 'CUSTOMER_CREDIT' ||
                 customerCreditConfirmed === 'YES') {
        throw new Error('No customer credit is due for this return.');
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

      // No drawer movements or physical refunds in this workflow.
      // A credit liability is inserted atomically with the return below.

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

      if (newlyOwedCreditCents > 0) {
        const customerId = sale.customerId;
        if (!customerId) {
          throw new Error('Customer link is required for credit.');
        }
        await tx.insert(saleReturnCustomerCredits).values({
          saleId,
          saleReturnId: created.id,
          customerId,
          recordedByUserId: ownerId,
          amount: money(newlyOwedCreditCents),
          remainingAmount: money(newlyOwedCreditCents),
        });
      }

      // Previously received money is preserved in sale_payments.
      // Move only the excess allocation into the separate credit liability.
      const newNetPaidCents = allocation.newSalePaidCents;
      if (balances.outstandingCents !== allocation.outstandingCents) {
        throw new Error('Sale, debt and customer credit do not reconcile.');
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
