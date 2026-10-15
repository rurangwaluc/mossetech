'use client';

import { useActionState } from 'react';

import type {
  EmployeePermission,
} from '@mossetech/validators/permissions';

import {
  updateStaffPermissionsAction,
} from '@/lib/settings/staff-permissions-action';

type PermissionItem = {
  key: EmployeePermission;
  label: string;
};

type PermissionGroup = {
  title: string;
  items: PermissionItem[];
};

const groups: PermissionGroup[] = [
  {
    title: 'Sales',
    items: [
      { key: 'sales.view', label: 'View sales' },
      { key: 'sales.create', label: 'Create sales' },
      { key: 'sales.correct', label: 'Correct sales' },
    ],
  },
  {
    title: 'Products',
    items: [
      { key: 'products.view', label: 'View products' },
      { key: 'products.create', label: 'Add products' },
      { key: 'products.edit', label: 'Edit products' },
    ],
  },
  {
    title: 'Stock',
    items: [
      { key: 'stock.view', label: 'View stock' },
      { key: 'stock.receive', label: 'Receive stock' },
      { key: 'stock.damage', label: 'Record damage' },
      { key: 'stock.correct', label: 'Correct stock records' },
    ],
  },
  {
    title: 'Customers',
    items: [
      { key: 'customers.view', label: 'View customers' },
      { key: 'customers.create', label: 'Add customers' },
      { key: 'customers.edit', label: 'Edit customers' },
    ],
  },
  {
    title: 'Debts',
    items: [
      { key: 'debts.view', label: 'View debts' },
      { key: 'debts.pay', label: 'Record debt payments' },
      { key: 'debts.correct', label: 'Correct payments' },
    ],
  },
  {
    title: 'Expenses',
    items: [
      { key: 'expenses.view', label: 'View expenses' },
      { key: 'expenses.create', label: 'Add expenses' },
      { key: 'expenses.edit', label: 'Edit expenses' },
    ],
  },
  {
    title: 'Money',
    items: [
      { key: 'money.view', label: 'View money records' },
      { key: 'money.manage', label: 'Manage money' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { key: 'reports.view', label: 'View reports' },
      { key: 'reports.download', label: 'Download reports' },
    ],
  },
];

export function StaffPermissionsEditor({
  employeeUserId,
  permissions,
  enabled,
}: {
  employeeUserId: string;
  permissions: EmployeePermission[];
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateStaffPermissionsAction,
    {},
  );

  return (
    <form
      action={action}
      className="mt-4 space-y-5 border-t border-[var(--border)] pt-5"
    >
      <input
        type="hidden"
        name="employeeUserId"
        value={employeeUserId}
      />

      <div>
        <h4 className="text-base font-bold text-[var(--text)]">
          Employee permissions
        </h4>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose what this employee can access and manage.
          Changes take effect when you save.
        </p>
      </div>

      {!enabled && (
        <p className="text-sm font-semibold text-[var(--muted)]">
          Permission management is being prepared.
          Saving will be available once activated.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <fieldset
            key={group.title}
            className="min-w-0 border border-[var(--border)] p-4"
          >
            <legend className="px-1 text-sm font-bold text-[var(--text)]">
              {group.title}
            </legend>

            <div className="space-y-3">
              {group.items.map((item) => (
                <label
                  key={item.key}
                  className="flex min-h-8 cursor-pointer items-start gap-3 text-sm text-[var(--text)]"
                >
                  <input
                    type="checkbox"
                    name="permissions"
                    value={item.key}
                    defaultChecked={permissions.includes(item.key)}

                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-semibold text-[#E85D5D]">
          {state.error}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          className="text-sm font-semibold text-[#5F8A63] dark:text-[#79C27D]"
        >
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !enabled}
        className="inline-flex min-h-11 items-center justify-center rounded-[4px] bg-[var(--primary-action)] px-5 text-sm font-bold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Saving permissions...' : 'Save permissions'}
      </button>
    </form>
  );
}
