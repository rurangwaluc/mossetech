'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@mossetech/db/client';
import { sessions } from '@mossetech/db/schema';

import {
  clearSessionCookie,
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from './session';

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  await clearSessionCookie();
  redirect('/login');
}
