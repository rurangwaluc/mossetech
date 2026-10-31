const KEEP = '09dd0b0a-d68d-4671-afd7-6ac7025a0974';
const DUP = '80a08afd-14d9-416d-9f52-3b2318e23d15';
const PAYMENT = 'a094d55a-593f-446c-b348-3d4b8a34599d';

const sale = id => ({
  id,
  status: 'POSTED',
  customerName: 'Zechariah',
  productName: 'Lenovo Thinkbook',
  quantity: 1,
  supplierId: '00000000-0000-4000-8000-000000000009',
  customerTotal: '735000.00',
  agreedSupplierTotal: '680000.00',
});

export const state =
  globalThis.__paidDuplicateTestState ??=
  {
  genuine: sale(KEEP),
  duplicate: sale(DUP),
  payment: {
    id: PAYMENT,
    externalSaleId: DUP,
    paymentMethod: 'MOBILE_MONEY',
    amount: '735000.00',
  },
  audits: [],
};

function tableName(table) {
  return String(table[Symbol.for('drizzle:Name')]);
}

export const db = {
  async transaction(callback) {
    const originalStatus = state.duplicate.status;
    const originalAudits = [...state.audits];

    const tx = {
      select() {
        return {
          from(table) {
            const name = tableName(table);

            const query = {
              where() {
                return query;
              },
              orderBy() {
                return query;
              },
              async for() {
                return [state.genuine, state.duplicate];
              },
              then(resolve, reject) {
                let rows;

                switch (name) {
                  case 'external_customer_payments':
                    rows = [state.payment];
                    break;
                  case 'external_supplier_settlements':
                  case 'cash_drawer_movements':
                    rows = [];
                    break;
                  default:
                    rows = [];
                }

                return Promise.resolve(rows).then(resolve, reject);
              },
            };

            return query;
          },
        };
      },
      update(table) {
        if (tableName(table) !== 'external_sales') {
          throw new Error('Unexpected update table');
        }

        return {
          set(values) {
            return {
              where() {
                return {
                  async returning() {
                    if (state.duplicate.status !== 'POSTED') {
                      return [];
                    }

                    if (state.duplicate.id !== DUP) {
                      throw new Error('Unexpected duplicate ID');
                    }

                    if (values.status !== 'CANCELLED') {
                      throw new Error('Unexpected status update');
                    }

                    Object.assign(state.duplicate, values);
                    return [{ id: DUP }];
                  },
                };
              },
            };
          },
        };
      },
      insert(table) {
        if (tableName(table) !== 'corrections') {
          throw new Error('Unexpected insert table');
        }

        return {
          async values(values) {
            state.audits.push(values);
          },
        };
      },
    };

    try {
      return await callback(tx);
    } catch (error) {
      state.duplicate.status = originalStatus;
      state.audits = originalAudits;
      throw error;
    }
  },
};
