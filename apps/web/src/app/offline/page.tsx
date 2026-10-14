import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--text)]">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
          Connection lost
        </p>

        <h1 className="shop-display mt-3 text-4xl font-bold leading-none sm:text-5xl">
          You’re offline
        </h1>

        <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-6 text-[var(--muted)]">
          Reconnect to continue viewing or updating sales, stock, money,
          customers, and reports safely.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-6 text-sm font-black text-white no-underline shadow-sm transition hover:bg-[var(--primary-strong)]"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
