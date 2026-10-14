import { z } from 'zod';

const moneySchema = z
  .string()
  .trim()
  .regex(
    /^[0-9]+(\.[0-9]{1,2})?$/,
    'Enter a valid amount.',
  );

export const externalMoneyAdditionSchema =
  z.object({
    paymentMethod: z.enum([
      'MOBILE_MONEY',
      'BANK',
      'CARD',
    ]),

    amount: moneySchema,

    reason: z
      .string()
      .trim()
      .min(
        1,
        'Enter why this money was added.',
      )
      .max(1000),
  });

export const moneyReversalSchema =
  z.object({
    targetId: z
      .string()
      .uuid(
        'This money record is not valid.',
      ),

    reason: z
      .string()
      .trim()
      .min(
        1,
        'Explain why this money entry is being reversed.',
      )
      .max(1000),
  });

export type ExternalMoneyAdditionInput =
  z.infer<
    typeof externalMoneyAdditionSchema
  >;

export type MoneyReversalInput =
  z.infer<
    typeof moneyReversalSchema
  >;
