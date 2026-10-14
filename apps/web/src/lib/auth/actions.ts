'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@mossetech/db/client';
import { sessions, users } from '@mossetech/db/schema';
import { loginSchema } from '@mossetech/validators/auth';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionExpiry,
  hashSessionToken,
  setSessionCookie,
  SESSION_COOKIE_NAME,
} from './session';

export type LoginState = {
  error?: string;
};

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Check your email and password.' };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email.toLowerCase()),
  });

  if (!user || user.status !== 'ACTIVE') {
    return { error: 'Invalid email or password.' };
  }

  const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);

  if (!passwordMatches) {
    return { error: 'Invalid email or password.' };
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiry();

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  await setSessionCookie(token, expiresAt);
  redirect('/dashboard');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  await clearSessionCookie();
  redirect('/login');
}
