import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--text)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
        <p className="text-sm font-bold text-[var(--muted)]">
          Access restricted
        </p>

        <h1 className="mt-3 text-2xl font-black">
          You do not have permission to view this page.
        </h1>

        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Contact Moses if you need access to this part of Mosse Tech.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--primary-action)] px-5 text-sm font-bold text-[var(--primary-contrast)]"
        >
          Return to Dashboard
        </Link>
      </section>
    </main>
  );
}
