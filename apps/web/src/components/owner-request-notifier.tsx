'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

export type RequestNotification = {
  id: string;
  targetType: string;
  targetLabel: string;
  requestedBy: string;
};

type RequestStatus = {
  count: number;
  latest: RequestNotification | null;
};

type OwnerRequestNotifierProps = {
  initialCount: number;
  initialLatest:
    | RequestNotification
    | null;
};

const SEEN_REQUEST_KEY =
  'bloom-kigali:last-request-popup';

function requestText(
  request: RequestNotification,
) {
  if (
    request.targetType ===
    'STOCK_RECEIPT'
  ) {
    return `${request.requestedBy} asked you to fix stock`;
  }

  if (
    request.targetType ===
    'PRODUCT'
  ) {
    return `${request.requestedBy} asked you to edit a product`;
  }

  return `${request.requestedBy} sent you a request`;
}

function sendCountToMenu(
  count: number,
) {
  window.dispatchEvent(
    new CustomEvent(
      'bloom-kigali:requests-updated',
      {
        detail: {
          count,
        },
      },
    ),
  );
}

export function OwnerRequestNotifier({
  initialCount,
  initialLatest,
}: OwnerRequestNotifierProps) {
  const pathname = usePathname();

  const [count, setCount] =
    useState(initialCount);

  const [latest, setLatest] =
    useState(initialLatest);

  const [isOpen, setIsOpen] =
    useState(false);

  const applyStatus = useCallback(
    (status: RequestStatus) => {
      setCount(status.count);
      setLatest(status.latest);

      sendCountToMenu(status.count);

      if (
        !status.latest ||
        status.count <= 0
      ) {
        setIsOpen(false);
        return;
      }

      const seenId =
        sessionStorage.getItem(
          SEEN_REQUEST_KEY,
        );

      /*
       * When the owner is already looking
       * at Requests, consider the latest
       * request seen and do not show a
       * redundant popup.
       */
      if (pathname === '/requests') {
        sessionStorage.setItem(
          SEEN_REQUEST_KEY,
          status.latest.id,
        );

        setIsOpen(false);
        return;
      }

      if (
        seenId === status.latest.id
      ) {
        return;
      }

      sessionStorage.setItem(
        SEEN_REQUEST_KEY,
        status.latest.id,
      );

      setIsOpen(true);
    },
    [pathname],
  );

  const refresh = useCallback(
    async () => {
      try {
        const response = await fetch(
          `/api/requests/status?t=${Date.now()}`,
          {
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
            },
          },
        );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as RequestStatus;

        applyStatus(data);
      } catch {
        /*
         * The shop should continue working
         * normally if this small notification
         * check fails or the device is offline.
         */
      }
    },
    [applyStatus],
  );

  useEffect(() => {
    const initialRefresh =
      window.setTimeout(() => {
        void refresh();
      }, 0);

    const interval =
      window.setInterval(
        () => {
          void refresh();
        },
        60_000,
      );

    function handleFocus() {
      void refresh();
    }

    function handleVisibility() {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void refresh();
      }
    }

    window.addEventListener(
      'focus',
      handleFocus,
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibility,
    );

    return () => {
      window.clearTimeout(
        initialRefresh,
      );

      window.clearInterval(interval);

      window.removeEventListener(
        'focus',
        handleFocus,
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      );
    };
  }, [refresh]);

  if (
    !isOpen ||
    !latest ||
    count <= 0
  ) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[80] border border-[var(--primary)] bg-[var(--card)] shadow-xl sm:left-auto sm:right-5 sm:top-5 sm:w-[360px]"
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">
            New request
          </p>

          <p className="mt-2 text-sm font-black text-[var(--text)]">
            {requestText(latest)}
          </p>

          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            {latest.targetLabel}
          </p>

          {count > 1 ? (
            <p className="mt-2 text-xs font-bold text-[var(--muted)]">
              {count} requests waiting
            </p>
          ) : null}

          <Link
            href="/requests"
            onClick={() =>
              setIsOpen(false)
            }
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-xs font-black text-white"
          >
            View request
          </Link>
        </div>

        <button
          type="button"
          onClick={() =>
            setIsOpen(false)
          }
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
