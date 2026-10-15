import { z } from 'zod';

export const createStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter the employee name.')
    .max(120, 'Name is too long.'),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(180, 'Email address is too long.'),

  phone: z
    .string()
    .trim()
    .max(40, 'Phone number is too long.')
    .optional(),
});

export type CreateStaffInput =
  z.infer<typeof createStaffSchema>;
