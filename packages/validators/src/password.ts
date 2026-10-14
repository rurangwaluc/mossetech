import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must have at least 8 characters.')
  .max(128, 'Password is too long.');

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  });

export const resetStaffPasswordSchema = z
  .object({
    staffUserId: z.string().uuid('Choose a staff member.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  });

export const updateStaffProfileSchema = z.object({
  staffUserId: z.string().uuid('Choose a staff member.'),
  name: z.string().trim().min(2, 'Staff name is required.').max(120),
  phone: z.string().trim().max(40).optional(),
});

export const updateStaffStatusSchema = z.object({
  staffUserId: z.string().uuid('Choose a staff member.'),
  status: z.enum(['ACTIVE', 'DISABLED']),
});

export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;
export type UpdateStaffProfileInput = z.infer<typeof updateStaffProfileSchema>;
export type UpdateStaffStatusInput = z.infer<typeof updateStaffStatusSchema>;
