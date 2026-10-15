import { z } from 'zod';

export const updateStaffProfileSchema = z.object({
  staffUserId: z.string().uuid('Choose a staff member.'),
  name: z.string().trim().min(2, 'Staff name is required.').max(120),
  phone: z.string().trim().max(40).optional(),
});

export const updateStaffStatusSchema = z.object({
  staffUserId: z.string().uuid('Choose a staff member.'),
  status: z.enum(['ACTIVE', 'DISABLED']),
});

export type UpdateStaffProfileInput = z.infer<typeof updateStaffProfileSchema>;
export type UpdateStaffStatusInput = z.infer<typeof updateStaffStatusSchema>;
