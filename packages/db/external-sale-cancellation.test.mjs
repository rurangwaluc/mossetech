import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL || '');

assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433');
assert.equal(url.pathname, '/mossetech_external_sales_test');

const client = new pg.Client({
  connectionString: url.toString(),
  connectionTimeoutMillis: 5000,
});

let started = false;

try {
  await client.connect();

  const identity = await client.query(
    'SELECT current_database() AS name'
  );

  assert.equal(identity.rows[0].name, 'mossetech_external_sales_test');

  await client.query('BEGIN');
  started = true;

  const owner = (await client.query(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Cancellation Test Owner', $1, 'test-only', 'OWNER')
    RETURNING id
  `, [`${randomUUID()}@invalid.example`])).rows[0].id;

  const supplier = (await client.query(`
    INSERT INTO suppliers (name)
    VALUES ('Cancellation Test Supplier')
    RETURNING id
  `)).rows[0].id;

  async function createSale() {
    const result = await client.query(`
      INSERT INTO external_sales (
        idempotency_key,
        supplier_id,
        created_by_user_id,
        customer_name,
        product_name,
        quantity,
        agreed_supplier_total,
        customer_total,
        status
      )
      VALUES ($1,$2,$3,'Test Customer','Test Laptop',1,680000,735000,'POSTED')
      RETURNING id
    `, [randomUUID(), supplier, owner]);

    return result.rows[0].id;
  }

  const unpaid = await createSale();
  const paid = await createSale();

  await client.query(`
    INSERT INTO external_customer_payments (
      idempotency_key,
      external_sale_id,
      received_by_user_id,
      amount,
      payment_method
    )
    VALUES ($1,$2,$3,735000,'MOBILE_MONEY')
  `, [randomUUID(), paid, owner]);

  const unpaidPayments = await client.query(`
    SELECT COUNT(*)::integer AS count
    FROM external_customer_payments
    WHERE external_sale_id = $1
  `, [unpaid]);

  assert.equal(unpaidPayments.rows[0].count, 0);

  console.log('PASS | Unpaid sale has no customer payments');

  const paidPayments = await client.query(`
    SELECT COUNT(*)::integer AS count
    FROM external_customer_payments
    WHERE external_sale_id = $1
  `, [paid]);

  assert.equal(paidPayments.rows[0].count, 1);

  console.log('PASS | Paid sale detected and must be blocked');

  const settlement = await createSale();

  await client.query(`
    INSERT INTO external_supplier_settlements (
      idempotency_key,
      external_sale_id,
      supplier_id,
      paid_by_user_id,
      amount,
      payment_method
    )
    VALUES ($1,$2,$3,$4,680000,'BANK')
  `, [randomUUID(), settlement, supplier, owner]);

  const settlementCount = await client.query(`
    SELECT COUNT(*)::integer AS count
    FROM external_supplier_settlements
    WHERE external_sale_id = $1
  `, [settlement]);

  assert.equal(settlementCount.rows[0].count, 1);

  console.log('PASS | Supplier settlement detected and must be blocked');

  const correction = await client.query(`
    INSERT INTO corrections (
      target_type,
      target_id,
      target_label,
      requested_by_user_id,
      reviewed_by_user_id,
      status,
      before_values,
      after_values,
      reason,
      reviewed_at,
      applied_at
    )
    VALUES (
      'EXTERNAL_SALE',
      $1,
      'Test cancellation',
      $2,
      $2,
      'APPLIED',
      '{"status":"POSTED"}'::jsonb,
      '{"status":"CANCELLED"}'::jsonb,
      'Isolated cancellation audit test',
      NOW(),
      NOW()
    )
    RETURNING id
  `, [unpaid, owner]);

  assert.equal(correction.rows.length, 1);

  console.log('PASS | Existing corrections schema supports cancellation audit');

  const stillPosted = await client.query(`
    SELECT COUNT(*)::integer AS count
    FROM external_sales
    WHERE id = ANY($1::uuid[]) AND status = 'POSTED'
  `, [[unpaid, paid, settlement]]);

  assert.equal(stillPosted.rows[0].count, 3);

  console.log('PASS | No test sale changed without explicit cancellation');

  console.log('PASS | Database cancellation prerequisites verified');

} catch (error) {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    await client.query('ROLLBACK').catch(() => {});
  }

  await client.end().catch(() => {});
  console.log('Test transaction rolled back.');
}
