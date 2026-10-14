import { z } from 'zod';

export const debtPaymentSchema = z.object({
  saleId: z.string().uuid('Debt was not found.'),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD']),
  amount: z
    .string()
    .trim()
    .regex(/^[0-9]+(\.[0-9]{1,2})?$/, 'Enter a valid amount.'),
  notes: z.string().trim().max(1000).optional(),
});

export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;
