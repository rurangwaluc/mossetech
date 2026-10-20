'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@mossetech/db/client';
import {
  businessSettings,
  users,
} from '@mossetech/db/schema';
import {
  businessSettingsSchema,
  ownerProfileSchema,
} from '@mossetech/validators/settings';
import { requireOwner } from '@/lib/auth/session';

export type SettingsState = {
  error?: string;
  success?: string;
};

function formText(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);

  return typeof value === 'string'
    ? value
    : '';
}

function optionalFormText(
  formData: FormData,
  key: string,
) {
  const value = formText(
    formData,
    key,
  ).trim();

  return value
    ? value
    : undefined;
}

export async function updateBusinessSettingsAction(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const owner = await requireOwner();

  const currentSettings =
    await db.query.businessSettings.findFirst();

  const parsed =
    businessSettingsSchema.safeParse({
      businessName: formText(
        formData,
        'businessName',
      ),

      phone: optionalFormText(
        formData,
        'phone',
      ),

      address: optionalFormText(
        formData,
        'address',
      ),

      currency: 'RWF',
    });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ||
        'Check the business details.',
    };
  }

  /*
   * These legacy values remain in the schema for compatibility.
   * Product-level stock controls are used by Mosse Tech.
   */
  const lowStockAlertQuantity =
    currentSettings?.lowStockAlertQuantity ||
    '5';

  const expiryAlertDays =
    currentSettings?.expiryAlertDays ||
    '60';

  if (!currentSettings) {
    await db
      .insert(businessSettings)
      .values({
        businessName:
          parsed.data.businessName,

        /*
         * ownerName remains in the legacy business_settings
         * table, but is no longer edited from Business settings.
         */
        ownerName:
          owner.name || 'Owner',

        phone:
          parsed.data.phone ||
          null,

        address:
          parsed.data.address ||
          null,

        currency: 'RWF',

        lowStockAlertQuantity,
        expiryAlertDays,
      });
  } else {
    await db
      .update(businessSettings)
      .set({
        businessName:
          parsed.data.businessName,

        phone:
          parsed.data.phone ||
          null,

        address:
          parsed.data.address ||
          null,

        currency: 'RWF',
        updatedAt: new Date(),
      })
      .where(
        eq(
          businessSettings.id,
          currentSettings.id,
        ),
      );
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/reports');

  return {
    success:
      'Business details saved.',
  };
}

export async function updateOwnerProfileAction(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const owner = await requireOwner();

  const parsed =
    ownerProfileSchema.safeParse({
      name: formText(
        formData,
        'name',
      ),

      phone: optionalFormText(
        formData,
        'phone',
      ),
    });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ||
        'Check the owner details.',
    };
  }

  const currentSettings =
    await db.query.businessSettings.findFirst();

  await db.transaction(
    async (tx) => {
      await tx
        .update(users)
        .set({
          name: parsed.data.name,
          phone:
            parsed.data.phone ||
            null,
          updatedAt: new Date(),
        })
        .where(
          eq(
            users.id,
            owner.id,
          ),
        );

      /*
       * Keep the old owner_name column synchronized while
       * existing reports or legacy code may still reference it.
       */
      if (currentSettings) {
        await tx
          .update(businessSettings)
          .set({
            ownerName:
              parsed.data.name,
            updatedAt:
              new Date(),
          })
          .where(
            eq(
              businessSettings.id,
              currentSettings.id,
            ),
          );
      }
    },
  );

  revalidatePath('/settings');
  revalidatePath('/dashboard');

  return {
    success:
      'Owner account updated.',
  };
}
