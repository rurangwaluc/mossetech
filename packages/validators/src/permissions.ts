import { z } from 'zod';

export const employeePermissionKeys = [
  'sales.view',
  'sales.create',
  'sales.correct',
  'products.view',
  'products.create',
  'products.edit',
  'stock.view',
  'stock.receive',
  'stock.damage',
  'stock.correct',
  'customers.view',
  'customers.create',
  'customers.edit',
  'debts.view',
  'debts.pay',
  'debts.correct',
  'expenses.view',
  'expenses.create',
  'expenses.edit',
  'money.view',
  'money.manage',
  'reports.view',
  'reports.download',
] as const;

export const employeePermissionSchema =
  z.enum(employeePermissionKeys);

export type EmployeePermission =
  z.infer<typeof employeePermissionSchema>;

export const employeePermissionsUpdateSchema =
  z.object({
    employeeUserId: z.string().uuid(),
    permissions: z
      .array(employeePermissionSchema)
      .max(employeePermissionKeys.length)
      .refine(
        (values) =>
          new Set(values).size === values.length,
        'Duplicate permissions are not allowed.',
      ),
  });
