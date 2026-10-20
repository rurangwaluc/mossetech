import { z } from 'zod';

const moneySchema = z
  .string()
  .trim()
  .regex(
    /^[0-9]+(\.[0-9]{1,2})?$/,
    'Enter a valid amount.',
  )
  .refine(
    (value) => Number(value) >= 0,
    'Selling price cannot be negative.',
  );

const wholeNumberSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9]+$/,
    'Enter a valid number.',
  );

export const productFormSchema =
  z.object({
    itemType: z.literal('PRODUCT'),

    name: z
      .string()
      .trim()
      .min(
        2,
        'Product name is required.',
      )
      .max(180),

    category: z
      .string()
      .trim()
      .min(
        2,
        'Category is required.',
      )
      .max(120),

    brand: z.string().trim().max(120).optional().default(''),
    model: z.string().trim().max(160).optional().default(''),
    condition: z.enum(['NEW', 'USED', 'REFURBISHED'])
      .optional(),
    compatibility: z.string().trim().max(1000)
      .optional().default(''),
    specifications: z.record(
      z.string(),
      z.string().max(200),
    ).optional().default({}),

    unit: z
      .string()
      .trim()
      .min(
        1,
        'Unit is required.',
      )
      .max(40),

    sellingPrice: moneySchema.or(z.literal('')).default(''),

    minQuantity:
      wholeNumberSchema,

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

export type ProductFormInput =
  z.infer<
    typeof productFormSchema
  >;
