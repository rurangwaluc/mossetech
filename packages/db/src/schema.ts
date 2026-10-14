import {
  relations,
  sql,
} from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['OWNER', 'EMPLOYEE']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'DISABLED']);
export const productStatusEnum = pgEnum('product_status', ['ACTIVE', 'ARCHIVED']);
export const itemTypeEnum = pgEnum('item_type', ['PRODUCT', 'SERVICE']);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'MOBILE_MONEY', 'BANK', 'CARD']);

export const salePaymentTypeEnum = pgEnum(
  'sale_payment_type',
  ['AT_SALE', 'LATER_PAYMENT'],
);
export const customerStatusEnum = pgEnum('customer_status', ['ACTIVE', 'ARCHIVED']);

export const correctionStatusEnum = pgEnum(
  'correction_status',
  ['PENDING', 'APPLIED', 'REJECTED'],
);

export const cashDrawerStatusEnum = pgEnum('cash_drawer_status', ['OPEN', 'CLOSED']);
export const cashDrawerMovementTypeEnum = pgEnum('cash_drawer_movement_type', [
  'OPENING_CASH',
  'CASH_SALE',
  'CUSTOMER_EXTRA_KEPT',
  'CASH_ADDED',
  'CASH_REMOVED',
  'CASH_DEPOSIT',
  'CASH_DEPOSIT_REVERSAL',
  'CASH_EXPENSE',
  'EXPENSE_CORRECTION',
  'CASH_DEBT_PAYMENT',
  'PAYMENT_CORRECTION',
  'CLOSING_COUNT',
  'CASH_DIFFERENCE',
]);
export const cashDrawerDirectionEnum = pgEnum('cash_drawer_direction', ['IN', 'OUT', 'NONE']);
export const cashDrawerDifferenceTypeEnum = pgEnum('cash_drawer_difference_type', [
  'NONE',
  'EXTRA',
  'MISSING',
]);


export const offlineOperationStatusEnum = pgEnum(
  'offline_operation_status',
  ['PROCESSING', 'COMPLETED'],
);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 180 }).notNull().unique(),
  phone: varchar('phone', { length: 40 }),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('OWNER'),
  status: userStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const offlineOperations = pgTable(
  'offline_operations',
  {
    operationId: uuid('operation_id').primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
      }),

    kind: varchar('kind', {
      length: 80,
    }).notNull(),

    payloadHash: varchar('payload_hash', {
      length: 64,
    }).notNull(),

    status: offlineOperationStatusEnum(
      'status',
    )
      .notNull()
      .default('PROCESSING'),

    result: jsonb('result'),

    clientCreatedAt: timestamp(
      'client_created_at',
      {
        withTimezone: true,
      },
    ).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    completedAt: timestamp(
      'completed_at',
      {
        withTimezone: true,
      },
    ),
  },
);

export const businessSettings = pgTable('business_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessName: varchar('business_name', { length: 160 }).notNull(),
  ownerName: varchar('owner_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 40 }),
  address: text('address'),
  currency: varchar('currency', { length: 12 }).notNull().default('RWF'),
  lowStockAlertQuantity: varchar('low_stock_alert_quantity', { length: 20 }).notNull().default('5'),
  expiryAlertDays: varchar('expiry_alert_days', { length: 20 }).notNull().default('60'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  phone: varchar('phone', { length: 40 }),
  notes: text('notes'),
  status: customerStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemType: itemTypeEnum('item_type').notNull().default('PRODUCT'),
  name: varchar('name', { length: 180 }).notNull(),
  category: varchar('category', { length: 120 }).notNull(),
  customerType: varchar('customer_type', { length: 40 }).notNull().default('Unisex'),
  ageStage: varchar('age_stage', { length: 60 }),
  size: varchar('size', { length: 60 }),
  color: varchar('color', { length: 80 }),
  unit: varchar('unit', { length: 40 }).notNull().default('piece'),
  batchNumber: varchar('batch_number', { length: 80 }),
  supplierName: varchar('supplier_name', { length: 160 }),
  buyingPrice: numeric('buying_price', { precision: 12, scale: 2 }).notNull().default('0'),
  sellingPrice: numeric('selling_price', { precision: 12, scale: 2 }).notNull().default('0'),
  wholesalePrice: numeric('wholesale_price', { precision: 12, scale: 2 }).notNull().default('0'),
  wholesaleMinQuantity: integer('wholesale_min_quantity').notNull().default(0),
  quantity: integer('quantity').notNull().default(0),
  minQuantity: integer('min_quantity').notNull().default(5),
  expiryDate: date('expiry_date'),
  imageKey: text('image_key'),
  notes: text('notes'),
  status: productStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sales = pgTable('sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  customerName: varchar('customer_name', { length: 160 }),
  customerPhone: varchar('customer_phone', { length: 40 }),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('CASH'),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountReason: text('discount_reason'),
  discountGivenByUserId: uuid('discount_given_by_user_id')
    .references(() => users.id, { onDelete: 'restrict' }),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  amountReceived: numeric('amount_received', { precision: 12, scale: 2 }).notNull().default('0'),
  changeReturned: numeric('change_returned', { precision: 12, scale: 2 }).notNull().default('0'),
  extraKept: numeric('extra_kept', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  extraReason: text('extra_reason'),
  notes: text('notes'),
  saleDate: timestamp('sale_date', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const saleItems = pgTable('sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  itemName: varchar('item_name', { length: 180 }).notNull(),
  itemType: itemTypeEnum('item_type').notNull(),
  quantity: integer('quantity').notNull().default(1),
  priceType: varchar('price_type', { length: 40 }).notNull().default('RETAIL'),

  /*
   * Snapshot of the product's normal selling price
   * when this sale happened.
   */
  baseUnitPrice: numeric('base_unit_price', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  /*
   * Actual agreed selling price used for this sale.
   */
  unitPrice: numeric('unit_price', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  /*
   * Set only when the agreed selling price is above
   * the product's normal selling price.
   */
  priceAdjustedByUserId: uuid('price_adjusted_by_user_id')
    .references(() => users.id, { onDelete: 'restrict' }),

  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull().default('0'),
  profitAmount: numeric('profit_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const debtPayments = pgTable('debt_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  receivedByUserId: uuid('received_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('CASH'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const salePayments = pgTable('sale_payments', {
  id: uuid('id').defaultRandom().primaryKey(),

  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),

  /*
   * Nullable only because the old sales table did not
   * record who received the original at-sale payment.
   * All new payment writes must supply this value.
   */
  receivedByUserId: uuid('received_by_user_id')
    .references(() => users.id, { onDelete: 'restrict' }),

  /*
   * Temporary link while debt_payments is being replaced
   * by this unified ledger. It also makes legacy backfill
   * idempotent and traceable.
   */
  sourceDebtPaymentId: uuid('source_debt_payment_id')
    .unique()
    .references(() => debtPayments.id, { onDelete: 'set null' }),

  paymentType: salePaymentTypeEnum('payment_type')
    .notNull()
    .default('AT_SALE'),

  /*
   * A corrected payment keeps its original row for history.
   * Only active payment rows contribute to current money.
   */
  isActive: boolean('is_active')
    .notNull()
    .default(true),

  replacedAt: timestamp('replaced_at', {
    withTimezone: true,
  }),

  replacedByUserId: uuid('replaced_by_user_id')
    .references(() => users.id, {
      onDelete: 'restrict',
    }),

  paymentMethod: paymentMethodEnum('payment_method')
    .notNull()
    .default('CASH'),

  receivedAmount: numeric('received_amount', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  appliedAmount: numeric('applied_amount', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  returnedAmount: numeric('returned_amount', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  returnMethod: paymentMethodEnum('return_method'),

  extraKeptAmount: numeric('extra_kept_amount', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  extraReason: text('extra_reason'),
  notes: text('notes'),

  paidAt: timestamp('paid_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const stockArrivals = pgTable('stock_arrivals', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  receivedByUserId: uuid('received_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  productName: varchar('product_name', { length: 180 }).notNull(),
  quantityReceived: integer('quantity_received').notNull(),

  /*
   * Snapshot of the product's selling price when this
   * stock was received. Bloom uses selling value only;
   * legacy buying_price remains temporarily for compatibility.
   */
  sellingPriceSnapshot: numeric('selling_price_snapshot', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  buyingPrice: numeric('buying_price', { precision: 12, scale: 2 }).notNull().default('0'),
  supplierName: varchar('supplier_name', { length: 160 }),
  batchNumber: varchar('batch_number', { length: 80 }),
  expiryDate: date('expiry_date'),
  reference: varchar('reference', { length: 120 }),
  notes: text('notes'),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stockDamages = pgTable('stock_damages', {
  id: uuid('id').defaultRandom().primaryKey(),

  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, {
      onDelete: 'restrict',
    }),

  recordedByUserId: uuid('recorded_by_user_id')
    .notNull()
    .references(() => users.id, {
      onDelete: 'restrict',
    }),

  /*
   * Snapshot for readable history even if the product
   * name changes later.
   */
  productName: varchar('product_name', {
    length: 180,
  }).notNull(),

  quantityDamaged: integer('quantity_damaged')
    .notNull(),

  reason: text('reason').notNull(),
  notes: text('notes'),

  damagedAt: timestamp('damaged_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),

  recordedByUserId: uuid('recorded_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),

  name: varchar('name', { length: 180 }).notNull(),
  category: varchar('category', { length: 120 }).notNull().default('Other'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('CASH'),
  expenseDate: timestamp('expense_date', { withTimezone: true }).defaultNow().notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const moneyTransfers = pgTable('money_transfers', {
  id: uuid('id').defaultRandom().primaryKey(),

  movedByUserId: uuid('moved_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),

  fromPaymentMethod: paymentMethodEnum(
    'from_payment_method',
  ).notNull(),

  toPaymentMethod: paymentMethodEnum(
    'to_payment_method',
  ).notNull(),

  amount: numeric('amount', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  notes: text('notes'),

  reversedByUserId: uuid('reversed_by_user_id')
    .references(() => users.id, {
      onDelete: 'restrict',
    }),

  reversedAt: timestamp('reversed_at', {
    withTimezone: true,
  }),

  reversalReason: text('reversal_reason'),

  movedAt: timestamp('moved_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const moneyAdditions = pgTable('money_additions', {
  id: uuid('id').defaultRandom().primaryKey(),

  addedByUserId: uuid('added_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),

  paymentMethod: paymentMethodEnum('payment_method')
    .notNull(),

  amount: numeric('amount', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),

  notes: text('notes'),

  reversedByUserId: uuid('reversed_by_user_id')
    .references(() => users.id, {
      onDelete: 'restrict',
    }),

  reversedAt: timestamp('reversed_at', {
    withTimezone: true,
  }),

  reversalReason: text('reversal_reason'),

  addedAt: timestamp('added_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const corrections = pgTable('corrections', {
  id: uuid('id').defaultRandom().primaryKey(),

  targetType: varchar('target_type', { length: 60 }).notNull(),
  targetId: uuid('target_id').notNull(),
  targetLabel: varchar('target_label', { length: 180 }).notNull(),

  requestedByUserId: uuid('requested_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),

  reviewedByUserId: uuid('reviewed_by_user_id')
    .references(() => users.id, { onDelete: 'set null' }),

  status: correctionStatusEnum('status')
    .notNull()
    .default('PENDING'),

  beforeValues: jsonb('before_values')
    .$type<Record<string, unknown>>()
    .notNull(),

  afterValues: jsonb('after_values')
    .$type<Record<string, unknown>>()
    .notNull(),

  reason: text('reason').notNull(),
  reviewNote: text('review_note'),

  requestedAt: timestamp('requested_at', { withTimezone: true })
    .defaultNow()
    .notNull(),

  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});


export const cashDrawers = pgTable(
  'cash_drawers',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    closedByUserId: uuid('closed_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),

    status: cashDrawerStatusEnum('status')
      .notNull()
      .default('OPEN'),

    openingCash: numeric('opening_cash', {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default('0'),

    expectedCashAtClose: numeric('expected_cash_at_close', {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default('0'),

    countedCash: numeric('counted_cash', {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default('0'),

    differenceAmount: numeric('difference_amount', {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default('0'),

    differenceType: cashDrawerDifferenceTypeEnum(
      'difference_type',
    )
      .notNull()
      .default('NONE'),

    differenceReason: text('difference_reason'),
    openingNote: text('opening_note'),
    closingNote: text('closing_note'),

    openedAt: timestamp('opened_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    closedAt: timestamp('closed_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      'cash_drawers_single_open_idx',
    )
      .on(table.status)
      .where(
        sql`${table.status} = 'OPEN'`,
      ),

    index(
      'cash_drawers_status_idx',
    ).on(table.status),
  ],
);

export const cashDrawerMovements = pgTable('cash_drawer_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  drawerId: uuid('drawer_id')
    .notNull()
    .references(() => cashDrawers.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  movementType: cashDrawerMovementTypeEnum('movement_type').notNull(),
  direction: cashDrawerDirectionEnum('direction').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  reason: text('reason'),
  saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
  moneyTransferId: uuid('money_transfer_id').references(() => moneyTransfers.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  stockArrivals: many(stockArrivals),
  stockDamages: many(stockDamages),
  receivedDebtPayments: many(debtPayments),
  receivedSalePayments: many(salePayments),

  moneyAdditions: many(moneyAdditions, {
    relationName:
      'money_addition_added_by',
  }),

  reversedMoneyAdditions: many(
    moneyAdditions,
    {
      relationName:
        'money_addition_reversed_by',
    },
  ),

  moneyTransfers: many(moneyTransfers, {
    relationName:
      'money_transfer_moved_by',
  }),

  reversedMoneyTransfers: many(
    moneyTransfers,
    {
      relationName:
        'money_transfer_reversed_by',
    },
  ),

  requestedCorrections: many(corrections, {
    relationName: 'correction_requested_by',
  }),

  reviewedCorrections: many(corrections, {
    relationName: 'correction_reviewed_by',
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
}));

export const productsRelations = relations(products, ({ many }) => ({
  saleItems: many(saleItems),
  stockArrivals: many(stockArrivals),
  stockDamages: many(stockDamages),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  items: many(saleItems),
  debtPayments: many(debtPayments),
  payments: many(salePayments),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  sale: one(sales, {
    fields: [debtPayments.saleId],
    references: [sales.id],
  }),
  receivedBy: one(users, {
    fields: [debtPayments.receivedByUserId],
    references: [users.id],
  }),
}));

export const salePaymentsRelations = relations(
  salePayments,
  ({ one }) => ({
    sale: one(sales, {
      fields: [salePayments.saleId],
      references: [sales.id],
    }),

    receivedBy: one(users, {
      fields: [salePayments.receivedByUserId],
      references: [users.id],
    }),

    sourceDebtPayment: one(debtPayments, {
      fields: [
        salePayments.sourceDebtPaymentId,
      ],
      references: [
        debtPayments.id,
      ],
    }),
  }),
);

export const stockArrivalsRelations = relations(stockArrivals, ({ one }) => ({
  product: one(products, {
    fields: [stockArrivals.productId],
    references: [products.id],
  }),
  receivedBy: one(users, {
    fields: [stockArrivals.receivedByUserId],
    references: [users.id],
  }),
}));

export const stockDamagesRelations = relations(
  stockDamages,
  ({ one }) => ({
    product: one(products, {
      fields: [stockDamages.productId],
      references: [products.id],
    }),

    recordedBy: one(users, {
      fields: [stockDamages.recordedByUserId],
      references: [users.id],
    }),
  }),
);

export const moneyTransfersRelations = relations(
  moneyTransfers,
  ({ one }) => ({
    movedBy: one(users, {
      fields: [
        moneyTransfers.movedByUserId,
      ],
      references: [
        users.id,
      ],
      relationName:
        'money_transfer_moved_by',
    }),

    reversedBy: one(users, {
      fields: [
        moneyTransfers.reversedByUserId,
      ],
      references: [
        users.id,
      ],
      relationName:
        'money_transfer_reversed_by',
    }),
  }),
);

export const moneyAdditionsRelations = relations(
  moneyAdditions,
  ({ one }) => ({
    addedBy: one(users, {
      fields: [
        moneyAdditions.addedByUserId,
      ],
      references: [
        users.id,
      ],
      relationName:
        'money_addition_added_by',
    }),

    reversedBy: one(users, {
      fields: [
        moneyAdditions.reversedByUserId,
      ],
      references: [
        users.id,
      ],
      relationName:
        'money_addition_reversed_by',
    }),
  }),
);

export const correctionsRelations = relations(corrections, ({ one }) => ({
  requestedBy: one(users, {
    fields: [corrections.requestedByUserId],
    references: [users.id],
    relationName: 'correction_requested_by',
  }),

  reviewedBy: one(users, {
    fields: [corrections.reviewedByUserId],
    references: [users.id],
    relationName: 'correction_reviewed_by',
  }),
}));


export const cashDrawersRelations = relations(cashDrawers, ({ one, many }) => ({
  openedBy: one(users, {
    fields: [cashDrawers.openedByUserId],
    references: [users.id],
  }),
  closedBy: one(users, {
    fields: [cashDrawers.closedByUserId],
    references: [users.id],
  }),
  movements: many(cashDrawerMovements),
}));

export const cashDrawerMovementsRelations = relations(cashDrawerMovements, ({ one }) => ({
  drawer: one(cashDrawers, {
    fields: [cashDrawerMovements.drawerId],
    references: [cashDrawers.id],
  }),
  createdBy: one(users, {
    fields: [cashDrawerMovements.createdByUserId],
    references: [users.id],
  }),
  sale: one(sales, {
    fields: [cashDrawerMovements.saleId],
    references: [sales.id],
  }),
  expense: one(expenses, {
    fields: [cashDrawerMovements.expenseId],
    references: [expenses.id],
  }),
  moneyTransfer: one(moneyTransfers, {
    fields: [cashDrawerMovements.moneyTransferId],
    references: [moneyTransfers.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type OfflineOperation =
  typeof offlineOperations.$inferSelect;

export type NewOfflineOperation =
  typeof offlineOperations.$inferInsert;

export type BusinessSettings = typeof businessSettings.$inferSelect;
export type NewBusinessSettings = typeof businessSettings.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;

export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;

export type DebtPayment = typeof debtPayments.$inferSelect;
export type NewDebtPayment = typeof debtPayments.$inferInsert;

export type SalePayment = typeof salePayments.$inferSelect;
export type NewSalePayment = typeof salePayments.$inferInsert;

export type StockArrival = typeof stockArrivals.$inferSelect;
export type NewStockArrival = typeof stockArrivals.$inferInsert;

export type StockDamage = typeof stockDamages.$inferSelect;
export type NewStockDamage = typeof stockDamages.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type MoneyTransfer = typeof moneyTransfers.$inferSelect;
export type NewMoneyTransfer = typeof moneyTransfers.$inferInsert;

export type MoneyAddition = typeof moneyAdditions.$inferSelect;
export type NewMoneyAddition = typeof moneyAdditions.$inferInsert;


export type Correction = typeof corrections.$inferSelect;
export type NewCorrection = typeof corrections.$inferInsert;


export type CashDrawer = typeof cashDrawers.$inferSelect;
export type NewCashDrawer = typeof cashDrawers.$inferInsert;

export type CashDrawerMovement = typeof cashDrawerMovements.$inferSelect;
export type NewCashDrawerMovement = typeof cashDrawerMovements.$inferInsert;
