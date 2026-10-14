import { z } from 'zod';

const moneySchema = z
  .string()
  .trim()
  .regex(/^[0-9]+(\.[0-9]{1,2})?$/, 'Enter a valid amount.');

const optionalTextSchema = z.string().trim().max(1000).optional();

export const openCashDrawerSchema = z.object({
  openingCash: moneySchema,
  openingNote: optionalTextSchema,
});

export const cashDrawerCashInSchema = z.object({
  amount: moneySchema,
  reason: z.string().trim().min(2, 'Enter the reason.').max(1000),
});

export const cashDrawerCashOutSchema = z.object({
  amount: moneySchema,
  reason: z.string().trim().min(2, 'Enter the reason.').max(1000),
});

export const cashDrawerDepositSchema = z.object({
  toPaymentMethod: z.enum(['MOBILE_MONEY', 'BANK']),
  amount: moneySchema,
  reason: z.string().trim().min(2, 'Enter the deposit reason.').max(1000),
});

export const cashDrawerExpenseSchema = z.object({
  name: z.string().trim().min(2, 'Enter the expense name.').max(180),
  category: z.string().trim().min(2, 'Enter the expense category.').max(120),
  amount: moneySchema,
  notes: z.string().trim().min(2, 'Enter why this cash was spent.').max(1000),
});

export const closeCashDrawerSchema = z.object({
  countedCash: moneySchema,
  differenceReason: optionalTextSchema,
  closingNote: optionalTextSchema,
});

export type OpenCashDrawerInput = z.infer<typeof openCashDrawerSchema>;
export type CashDrawerCashInInput = z.infer<typeof cashDrawerCashInSchema>;
export type CashDrawerCashOutInput = z.infer<typeof cashDrawerCashOutSchema>;
export type CashDrawerDepositInput = z.infer<typeof cashDrawerDepositSchema>;
export type CashDrawerExpenseInput = z.infer<typeof cashDrawerExpenseSchema>;
export type CloseCashDrawerInput = z.infer<typeof closeCashDrawerSchema>;
