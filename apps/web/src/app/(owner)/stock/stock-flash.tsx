'use client';

import {
  useEffect,
} from 'react';

import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';

type StockFlashProps = {
  message: string;
  param:
    | 'received'
    | 'fixed'
    | 'request'
    | 'damaged';
};

export function StockFlash({
  message,
  param,
}: StockFlashProps) {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  useEffect(() => {
    const timeout =
      window.setTimeout(
        () => {
          const next =
            new URLSearchParams(
              searchParams.toString(),
            );

          next.delete(
            param,
          );

          const query =
            next.toString();

          router.replace(
            query
              ? `${pathname}?${query}`
              : pathname,
            {
              scroll: false,
            },
          );
        },
        2500,
      );

    return () =>
      window.clearTimeout(
        timeout,
      );
  }, [
    param,
    pathname,
    router,
    searchParams,
  ]);

  return (
    <div className="rounded-lg border border-[var(--success)]/40 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-[var(--success)]">
      {message}
    </div>
  );
}
