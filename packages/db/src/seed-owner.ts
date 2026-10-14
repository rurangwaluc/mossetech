import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { businessSettings, users } from './schema.ts';
import { db, queryClient } from './client.ts';

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

const ownerEmail = requiredEnv('OWNER_EMAIL');
const ownerPassword = requiredEnv('OWNER_PASSWORD');

const ownerName =
  process.env.OWNER_NAME?.trim() ||
  'Denis';

const businessName =
  process.env.BUSINESS_NAME?.trim() ||
  'Bloom Kigali';

const businessPhone =
  process.env.BUSINESS_PHONE?.trim() ||
  '';

const employeeEmail =
  process.env.EMPLOYEE_EMAIL?.trim();

const employeePassword =
  employeeEmail
    ? requiredEnv('EMPLOYEE_PASSWORD')
    : null;

const employeeName =
  process.env.EMPLOYEE_NAME?.trim() ||
  'Staff';

async function upsertUser(input: {
  email: string;
  password: string;
  name: string;
  role: 'OWNER' | 'EMPLOYEE';
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const email = input.email.toLowerCase();

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    await db
      .update(users)
      .set({
        name: input.name,
        passwordHash,
        role: input.role,
        status: 'ACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(users.email, email));

    console.log(`${input.role} updated successfully.`);
  } else {
    await db.insert(users).values({
      name: input.name,
      email,
      passwordHash,
      role: input.role,
      status: 'ACTIVE',
    });

    console.log(`${input.role} created successfully.`);
  }

  console.log('Email:', email);
}

async function main() {
  await upsertUser({
    email: ownerEmail,
    password: ownerPassword,
    name: ownerName,
    role: 'OWNER',
  });

  if (employeeEmail && employeePassword) {
    await upsertUser({
      email: employeeEmail,
      password: employeePassword,
      name: employeeName,
      role: 'EMPLOYEE',
    });
  }

  const existingSettings =
    await db.query.businessSettings.findFirst();

  if (!existingSettings) {
    await db.insert(businessSettings).values({
      businessName,
      ownerName,
      phone: businessPhone,
      currency: 'RWF',
    });
  } else {
    await db
      .update(businessSettings)
      .set({
        businessName,
        ownerName,
        phone: businessPhone,
        updatedAt: new Date(),
      })
      .where(eq(businessSettings.id, existingSettings.id));
  }

  console.log('Bloom Kigali setup completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
