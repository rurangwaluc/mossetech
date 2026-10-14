import { z } from 'zod';

export const businessSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Business name is required.')
    .max(160),

  phone: z
    .string()
    .trim()
    .max(40)
    .optional(),

  address: z
    .string()
    .trim()
    .max(500)
    .optional(),

  currency: z.literal('RWF'),
});

export const ownerProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Owner name is required.')
    .max(120),

  phone: z
    .string()
    .trim()
    .max(40)
    .optional(),
});

export type BusinessSettingsInput =
  z.infer<typeof businessSettingsSchema>;

export type OwnerProfileInput =
  z.infer<typeof ownerProfileSchema>;
