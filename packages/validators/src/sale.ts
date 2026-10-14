import { z } from 'zod';

const moneySchema = z
  .string()
  .trim()
  .regex(/^[0-9]+(\.[0-9]{1,2})?$/, 'Enter a valid amount.');

const optionalMoneySchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^[0-9]+(\.[0-9]{1,2})?$/.test(value), 'Enter a valid amount.');

export const saleLineItemSchema = z.object({
  productId: z.string().uuid('Choose an item.'),
  quantity: z.number().int().min(1),
  unitPrice: optionalMoneySchema,
});

export const saleFormSchema = z.object({
  customerMode: z.enum(['WALK_IN', 'EXISTING', 'NEW']),
  customerId: z.string().uuid().optional(),
  newCustomerName: z.string().trim().max(160).optional(),
  newCustomerPhone: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD']),
  discountAmount: moneySchema.default('0'),
  discountReason: z.string().trim().max(1000).optional(),
  amountReceived: moneySchema,
  changeReturned: moneySchema.default('0'),
  extraKept: moneySchema.default('0'),
  extraReason: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(saleLineItemSchema).min(1, 'Add at least one item.'),
});

export type SaleFormInput = z.infer<typeof saleFormSchema>;
