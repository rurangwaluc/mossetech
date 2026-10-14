import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { PublicThemeToggle } from '../public-theme-toggle';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="auth-shell min-h-[100dvh] px-4 py-3 sm:px-6 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col sm:min-h-[calc(100dvh-2.5rem)]">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3 sm:pb-4">
          <Link
            href="/"
            className="inline-flex min-w-0 items-center no-underline"
            aria-label="Bloom Kigali home"
          >
            <Image
              src="/brand/bloom-logo-horizontal.png"
              alt="Bloom Kigali"
              width={176}
              height={60}
              className="h-auto w-[142px] object-contain sm:w-[165px]"
              priority
            />
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="hidden h-10 items-center justify-center gap-2 rounded-[4px] border border-[var(--border-strong)] px-4 text-xs font-bold text-[var(--text)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>

            <Link
              href="/"
              aria-label="Back to home"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] border border-[var(--border-strong)] text-[var(--text)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] sm:hidden"
            >
              <ArrowLeft
                className="h-4 w-4"
                aria-hidden="true"
              />
            </Link>

            <PublicThemeToggle />
          </div>
        </header>

        <section className="flex flex-1 items-start justify-center pb-6 pt-[clamp(44px,8vh,88px)] sm:items-center sm:py-8 lg:py-10">
          <div className="w-full max-w-[410px]">
            <div className="mb-4 text-center sm:mb-6">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.19em] text-[var(--primary)] sm:mb-2 sm:text-[10px]">
                Private access
              </p>

              <h1 className="shop-display text-[36px] font-semibold leading-none tracking-[-0.045em] text-[var(--text)] sm:text-[52px]">
                Sign in
              </h1>

              <p className="mx-auto mt-2.5 max-w-sm text-[12px] leading-5 text-[var(--muted)] sm:mt-4 sm:text-[13px] sm:leading-6">
                Enter your details to continue to Bloom Kigali.
              </p>
            </div>

            <div className="border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
              <LoginForm />
            </div>

            <div className="mt-3 grid grid-cols-3 border border-[var(--border)] text-center text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--muted)] sm:mt-4 sm:text-[10px]">
              <span className="px-2 py-2.5 sm:py-3">
                Sales
              </span>

              <span className="border-x border-[var(--border)] px-2 py-2.5 sm:py-3">
                Stock
              </span>

              <span className="px-2 py-2.5 sm:py-3">
                Customers
              </span>
            </div>

            <p className="mt-2.5 text-center text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--muted)] sm:mt-4 sm:text-[9px]">
              Authorized owner and staff only
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
