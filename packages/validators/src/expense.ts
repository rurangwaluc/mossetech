import { z } from 'zod';

const moneySchema = z
  .string()
  .trim()
  .regex(/^[0-9]+(\.[0-9]{1,2})?$/, 'Enter a valid amount.');

export const expenseFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter expense name.').max(180),
  category: z.string().trim().min(1, 'Enter category.').max(120),
  amount: moneySchema,
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD']),
  expenseDate: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;
