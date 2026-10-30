import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const url = new URL(
  process.env.DATABASE_URL || 'postgresql://invalid/'
);

assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_external_sales_test');
assert.equal(url.username, 'postgres');
assert.notEqual(process.env.VERCEL, '1');

const authModule = pathToFileURL(
  resolve(process.cwd(), 'external-sales-auth.test.mjs')
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/cache') {
      return {
        url: pathToFileURL(
          resolve(process.cwd(), 'external-sales-cache.test.mjs')
        ).href,
        shortCircuit: true,
      };
    }

    if (specifier === 'server-only') {
      return {
        url: 'data:text/javascript,export%20%7B%7D',
        shortCircuit: true,
      };
    }

    if (
      specifier === '@/lib/auth/require-permission' ||
      specifier === '@/lib/auth/session'
    ) {
      return {
        url: authModule,
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

const client = new pg.Client({
  connectionString: url.toString(),
  connectionTimeoutMillis: 5000,
});

const label = `External sales test ${randomUUID()}`;

let ownerId;
let employeeId;
let supplierId;
let saleId;
let drawerId;

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`PASS | ${name}`);
  } catch (error) {
    results.push(['FAIL', name]);
    console.error(`FAIL | ${name} | ${error?.message || error}`);
  }
}

function form(values) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, String(value));
  }

  return data;
}

async function one(sql, params = []) {
  return (await client.query(sql, params)).rows[0];
}

function owner() {
  globalThis.__mossetechTestUser = {
    id: ownerId,
    role: 'OWNER',
    status: 'ACTIVE',
  };
}

function employee() {
  globalThis.__mossetechTestUser = {
    id: employeeId,
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    grants: [],
  };
}

const moduleUrl = (path) =>
  pathToFileURL(resolve(process.cwd(), path)).href;

try {
  await client.connect();

  const identity = await one(
    'SELECT current_database() AS database'
  );

  assert.equal(
    identity.database,
    'mossetech_external_sales_test'
  );

  const sales = await import(
    moduleUrl('src/lib/external-sales/actions.ts')
  );

  const settlement = await import(
    moduleUrl('src/lib/external-sales/settlement-actions.ts')
  );

  const shops = await import(
    moduleUrl('src/lib/external-sales/shop-actions.ts')
  );

  const reports = await import(
    moduleUrl('src/lib/reports/report-data.ts')
  );

  const balances = await import(
    moduleUrl('src/lib/money/balance.ts')
  );

  ownerId = (
    await one(
      `INSERT INTO users(name,email,password_hash,role)
       VALUES($1,$2,'test-only','OWNER')
       RETURNING id`,
      [label + ' owner', randomUUID() + '@invalid.example']
    )
  ).id;

  employeeId = (
    await one(
      `INSERT INTO users(name,email,password_hash,role)
       VALUES($1,$2,'test-only','EMPLOYEE')
       RETURNING id`,
      [label + ' employee', randomUUID() + '@invalid.example']
    )
  ).id;

  owner();

  await check('01 | Create source shop', async () => {
    const r = await shops.createExternalSourceShopAction({
      name: label,
      phone: '0780000000',
    });

    assert.ok(r.shop?.id, r.error);
    supplierId = r.shop.id;
  });

  await check('02 | Reuse existing source shop', async () => {
    const r = await shops.createExternalSourceShopAction({
      name: label,
      phone: '',
    });

    assert.equal(r.shop?.id, supplierId);
  });

  await check('03 | Employee cannot add source shop', async () => {
    employee();

    try {
      await shops.createExternalSourceShopAction({
        name: label + ' unauthorized',
        phone: '',
      });

      assert.fail('Employee created supplier');
    } catch (e) {
      assert.match(String(e), /TEST_OWNER_REQUIRED/);
    } finally {
      owner();
    }
  });

  await check('04 | Create sale draft', async () => {
    const r = await sales.createExternalSaleDraftAction(
      {},
      form({
        idempotencyKey: randomUUID(),
        supplierId,
        productName: 'Test Laptop',
        quantity: '1',
        agreedSupplierTotal: '350000',
        customerTotal: '400000',
        customerName: 'Test Buyer',
      })
    );

    assert.ok(r.externalSaleId, r.error);
    saleId = r.externalSaleId;

    const row = await one(
      'SELECT status FROM external_sales WHERE id=$1',
      [saleId]
    );

    assert.equal(row.status, 'DRAFT');
  });


  await check('04A | Edit saved draft', async () => {
    const result = await sales.updateExternalSaleDraftAction(
      {},
      form({
        externalSaleId: saleId,
        supplierId,
        productName: 'Edited Test Laptop',
        customerName: 'Updated Buyer',
        quantity: '3',
        agreedSupplierTotal: '360000',
        customerTotal: '420000',
        notes: 'Draft editing verification',
      }),
    );

    assert.equal(result.externalSaleId, saleId, result.error);

    const row = await one(
      `SELECT product_name,customer_name,quantity,
              agreed_supplier_total,customer_total,
              notes,status
       FROM external_sales WHERE id=$1`,
      [saleId],
    );

    assert.equal(row.product_name, 'Edited Test Laptop');
    assert.equal(row.customer_name, 'Updated Buyer');
    assert.equal(row.quantity, 3);
    assert.equal(Number(row.agreed_supplier_total), 360000);
    assert.equal(Number(row.customer_total), 420000);
    assert.equal(row.notes, 'Draft editing verification');
    assert.equal(row.status, 'DRAFT');
  });

  await check('04B | Reject invalid draft quantity', async () => {
    const before = await one(
      `SELECT product_name,quantity,customer_total
       FROM external_sales WHERE id=$1`,
      [saleId],
    );

    const result = await sales.updateExternalSaleDraftAction(
      {},
      form({
        externalSaleId: saleId,
        supplierId,
        productName: 'Should Not Save',
        quantity: '0',
        agreedSupplierTotal: '350000',
        customerTotal: '400000',
      }),
    );

    assert.ok(result.error);

    const after = await one(
      `SELECT product_name,quantity,customer_total
       FROM external_sales WHERE id=$1`,
      [saleId],
    );

    assert.deepEqual(after, before);
  });

  await check('04C | Restore draft before completion', async () => {
    const result = await sales.updateExternalSaleDraftAction(
      {},
      form({
        externalSaleId: saleId,
        supplierId,
        productName: 'Test Laptop',
        customerName: 'Test Buyer',
        quantity: '1',
        agreedSupplierTotal: '350000',
        customerTotal: '400000',
        notes: '',
      }),
    );

    assert.equal(result.externalSaleId, saleId, result.error);
  });

  await check('05 | Reject payment on draft', async () => {
    const r = await sales.receiveExternalCustomerPaymentAction(
      form({
        externalSaleId: saleId,
        idempotencyKey: randomUUID(),
        amount: '100',
        paymentMethod: 'BANK',
      })
    );

    assert.equal(r.success, false);
  });

  await check('06 | Complete sale only once', async () => {
    const first = await sales.completeExternalSaleAction(saleId);
    const second = await sales.completeExternalSaleAction(saleId);

    assert.equal(first.success, true);
    assert.equal(second.success, false);
  });


  await check('06A | Finalized sale rejects editing', async () => {
    const before = await one(
      `SELECT product_name,quantity,customer_total,
              agreed_supplier_total,status
       FROM external_sales WHERE id=$1`,
      [saleId],
    );

    const result = await sales.updateExternalSaleDraftAction(
      {},
      form({
        externalSaleId: saleId,
        supplierId,
        productName: 'Unauthorized Completed Edit',
        quantity: '9',
        agreedSupplierTotal: '1',
        customerTotal: '1',
      }),
    );

    assert.ok(result.error);
    assert.equal(result.externalSaleId, undefined);

    const after = await one(
      `SELECT product_name,quantity,customer_total,
              agreed_supplier_total,status
       FROM external_sales WHERE id=$1`,
      [saleId],
    );

    assert.deepEqual(after, before);
    assert.equal(after.status, 'POSTED');
  });

  await check('07 | Reject overpayment', async () => {
    const r = await sales.receiveExternalCustomerPaymentAction(
      form({
        externalSaleId: saleId,
        idempotencyKey: randomUUID(),
        amount: '400001',
        paymentMethod: 'BANK',
      })
    );

    assert.equal(r.success, false);
  });

  await check('08 | Reject cash without drawer', async () => {
    const r = await sales.receiveExternalCustomerPaymentAction(
      form({
        externalSaleId: saleId,
        idempotencyKey: randomUUID(),
        amount: '100000',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, false);
  });

  await check('09 | Open isolated cash drawer', async () => {
    drawerId = (
      await one(
        `INSERT INTO cash_drawers
         (opened_by_user_id, opening_cash)
         VALUES ($1,100000)
         RETURNING id`,
        [ownerId]
      )
    ).id;

    assert.ok(drawerId);
  });

  const cashKey = randomUUID();

  await check('10 | Record cash and drawer movement', async () => {
    const r = await sales.receiveExternalCustomerPaymentAction(
      form({
        externalSaleId: saleId,
        idempotencyKey: cashKey,
        amount: '100000',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, true, r.error);

    const row = await one(
      `SELECT p.amount, m.id AS movement_id, m.direction
       FROM external_customer_payments p
       LEFT JOIN cash_drawer_movements m
       ON m.external_customer_payment_id=p.id
       WHERE p.idempotency_key=$1`,
      [cashKey]
    );

    assert.equal(Number(row.amount), 100000);
    assert.ok(row.movement_id);
    assert.equal(row.direction, 'IN');
  });

  await check('11 | Prevent duplicate cash payment', async () => {
    const r = await sales.receiveExternalCustomerPaymentAction(
      form({
        externalSaleId: saleId,
        idempotencyKey: cashKey,
        amount: '100000',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, false);

    const row = await one(
      `SELECT count(*)::int AS total
       FROM external_customer_payments
       WHERE idempotency_key=$1`,
      [cashKey]
    );

    assert.equal(row.total, 1);
  });

  await check('12 | Concurrent payments cannot overpay', async () => {
    const attempts = await Promise.all(
      [200000, 200000].map((amount) =>
        sales.receiveExternalCustomerPaymentAction(
          form({
            externalSaleId: saleId,
            idempotencyKey: randomUUID(),
            amount,
            paymentMethod: 'BANK',
          })
        )
      )
    );

    assert.equal(
      attempts.filter((r) => r.success).length,
      1
    );

    const row = await one(
      `SELECT COALESCE(SUM(amount),0) AS total
       FROM external_customer_payments
       WHERE external_sale_id=$1`,
      [saleId]
    );

    assert.equal(Number(row.total), 300000);
  });

  await check('13 | Receive remaining customer balance', async () => {
    const r = await sales.receiveExternalCustomerPaymentAction(
      form({
        externalSaleId: saleId,
        idempotencyKey: randomUUID(),
        amount: '100000',
        paymentMethod: 'MOBILE_MONEY',
      })
    );

    assert.equal(r.success, true, r.error);
  });

  await check('14 | Employee cannot settle supplier', async () => {
    employee();

    try {
      await settlement.payExternalSupplierAction(
        form({
          externalSaleId: saleId,
          supplierId,
          idempotencyKey: randomUUID(),
          amount: '100',
          paymentMethod: 'CASH',
        })
      );

      assert.fail('Employee paid supplier');
    } catch (e) {
      assert.match(String(e), /TEST_OWNER_REQUIRED/);
    } finally {
      owner();
    }
  });

  await check('15 | Reject wrong source shop', async () => {
    const r = await settlement.payExternalSupplierAction(
      form({
        externalSaleId: saleId,
        supplierId: randomUUID(),
        idempotencyKey: randomUUID(),
        amount: '50000',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, false);
  });

  const settlementKey = randomUUID();

  await check('16 | Supplier payment moves cash out', async () => {
    const r = await settlement.payExternalSupplierAction(
      form({
        externalSaleId: saleId,
        supplierId,
        idempotencyKey: settlementKey,
        amount: '50000',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, true, r.error);

    const row = await one(
      `SELECT s.id, m.id AS movement_id, m.direction
       FROM external_supplier_settlements s
       LEFT JOIN cash_drawer_movements m
       ON m.external_supplier_settlement_id=s.id
       WHERE s.idempotency_key=$1`,
      [settlementKey]
    );

    assert.ok(row.id);
    assert.ok(row.movement_id);
    assert.equal(row.direction, 'OUT');
  });

  await check('17 | Reject duplicate supplier payment', async () => {
    const r = await settlement.payExternalSupplierAction(
      form({
        externalSaleId: saleId,
        supplierId,
        idempotencyKey: settlementKey,
        amount: '50000',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, false);
  });

  await check('18 | Reject insufficient cash', async () => {
    const r = await settlement.payExternalSupplierAction(
      form({
        externalSaleId: saleId,
        supplierId,
        idempotencyKey: randomUUID(),
        amount: '150001',
        paymentMethod: 'CASH',
      })
    );

    assert.equal(r.success, false);
  });

  await check('19 | Cash + MoMo + Bank balances', async () => {
    const values = await balances.getMoneyBalances();

    assert.equal(
      Number(values.find(v => v.method === 'CASH')?.balance),
      50000
    );
    assert.equal(
      Number(values.find(v => v.method === 'BANK')?.balance),
      200000
    );
    assert.equal(
      Number(values.find(v => v.method === 'MOBILE_MONEY')?.balance),
      100000
    );

    const rows = await client.query(
      `SELECT payment_method, SUM(amount)::numeric AS total
       FROM external_customer_payments
       WHERE external_sale_id=$1
       GROUP BY payment_method`,
      [saleId]
    );

    const paid = Object.fromEntries(
      rows.rows.map(row => [row.payment_method, Number(row.total)])
    );

    assert.equal(paid.CASH, 100000);
    assert.equal(paid.BANK, 200000);
    assert.equal(paid.MOBILE_MONEY, 100000);

    assert.equal(
      Object.values(paid).reduce((sum, amount) => sum + amount, 0),
      400000
    );
  });

  await check('20 | Verify real Reports calculations', async () => {
    const today = reports.getTodayInputDate();

    const report = await reports.getReport({
      preset: 'custom',
      fromDate: today,
      toDate: today,
      fromTime: '00:00',
      toTime: '23:59',
    });

    assert.equal(report.external.salesTotal, 400000);
    assert.equal(report.external.supplierCost, 350000);
    assert.equal(report.external.grossProfit, 50000);
    assert.equal(report.external.supplierOutstanding, 300000);
    assert.equal(report.summary.salesTotal, 400000);
    assert.equal(report.summary.moneyReceived, 400000);
  });

  await check('21 | Verify owned inventory unaffected', async () => {
    const arrivals = await one(
      'SELECT count(*)::int AS total FROM stock_arrivals'
    );

    const items = await one(
      'SELECT count(*)::int AS total FROM sale_items'
    );

    assert.equal(arrivals.total, 0);
    assert.equal(items.total, 0);
  });

} catch (error) {
  console.error('FATAL:', error?.stack || error);
  results.push(['FAIL', 'Setup or application import']);
} finally {
  try {
    if (client._connected) {
      await client.query('BEGIN');

      if (saleId) {
        await client.query(
          `DELETE FROM cash_drawer_movements
           WHERE external_customer_payment_id IN (
             SELECT id FROM external_customer_payments
             WHERE external_sale_id=$1
           )
           OR external_supplier_settlement_id IN (
             SELECT id FROM external_supplier_settlements
             WHERE external_sale_id=$1
           )`,
          [saleId]
        );

        await client.query(
          'DELETE FROM external_customer_payments WHERE external_sale_id=$1',
          [saleId]
        );

        await client.query(
          'DELETE FROM external_supplier_settlements WHERE external_sale_id=$1',
          [saleId]
        );

        await client.query(
          'DELETE FROM external_sales WHERE id=$1',
          [saleId]
        );
      }

      if (drawerId) {
        await client.query(
          'DELETE FROM cash_drawers WHERE id=$1',
          [drawerId]
        );
      }

      if (supplierId) {
        await client.query(
          'DELETE FROM suppliers WHERE id=$1',
          [supplierId]
        );
      }

      if (employeeId) {
        await client.query(
          'DELETE FROM users WHERE id=$1',
          [employeeId]
        );
      }

      if (ownerId) {
        await client.query(
          'DELETE FROM users WHERE id=$1',
          [ownerId]
        );
      }

      await client.query('COMMIT');

      console.log('Local test fixtures removed.');
    }
  } catch (error) {
    console.error('CLEANUP ERROR:', error?.message || error);
    await client.query('ROLLBACK').catch(() => {});
    results.push(['FAIL', 'Test cleanup']);
  }

  await client.end().catch(() => {});

  const failures = results.filter(([status]) => status === 'FAIL');

  console.log('\n=== CONSOLIDATED FINANCIAL ACTION RESULTS ===');
  console.log('Passed:', results.length - failures.length);
  console.log('Failed:', failures.length);
  console.log('Actual browser-session authentication was not tested.');
  console.log('Test target: isolated local PostgreSQL.');

  if (failures.length) {
    process.exitCode = 1;
  }
}
