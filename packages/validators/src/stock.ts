import { z } from 'zod';

export const stockArrivalSchema = z.object({
  productId: z
    .string()
    .uuid('Choose a product.'),

  quantityReceived: z.coerce
    .number()
    .int()
    .min(
      1,
      'Quantity must be at least 1.',
    ),

  supplierName: z
    .string()
    .trim()
    .max(160)
    .optional(),

  reference: z
    .string()
    .trim()
    .max(120)
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000)
    .optional(),
});

export type StockArrivalInput =
  z.infer<typeof stockArrivalSchema>;

export const stockDamageSchema = z.object({
  productId: z
    .string()
    .uuid('Choose a product.'),

  quantityDamaged: z.coerce
    .number()
    .int()
    .min(
      1,
      'Damaged quantity must be at least 1.',
    ),

  reason: z
    .string()
    .trim()
    .min(
      2,
      'Choose why the stock was damaged.',
    )
    .max(120),

  notes: z
    .string()
    .trim()
    .max(1000)
    .optional(),
});

export type StockDamageInput =
  z.infer<typeof stockDamageSchema>;
