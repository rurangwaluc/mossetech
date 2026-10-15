'use server';

import { requirePermission } from '@/lib/auth/require-permission';

import {
  and,
  eq,
} from 'drizzle-orm';
import {
  revalidatePath,
} from 'next/cache';
import {
  redirect,
} from 'next/navigation';

import {
  db,
} from '@mossetech/db/client';
import {
  corrections,
  customers,
} from '@mossetech/db/schema';

import {
  requireOwner,
} from '@/lib/auth/session';


type CustomerFixValues = {
  kind: 'CUSTOMER_V1';
  customerId: string;
  version: string;
  name: string;
  phone: string | null;
  notes: string | null;
};


class CustomerFixError extends Error {}


function cleanRequired(
  value: FormDataEntryValue | null,
) {
  return String(
    value || '',
  ).trim();
}


function cleanOptional(
  value: FormDataEntryValue | null,
) {
  const text =
    String(
      value || '',
    ).trim();

  return text || null;
}


function customerErrorHref(
  customerId: string,
  message: string,
) {
  return (
    `/customers/${customerId}/edit?error=` +
    encodeURIComponent(
      message,
    )
  );
}


function requestErrorHref(
  message: string,
) {
  return (
    '/requests?error=' +
    encodeURIComponent(
      message,
    )
  );
}


function revalidateCustomerPaths(
  customerId: string,
) {
  revalidatePath(
    '/customers',
  );

  revalidatePath(
    `/customers/${customerId}`,
  );

  revalidatePath(
    `/customers/${customerId}/edit`,
  );

  /*
   * Customer names and phones are used
   * when choosing a customer for new sales.
   */
  revalidatePath(
    '/sales',
  );

  revalidatePath(
    '/requests',
  );

  revalidatePath(
    '/dashboard',
  );
}


function valuesFromCustomer(
  customer: {
    id: string;
    name: string;
    phone: string | null;
    notes: string | null;
    updatedAt: Date;
  },
): CustomerFixValues {
  return {
    kind:
      'CUSTOMER_V1',

    customerId:
      customer.id,

    version:
      customer.updatedAt
        .toISOString(),

    name:
      customer.name,

    phone:
      customer.phone,

    notes:
      customer.notes,
  };
}


function valuesFromSnapshot(
  value: Record<
    string,
    unknown
  >,
): CustomerFixValues {
  if (
    value.kind !==
      'CUSTOMER_V1' ||
    typeof value.customerId !==
      'string' ||
    !value.customerId ||
    typeof value.version !==
      'string' ||
    typeof value.name !==
      'string'
  ) {
    throw new CustomerFixError(
      'This customer request is no longer valid.',
    );
  }

  return {
    kind:
      'CUSTOMER_V1',

    customerId:
      value.customerId,

    version:
      value.version,

    name:
      value.name.trim(),

    phone:
      typeof value.phone ===
        'string' &&
      value.phone.trim()
        ? value.phone.trim()
        : null,

    notes:
      typeof value.notes ===
        'string' &&
      value.notes.trim()
        ? value.notes.trim()
        : null,
  };
}


function sameValues(
  left: CustomerFixValues,
  right: CustomerFixValues,
) {
  return (
    left.customerId ===
      right.customerId &&
    left.version ===
      right.version &&
    left.name ===
      right.name &&
    left.phone ===
      right.phone &&
    left.notes ===
      right.notes
  );
}


function sameEditableValues(
  left: CustomerFixValues,
  right: CustomerFixValues,
) {
  return (
    left.name ===
      right.name &&
    left.phone ===
      right.phone &&
    left.notes ===
      right.notes
  );
}


function validateAfter(
  values: CustomerFixValues,
) {
  if (!values.name) {
    throw new CustomerFixError(
      'Enter the customer name.',
    );
  }

  if (
    values.name.length >
    160
  ) {
    throw new CustomerFixError(
      'Customer name is too long.',
    );
  }

  if (
    values.phone &&
    values.phone.length >
      40
  ) {
    throw new CustomerFixError(
      'Phone number is too long.',
    );
  }
}


async function applyCustomerFix(
  customerId: string,
  before: CustomerFixValues,
  after: CustomerFixValues,
  actorId: string,
  reason: string,
  pendingCorrectionId:
    | string
    | null,
) {
  await db.transaction(
    async (tx) => {
      const [customer] =
        await tx
          .select()
          .from(
            customers,
          )
          .where(
            eq(
              customers.id,
              customerId,
            ),
          )
          .limit(1);

      if (
        !customer ||
        customer.status !==
          'ACTIVE'
      ) {
        throw new CustomerFixError(
          'Customer was not found.',
        );
      }

      const current =
        valuesFromCustomer(
          customer,
        );

      if (
        !sameValues(
          current,
          before,
        )
      ) {
        throw new CustomerFixError(
          'This customer has changed since the request was created. Review it before applying this request.',
        );
      }

      validateAfter(
        after,
      );

      const now =
        new Date();

      await tx
        .update(
          customers,
        )
        .set({
          name:
            after.name,

          phone:
            after.phone,

          notes:
            after.notes,

          updatedAt:
            now,
        })
        .where(
          eq(
            customers.id,
            customerId,
          ),
        );

      const appliedAfter:
        CustomerFixValues = {
        ...after,
        version:
          now.toISOString(),
      };

      if (
        pendingCorrectionId
      ) {
        const applied =
          await tx
            .update(
              corrections,
            )
            .set({
              status:
                'APPLIED',

              reviewedByUserId:
                actorId,

              beforeValues:
                before,

              afterValues:
                appliedAfter,

              reviewedAt:
                now,

              appliedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  corrections.id,
                  pendingCorrectionId,
                ),
                eq(
                  corrections.targetType,
                  'CUSTOMER',
                ),
                eq(
                  corrections.status,
                  'PENDING',
                ),
              ),
            )
            .returning({
              id:
                corrections.id,
            });

        if (
          applied.length !==
          1
        ) {
          throw new CustomerFixError(
            'This request has already been handled.',
          );
        }
      } else {
        await tx
          .insert(
            corrections,
          )
          .values({
            targetType:
              'CUSTOMER',

            targetId:
              customerId,

            targetLabel:
              `Customer / ${before.name}`,

            requestedByUserId:
              actorId,

            reviewedByUserId:
              actorId,

            status:
              'APPLIED',

            beforeValues:
              before,

            afterValues:
              appliedAfter,

            reason,

            reviewedAt:
              now,

            appliedAt:
              now,
          });
      }
    },
  );
}


export async function submitCustomerFixAction(
  formData: FormData,
) {
  const user =
    await requirePermission('customers.edit');

  const customerId =
    cleanRequired(
      formData.get(
        'customerId',
      ),
    );

  if (!customerId) {
    redirect(
      '/customers',
    );
  }

  const reason =
    cleanRequired(
      formData.get(
        'reason',
      ),
    );

  if (!reason) {
    redirect(
      customerErrorHref(
        customerId,
        'Explain what was entered wrong.',
      ),
    );
  }

  try {
    const [customer] =
      await db
        .select()
        .from(
          customers,
        )
        .where(
          eq(
            customers.id,
            customerId,
          ),
        )
        .limit(1);

    if (
      !customer ||
      customer.status !==
        'ACTIVE'
    ) {
      throw new CustomerFixError(
        'Customer was not found.',
      );
    }

    const before =
      valuesFromCustomer(
        customer,
      );

    const after:
      CustomerFixValues = {
      ...before,

      name:
        cleanRequired(
          formData.get(
            'name',
          ),
        ),

      phone:
        cleanOptional(
          formData.get(
            'phone',
          ),
        ),

      notes:
        cleanOptional(
          formData.get(
            'notes',
          ),
        ),
    };

    validateAfter(
      after,
    );

    if (
      sameEditableValues(
        before,
        after,
      )
    ) {
      throw new CustomerFixError(
        'Nothing was changed.',
      );
    }

    if (
      user.role ===
      'EMPLOYEE'
    ) {
      const [pending] =
        await db
          .select({
            id:
              corrections.id,
          })
          .from(
            corrections,
          )
          .where(
            and(
              eq(
                corrections.targetType,
                'CUSTOMER',
              ),
              eq(
                corrections.targetId,
                customerId,
              ),
              eq(
                corrections.status,
                'PENDING',
              ),
            ),
          )
          .limit(1);

      if (pending) {
        throw new CustomerFixError(
          'A customer fix request is already waiting for the owner.',
        );
      }

      await db
        .insert(
          corrections,
        )
        .values({
          targetType:
            'CUSTOMER',

          targetId:
            customerId,

          targetLabel:
            `Customer / ${customer.name}`,

          requestedByUserId:
            user.id,

          status:
            'PENDING',

          beforeValues:
            before,

          afterValues:
            after,

          reason,
        });

      revalidateCustomerPaths(
        customerId,
      );

      redirect(
        `/customers/${customerId}?requestSent=1`,
      );
    }

    await applyCustomerFix(
      customerId,
      before,
      after,
      user.id,
      reason,
      null,
    );
  } catch (error) {
    if (
      error instanceof
      CustomerFixError
    ) {
      redirect(
        customerErrorHref(
          customerId,
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateCustomerPaths(
    customerId,
  );

  redirect(
    `/customers/${customerId}?fixed=1`,
  );
}


export async function approveCustomerFixRequestAction(
  formData: FormData,
) {
  const owner =
    await requireOwner();

  const correctionId =
    cleanRequired(
      formData.get(
        'correctionId',
      ),
    );

  if (!correctionId) {
    redirect(
      requestErrorHref(
        'Request was not found.',
      ),
    );
  }

  const [request] =
    await db
      .select()
      .from(
        corrections,
      )
      .where(
        and(
          eq(
            corrections.id,
            correctionId,
          ),
          eq(
            corrections.targetType,
            'CUSTOMER',
          ),
          eq(
            corrections.status,
            'PENDING',
          ),
        ),
      )
      .limit(1);

  if (!request) {
    redirect(
      requestErrorHref(
        'Request was not found.',
      ),
    );
  }

  try {
    const before =
      valuesFromSnapshot(
        request.beforeValues,
      );

    const after =
      valuesFromSnapshot(
        request.afterValues,
      );

    await applyCustomerFix(
      request.targetId,
      before,
      after,
      owner.id,
      request.reason,
      request.id,
    );
  } catch (error) {
    if (
      error instanceof
      CustomerFixError
    ) {
      redirect(
        requestErrorHref(
          error.message,
        ),
      );
    }

    throw error;
  }

  revalidateCustomerPaths(
    request.targetId,
  );

  redirect(
    '/requests?approved=1',
  );
}


/*
 * This action is not currently exposed by the UI.
 * Keep it owner-only so staff cannot silently remove
 * a saved customer.
 */
export async function archiveCustomerAction(
  formData: FormData,
) {
  await requireOwner();

  const customerId =
    cleanRequired(
      formData.get(
        'customerId',
      ),
    );

  if (!customerId) {
    return;
  }

  await db
    .update(
      customers,
    )
    .set({
      status:
        'ARCHIVED',

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        customers.id,
        customerId,
      ),
    );

  revalidateCustomerPaths(
    customerId,
  );
}
