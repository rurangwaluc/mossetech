'use client';

import { useActionState, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  createStaffAction,
} from '@/lib/settings/create-staff-action';
import {
  updateStaffProfileAction,
  updateStaffStatusAction,
} from '@/lib/settings/password-actions';

type StaffUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status:
    | 'ACTIVE'
    | 'DISABLED';
};

type StaffAccessFormProps = {
  staffUsers: StaffUser[];
};

const inputClass =
  'h-11 w-full rounded-[6px] border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)] dark:border-[#343434] dark:bg-[#1B1B1B] dark:text-[#F5F5F5]';

export function StaffAccessForm({
  staffUsers,
}: StaffAccessFormProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [createState, createAction, creating] =
    useActionState(createStaffAction, {});

  // A successful submission closes the current form.
  // A new click can explicitly open a fresh form again.
  const [acknowledgedSubmissionId, setAcknowledgedSubmissionId] =
    useState<string | null>(null);

  const createFormVisible =
    showCreateForm &&
    (!createState.submissionId ||
      acknowledgedSubmissionId === createState.submissionId);

  return (
    <section className="w-full">
      <h2 className="mt-1 font-display text-2xl font-black tracking-tight text-[#222222] dark:text-[#F5F5F5]">
        Staff access
      </h2>

      <p className="mt-1 text-sm font-semibold leading-6 text-[#6B7280] dark:text-[#A3A3A3]">
        Manage employees who can securely access Mosse Tech.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-5">
        <div>
          <p className="text-sm font-bold text-[var(--text)]">
            Employees
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {staffUsers.length} registered
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (createFormVisible) {
              setShowCreateForm(false);
            } else {
              setAcknowledgedSubmissionId(createState.submissionId ?? null);
              setShowCreateForm(true);
            }
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] bg-[var(--primary-action)] px-4 text-sm font-bold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-action-hover)]"
          aria-expanded={createFormVisible}
        >
          {createFormVisible ? (
            <>
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add employee
            </>
          )}
        </button>
      </div>

      {createState.success && (
        <div
          role="status"
          className="mt-5 border border-[#5F8A63]/30 bg-[#5F8A63]/5 px-4 py-4"
        >
          <p className="text-sm font-bold text-[var(--text)]">
            Employee added successfully
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {createState.success}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Share mossetech.store/login with the employee.
            No password is needed.
          </p>
        </div>
      )}

      {createFormVisible && (
        <div className="mt-5 border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
          <h3 className="text-lg font-bold text-[var(--text)]">
            New employee
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            They will sign in using a verification code sent to their email.
          </p>

          <form action={createAction} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="new-staff-name"
                  className="text-sm font-bold text-[var(--text)]"
                >
                  Full name
                </label>
                <input
                  id="new-staff-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  required
                  placeholder="Employee name"
                  className={inputClass}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="new-staff-email"
                  className="text-sm font-bold text-[var(--text)]"
                >
                  Email address
                </label>
                <input
                  id="new-staff-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={180}
                  required
                  placeholder="employee@example.com"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="max-w-sm space-y-2">
              <label
                htmlFor="new-staff-phone"
                className="text-sm font-bold text-[var(--text)]"
              >
                Phone number <span className="font-normal text-[var(--muted)]">(optional)</span>
              </label>
              <input
                id="new-staff-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                placeholder="+250..."
                className={inputClass}
              />
            </div>

            {createState.error && (
              <p role="alert" className="text-sm font-semibold text-[#E85D5D]">
                {createState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={creating}
              className="inline-flex min-h-11 items-center justify-center rounded-[4px] bg-[var(--primary-action)] px-5 text-sm font-bold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating employee...' : 'Create employee'}
            </button>
          </form>
        </div>
      )}

      {staffUsers.length === 0 ? (
        <p className="mt-6 border-y border-neutral-200 py-5 text-sm font-semibold text-[#6B7280] dark:border-[#343434] dark:text-[#A3A3A3]">
          No staff account found.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-[#343434] dark:border-[#343434]">
          {staffUsers.map(
            (staff) => (
              <article
                key={staff.id}
                className="py-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-black text-[#222222] dark:text-[#F5F5F5]">
                      {staff.name}
                    </h3>

                    <p className="mt-1 break-words text-sm font-semibold text-[#6B7280] dark:text-[#A3A3A3]">
                      {staff.email}
                    </p>
                  </div>

                  <p
                    className={
                      staff.status ===
                      'ACTIVE'
                        ? 'shrink-0 text-sm font-bold text-[#5F8A63] dark:text-[#79C27D]'
                        : 'shrink-0 text-sm font-bold text-[#E85D5D]'
                    }
                  >
                    {staff.status ===
                    'ACTIVE'
                      ? 'Access active'
                      : 'Access stopped'}
                  </p>
                </div>

                <form
                  action={
                    updateStaffProfileAction
                  }
                  className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                >
                  <input
                    type="hidden"
                    name="staffUserId"
                    value={staff.id}
                  />

                  <div className="space-y-2">
                    <label
                      htmlFor={`staff-name-${staff.id}`}
                      className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
                    >
                      Name
                    </label>

                    <input
                      id={`staff-name-${staff.id}`}
                      name="name"
                      defaultValue={
                        staff.name
                      }
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor={`staff-phone-${staff.id}`}
                      className="text-sm font-black text-[#222222] dark:text-[#F5F5F5]"
                    >
                      Phone
                    </label>

                    <input
                      id={`staff-phone-${staff.id}`}
                      name="phone"
                      type="tel"
                      defaultValue={
                        staff.phone || ''
                      }
                      placeholder="+250..."
                      className={inputClass}
                    />
                  </div>

                  <button
                    type="submit"
                    className="h-11 rounded-[6px] border border-neutral-200 bg-white px-5 text-sm font-black text-[#222222] transition hover:border-[var(--primary)] hover:text-[var(--primary)] dark:border-[#343434] dark:bg-[#1B1B1B] dark:text-[#F5F5F5]"
                  >
                    Save
                  </button>
                </form>

                <div className="mt-4 flex flex-col gap-4 border-t border-neutral-100 pt-4 dark:border-[#2A2A2A] lg:flex-row lg:items-start lg:justify-between">


                  <form
                    action={
                      updateStaffStatusAction
                    }
                    className="shrink-0"
                  >
                    <input
                      type="hidden"
                      name="staffUserId"
                      value={staff.id}
                    />

                    <input
                      type="hidden"
                      name="status"
                      value={
                        staff.status ===
                        'ACTIVE'
                          ? 'DISABLED'
                          : 'ACTIVE'
                      }
                    />

                    <button
                      type="submit"
                      className={
                        staff.status ===
                        'ACTIVE'
                          ? 'h-10 rounded-[6px] border border-[#E85D5D]/40 px-4 text-sm font-black text-[#E85D5D] transition hover:bg-[#E85D5D]/10'
                          : 'h-10 rounded-[6px] border border-[#5F8A63]/40 px-4 text-sm font-black text-[#5F8A63] transition hover:bg-[#5F8A63]/10 dark:text-[#79C27D]'
                      }
                    >
                      {staff.status ===
                      'ACTIVE'
                        ? 'Stop access'
                        : 'Restore access'}
                    </button>
                  </form>
                </div>
              </article>
            ),
          )}
        </div>
      )}

    </section>
  );
}
