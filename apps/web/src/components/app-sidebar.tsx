'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  House,
  Menu,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type UserRole = 'OWNER' | 'EMPLOYEE';

type AppSidebarProps = {
  userRole: UserRole;
};

const navigation = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: House,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Sales',
    href: '/sales',
    icon: ShoppingCart,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Products',
    href: '/products',
    icon: Package,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Stock',
    href: '/stock',
    icon: Boxes,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Customers',
    href: '/customers',
    icon: Users,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Debts',
    href: '/debts',
    icon: CircleDollarSign,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Expenses',
    href: '/expenses',
    icon: ReceiptText,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Money',
    href: '/money',
    icon: WalletCards,
    roles: ['OWNER', 'EMPLOYEE'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    roles: ['OWNER'],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ['OWNER'],
  },
] as const;

function routeIsActive(
  pathname: string,
  href: string,
) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

export function AppSidebar({
  userRole,
}: AppSidebarProps) {
  const pathname = usePathname();

  const [
    mobileOpen,
    setMobileOpen,
  ] = useState(false);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previous =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, [mobileOpen]);

  const visibleNavigation =
    navigation.filter((item) =>
      (
        item.roles as readonly UserRole[]
      ).includes(userRole),
    );

  const content = (
    <>
      <div className="border-b border-[var(--border)] px-4 pb-4 pt-4">
        <Link
          href="/dashboard"
          className="block no-underline"
        >
          <Image
            src="/brand/bloom-logo-horizontal.png"
            alt="Bloom Kigali"
            width={145}
            height={49}
            className="w-[145px] object-contain"
        style={{ height: 'auto' }}
            priority
          />

          <p className="mt-1 text-[8px] font-semibold leading-3.5 text-[var(--muted)]">
            Beautiful flowers. Brighter moments.
          </p>
        </Link>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2.5 py-3 lg:flex lg:overflow-hidden lg:py-3"
        aria-label="Main navigation"
      >
        <div className="space-y-1 lg:flex lg:h-full lg:w-full lg:flex-col lg:justify-between lg:space-y-0">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;

            const active =
              routeIsActive(
                pathname,
                item.href,
              );

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => setMobileOpen(false)}
                aria-current={
                  active
                    ? 'page'
                    : undefined
                }
                className={
                  active
                    ? 'flex min-h-11 items-center gap-3 rounded-[6px] bg-[var(--primary)] px-4 text-[13px] font-bold text-[#17150F] no-underline lg:min-h-[40px] lg:px-3.5 lg:text-[13px]'
                    : 'flex min-h-11 items-center gap-3 rounded-[6px] px-4 text-[13px] font-semibold text-[var(--text)] no-underline transition hover:bg-[var(--surface)] lg:min-h-[40px] lg:px-3.5 lg:text-[13px]'
                }
              >
                <Icon
                  className="h-[19px] w-[19px] shrink-0 lg:h-[18px] lg:w-[18px]"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />

                <span>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-0 pb-0">
        <div
          className="relative h-[115px] overflow-hidden border-t border-[var(--border)] bg-[#f4f1ea]"
          style={{
            backgroundImage:
              "url('/brand/sidebar-flowers-final.jpg')",
            backgroundSize:
              'cover',
            backgroundPosition:
              '72% center',
            backgroundRepeat:
              'no-repeat',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(244,241,234,0.82) 0%, rgba(244,241,234,0.60) 40%, rgba(244,241,234,0.10) 68%, transparent 100%)',
            }}
            aria-hidden="true"
          />

          <div className="relative z-[1] h-[115px] px-4 py-3">
            <p className="shop-display max-w-[112px] text-[14px] font-semibold leading-[1.05] tracking-[-0.015em] text-[#171814]">
              Fresh
              <br />
              Flowers
              <br />
              Brighter Days
            </p>

            <div className="mt-2.5 h-[2px] w-8 bg-[#BF9A2F]" />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setMobileOpen(true)
        }
        className="fixed left-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-sm lg:hidden"
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
      >
        <Menu
          className="h-[19px] w-[19px]"
          aria-hidden="true"
        />
      </button>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--card)] lg:flex">
        {content}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/45"
            onClick={() =>
              setMobileOpen(false)
            }
          />

          <aside className="relative flex h-full w-[min(290px,86vw)] flex-col border-r border-[var(--border)] bg-[var(--card)] shadow-2xl">
            <button
              type="button"
              onClick={() =>
                setMobileOpen(false)
              }
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
              aria-label="Close navigation"
            >
              <X
                className="h-[18px] w-[18px]"
                aria-hidden="true"
              />
            </button>

            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
