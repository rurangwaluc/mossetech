const state = globalThis.__cancellationTestState;

function select() {
  return {
    from(table) {
      const name = String(table[Symbol.for('drizzle:Name')] || '');

      return {
        where() {
          if (name === 'external_sales') {
            return {
              limit() {
                return {
                  async for() {
                    return state.sale ? [{ ...state.sale }] : [];
                  },
                };
              },
            };
          }

          return {
            async limit() {
              if (name === 'external_customer_payments') {
                return state.customerPayments ? [{ id: 'payment' }] : [];
              }
              if (name === 'external_supplier_settlements') {
                return state.supplierPayments ? [{ id: 'settlement' }] : [];
              }
              throw new Error('Unexpected test table: ' + name);
            },
          };
        },
      };
    },
  };
}

export const db = {
  async transaction(callback) {
    const originalSale = state.sale ? { ...state.sale } : null;
    const originalAudits = [...state.audits];

    const tx = {
      select,
      update() {
        return {
          set(values) {
            return {
              where() {
                return {
                  async returning() {
                    if (!state.sale || state.sale.status === 'CANCELLED') {
                      return [];
                    }
                    Object.assign(state.sale, values);
                    return [{ id: state.sale.id }];
                  },
                };
              },
            };
          },
        };
      },
      insert() {
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
      state.sale = originalSale;
      state.audits = originalAudits;
      throw error;
    }
  },
};
