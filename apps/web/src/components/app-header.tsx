'use client';

import Link from 'next/link';
import {
  Bell,
  LogOut,
  Search,
} from 'lucide-react';
import { usePathname } from 'next/navigation';

import {
  useEffect,
  useState,
} from 'react';
import { logoutAction } from '@/lib/auth/actions';
import {
  OwnerRequestNotifier,
  type RequestNotification,
} from './owner-request-notifier';
import { ThemeToggle } from './theme-toggle';

function getPageName(pathname: string) {
  if (pathname === '/requests') {
    return {
      eyebrow: 'Owner',
      title: 'Requests',
    };
  }

  if (pathname === '/settings') {
    return {
      eyebrow: 'Settings',
      title: 'Settings',
    };
  }

  if (pathname === '/products/new') {
    return {
      eyebrow: 'Products',
      title: 'Add product',
    };
  }

  if (
    pathname.startsWith('/products/') &&
    pathname.endsWith('/edit')
  ) {
    return {
      eyebrow: 'Products',
      title: 'Product details',
    };
  }

  if (
    pathname.startsWith('/products/') &&
    pathname !== '/products/new' &&
    !pathname.endsWith('/edit')
  ) {
    return {
      eyebrow: 'Products',
      title: 'Product details',
    };
  }

  if (pathname === '/products') {
    return {
      eyebrow: 'Products',
      title: 'Products',
    };
  }

  if (pathname === '/sales/new') {
    return {
      eyebrow: 'Sales',
      title: 'New sale',
    };
  }

  if (
    pathname.startsWith('/sales/') &&
    pathname !== '/sales/new'
  ) {
    return {
      eyebrow: 'Sales',
      title: 'Sale details',
    };
  }

  if (pathname === '/sales') {
    return {
      eyebrow: 'Sales',
      title: 'Sales',
    };
  }

  if (pathname === '/stock/receive') {
    return {
      eyebrow: 'Stock',
      title: 'Receive stock',
    };
  }

  if (
    pathname.startsWith(
      '/stock/received/',
    )
  ) {
    return {
      eyebrow: 'Stock',
      title: 'Stock received',
    };
  }

  if (
    pathname.startsWith(
      '/stock/history/',
    )
  ) {
    return {
      eyebrow: 'Stock',
      title: 'Stock history',
    };
  }

  if (
    pathname.startsWith(
      '/stock/damaged/',
    )
  ) {
    return {
      eyebrow: 'Stock',
      title: 'Correct damage',
    };
  }

  if (pathname === '/stock/damage') {
    return {
      eyebrow: 'Stock',
      title: 'Record damage',
    };
  }

  if (pathname === '/stock') {
    return {
      eyebrow: 'Stock',
      title: 'Stock',
    };
  }

  if (
    pathname.startsWith('/debts/') &&
    pathname !== '/debts'
  ) {
    return {
      eyebrow: 'Unpaid sales',
      title: 'Unpaid sale details',
    };
  }

  if (pathname === '/debts') {
    return {
      eyebrow: 'Unpaid sales',
      title: 'Unpaid sales',
    };
  }

  if (
    pathname.startsWith(
      '/customers/',
    ) &&
    pathname !== '/customers'
  ) {
    return {
      eyebrow: 'Customers',
      title: 'Customer details',
    };
  }

  if (pathname === '/customers') {
    return {
      eyebrow: 'Customers',
      title: 'Customers',
    };
  }

  if (pathname === '/money') {
    return {
      eyebrow: 'Money',
      title: 'Money',
    };
  }

  if (
    pathname.startsWith(
      '/expenses/',
    ) &&
    pathname !== '/expenses'
  ) {
    return {
      eyebrow: 'Expenses',
      title: 'Expense details',
    };
  }

  if (pathname === '/expenses') {
    return {
      eyebrow: 'Expenses',
      title: 'Expenses',
    };
  }

  if (pathname === '/reports') {
    return {
      eyebrow: 'Reports',
      title: 'Reports',
    };
  }

  return {
    eyebrow: 'Bloom Kigali',
    title: 'Bloom Kigali',
  };
}

type AppHeaderProps = {
  userName: string;
  userRole: 'OWNER' | 'EMPLOYEE';
  dashboardGreeting: string;
  pendingRequestCount: number;
  latestRequest:
    | RequestNotification
    | null;
};

export function AppHeader({
  userName,
  userRole,
  dashboardGreeting,
  pendingRequestCount,
  latestRequest,
}: AppHeaderProps) {
  const pathname = usePathname();

  const [
    requestCount,
    setRequestCount,
  ] = useState(
    pendingRequestCount,
  );

  useEffect(() => {
    function handleRequestUpdate(
      event: Event,
    ) {
      const detail = (
        event as CustomEvent<{
          count?: unknown;
        }>
      ).detail;

      const nextCount =
        Number(
          detail?.count || 0,
        );

      setRequestCount(
        Number.isFinite(
          nextCount,
        )
          ? Math.max(
              0,
              nextCount,
            )
          : 0,
      );
    }

    window.addEventListener(
      'mamas-pride:requests-updated',
      handleRequestUpdate,
    );

    return () => {
      window.removeEventListener(
        'mamas-pride:requests-updated',
        handleRequestUpdate,
      );
    };
  }, []);

  const page = getPageName(pathname);

  const firstName =
    userName.trim().split(/\s+/)[0] ||
    userName;

  const initial =
    firstName.charAt(0).toUpperCase() ||
    'B';

  const roleName =
    userRole === 'OWNER'
      ? 'Owner'
      : 'Staff';

  const onDashboard =
    pathname === '/dashboard';

  return (
    <header>
      <div className="flex min-h-12 items-center gap-2 border-b border-[var(--border)] pb-3 sm:min-h-14 sm:gap-3">
        <form
          action="/products"
          method="get"
          className="hidden h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 lg:flex lg:max-w-xl"
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />

          <input
            type="search"
            name="q"
            placeholder="Search products..."
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text)] outline-none placeholder:font-medium placeholder:text-[var(--muted)]"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {userRole === 'OWNER' ? (
            <Link
              href="/requests"
              aria-label={
                requestCount > 0
                  ? `${requestCount} ${
                    requestCount === 1
                      ? 'request'
                      : 'requests'
                  } waiting`
                  : 'Requests'
              }
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-[var(--text)] transition hover:bg-[var(--surface)]"
            >
              <Bell className="h-[18px] w-[18px]" />

              {requestCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1.5 -top-1.5 inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--primary)] px-1 text-[9px] font-black leading-none text-white tabular-nums"
                >
                  {requestCount > 99
                    ? '99+'
                    : requestCount}
                </span>
              ) : null}
            </Link>
          ) : null}

          <div
            className="hidden items-center gap-3 border-l border-[var(--border)] pl-3 sm:flex"
            aria-label={`${dashboardGreeting}, ${firstName}`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-black text-[var(--text)]">
              {initial}
            </div>

            <div className="min-w-0">
              <p className="max-w-36 truncate text-sm font-black text-[var(--text)]">
                {firstName}
              </p>

              <p className="text-[11px] font-semibold text-[var(--muted)]">
                {roleName}
              </p>
            </div>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>

      {!onDashboard ? (
        <div className="pb-1 pl-12 pt-4 sm:pt-5 lg:pl-0">
          {page.title !== 'Settings' &&
          pathname !== '/stock' ? (
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              {page.eyebrow}
            </p>
          ) : null}

          <h1
            className={
              page.title === 'Settings'
                ? 'text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl'
                : 'mt-1 text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl'
            }
          >
            {page.title}
          </h1>
        </div>
      ) : null}

      {userRole === 'OWNER' ? (
        <OwnerRequestNotifier
          initialCount={
            pendingRequestCount
          }
          initialLatest={latestRequest}
        />
      ) : null}
    </header>
  );
}
