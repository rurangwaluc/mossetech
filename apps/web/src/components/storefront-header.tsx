import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';

export function StorefrontHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/catalog"
          aria-label="Mosse Tech — browse products"
          className="flex min-w-0 items-center"
        >
          <Image
            src="/brand/mossetech-logo-horizontal.png"
            alt="Mosse Tech Ltd"
            width={180}
            height={58}
            priority
            className="h-auto w-32 object-contain sm:w-40"
          />
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href="https://wa.me/250785147371"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contact Mosse Tech on WhatsApp"
            title="Contact on WhatsApp"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] transition hover:border-[var(--primary)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M21 11.5a8.5 8.5 0 0 1-12.35 7.56L3 21l1.94-5.65A8.5 8.5 0 1 1 21 11.5Z" />
              <path d="M8.5 9.3c.6 2.5 2.5 4.4 5 5" />
              <path d="m8.5 9.3 1.2-1.1M13.5 14.3l1.3-1" />
            </svg>
          </a>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
