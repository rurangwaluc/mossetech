'use client';

import {
  useEffect,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  cleanupCompletedOperations,
  resetStaleSyncingOperations,
} from '@/lib/offline/outbox';

import {
  runOutboxSync,
} from '@/lib/offline/sync';

type OfflineSyncManagerProps = {
  userId: string;
};

export function OfflineSyncManager({
  userId,
}: OfflineSyncManagerProps) {
  const router =
    useRouter();

  useEffect(() => {
    let cancelled =
      false;

    let running =
      false;

    async function sync() {
      if (running) {
        return;
      }

      running =
        true;

      try {
        await resetStaleSyncingOperations(
          userId,
        );

        const completed =
          await runOutboxSync(
            userId,
          );

        await cleanupCompletedOperations(
          userId,
        );

        /*
         * This second refresh happens after the
         * complete operation, including a pending
         * product photo, has finished syncing.
         */
        if (
          !cancelled &&
          completed > 0
        ) {
          router.refresh();
        }
      } finally {
        running =
          false;
      }
    }

    function requestSync() {
      void sync();
    }

    /*
     * The Product database write completes before
     * its photo upload. Refreshing here makes the
     * product/details change visible immediately
     * while R2 continues in the background.
     */
    function refreshCommittedData() {
      if (!cancelled) {
        router.refresh();
      }
    }

    function onVisible() {
      if (
        document.visibilityState ===
        'visible'
      ) {
        requestSync();
      }
    }

    const startup =
      window.setTimeout(
        requestSync,
        0,
      );

    const interval =
      window.setInterval(
        requestSync,
        60_000,
      );

    window.addEventListener(
      'online',
      requestSync,
    );

    window.addEventListener(
      'focus',
      requestSync,
    );

    window.addEventListener(
      'bloom-kigali:outbox-changed',
      requestSync,
    );

    window.addEventListener(
      'bloom-kigali:data-committed',
      refreshCommittedData,
    );

    document.addEventListener(
      'visibilitychange',
      onVisible,
    );

    return () => {
      cancelled =
        true;

      window.clearTimeout(
        startup,
      );

      window.clearInterval(
        interval,
      );

      window.removeEventListener(
        'online',
        requestSync,
      );

      window.removeEventListener(
        'focus',
        requestSync,
      );

      window.removeEventListener(
        'bloom-kigali:outbox-changed',
        requestSync,
      );

      window.removeEventListener(
        'bloom-kigali:data-committed',
        refreshCommittedData,
      );

      document.removeEventListener(
        'visibilitychange',
        onVisible,
      );
    };
  }, [
    router,
    userId,
  ]);

  return null;
}
