'use client';

import {
  useEffect,
} from 'react';

import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';

type ProductsFlashProps = {
  message: string;
  param:
    | 'saved'
    | 'requestSaved'
    | 'created'
    | 'updated'
    | 'request';
};

export function ProductsFlash({
  message,
  param,
}: ProductsFlashProps) {
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
          const params =
            new URLSearchParams(
              searchParams.toString(),
            );

          params.delete(param);

          const query =
            params.toString();

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

    return () => {
      window.clearTimeout(
        timeout,
      );
    };
  }, [
    param,
    pathname,
    router,
    searchParams,
  ]);

  return (
    <div className="rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
      {message}
    </div>
  );
}
