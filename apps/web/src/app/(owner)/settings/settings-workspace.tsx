'use client';

import { useState } from 'react';
import { SettingsForm } from './settings-form';
import { InstallAppCard } from './install-app-card';
import { OwnerAccountForm } from './owner-account-form';
import { StaffAccessForm } from './staff-access-form';
import type {
  EmployeePermission,
} from '@mossetech/validators/permissions';

type SettingsSection =
  | 'business'
  | 'app'
  | 'security'
  | 'staff';

type SettingsWorkspaceProps = {
  settings: {
    businessName: string;
    phone: string;
    address: string;
  };

  owner: {
    name: string;
    email: string;
    phone: string;
  };

  permissionsEnabled: boolean;
  staffUsers: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status:
      | 'ACTIVE'
      | 'DISABLED';
    permissions: EmployeePermission[];
  }>;
};

const sections: Array<{
  value: SettingsSection;
  label: string;
}> = [
  {
    value: 'business',
    label: 'Business',
  },
  {
    value: 'app',
    label: 'App',
  },
  {
    value: 'security',
    label: 'Security',
  },
  {
    value: 'staff',
    label: 'Staff Management',
  },
];

export function SettingsWorkspace({
  settings,
  owner,
  staffUsers,
  permissionsEnabled,
}: SettingsWorkspaceProps) {
  const [
    activeSection,
    setActiveSection,
  ] =
    useState<SettingsSection>(
      'business',
    );

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <nav
        aria-label="Settings sections"
        className="flex justify-center overflow-x-auto border-b border-neutral-200 dark:border-[#343434]"
      >
        <div className="flex min-w-max gap-1">
          {sections.map(
            (section) => {
              const active =
                activeSection ===
                section.value;

              return (
                <button
                  key={section.value}
                  type="button"
                  onClick={() => {
                    setActiveSection(section.value);
                    window.history.replaceState(
                      null,
                      '',
                      `#${section.value}`,
                    );
                  }}
                  aria-current={
                    active
                      ? 'page'
                      : undefined
                  }
                  className={
                    active
                      ? 'border-b-2 border-[var(--primary)] px-4 py-3 text-sm font-black text-[var(--primary)]'
                      : 'border-b-2 border-transparent px-4 py-3 text-sm font-bold text-[#6B7280] transition hover:text-[#222222] dark:text-[#A3A3A3] dark:hover:text-[#F5F5F5]'
                  }
                >
                  {section.label}
                </button>
              );
            },
          )}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[780px] pb-8 pt-6">
        {activeSection ===
          'business' && (
          <section>
<h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[#222222] dark:text-[#F5F5F5]">
              Business details
            </h2>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#6B7280] dark:text-[#A3A3A3]">
              Business information used across Mosse Tech.
            </p>

            <div className="mt-6">
              <SettingsForm
                settings={settings}
              />
            </div>
          </section>
        )}

        {activeSection ===
          'app' && (
          <InstallAppCard />
        )}

        {activeSection ===
          'security' && (
          <div className="space-y-8">
            <OwnerAccountForm
              owner={owner}
            />


          </div>
        )}

        {activeSection ===
          'staff' && (
          <StaffAccessForm
            staffUsers={staffUsers}
            permissionsEnabled={permissionsEnabled}
          />
        )}
      </div>
    </div>
  );
}
