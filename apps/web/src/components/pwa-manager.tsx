'use client';

import { useEffect } from 'react';

declare global {
  interface WindowEventMap {
    'bloom-kigali:pwa-update-ready': CustomEvent;
  }
}

type PwaManagerProps = {
  deploymentVersion: string;
};

const DEPLOYMENT_RELOAD_KEY =
  'bloom-kigali:deployment-reload';

const ACTION_RELOAD_KEY =
  'bloom-kigali:server-action-reload';

function getErrorMessage(value: unknown) {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
}

function isStaleServerActionError(value: unknown) {
  const message =
    getErrorMessage(value).toLowerCase();

  if (!message.includes('server action')) {
    return false;
  }

  return (
    message.includes('was not found') ||
    message.includes(
      'failed to find server action',
    ) ||
    message.includes(
      'unrecognizedactionerror',
    )
  );
}

async function clearDevelopmentPwaState() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations =
        await navigator.serviceWorker.getRegistrations();

      await Promise.all(
        registrations
          .filter(
            (registration) =>
              new URL(registration.scope).origin ===
              window.location.origin,
          )
          .map((registration) =>
            registration.unregister(),
          ),
      );
    }

    if ('caches' in window) {
      const cacheNames =
        await window.caches.keys();

      await Promise.all(
        cacheNames
          .filter((name) =>
            name.startsWith('bloom-kigali-'),
          )
          .map((name) =>
            window.caches.delete(name),
          ),
      );
    }
  } catch {
    // Development should remain usable even
    // if browser cache cleanup is unavailable.
  }
}

export function PwaManager({
  deploymentVersion,
}: PwaManagerProps) {
  useEffect(() => {
    // Never let a service worker control local development.
    // Turbopack must always serve the newest JS and CSS.
    if (process.env.NODE_ENV !== 'production') {
      void clearDevelopmentPwaState();
      return;
    }

    let disposed = false;
    let checkingDeployment = false;

    async function refreshIfDeploymentChanged() {
      if (
        disposed ||
        checkingDeployment
      ) {
        return;
      }

      checkingDeployment = true;

      try {
        const response = await fetch(
          `/api/version?t=${Date.now()}`,
          {
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
            },
          },
        );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as {
            version?: unknown;
          };

        if (
          typeof data.version !== 'string' ||
          data.version.length === 0
        ) {
          return;
        }

        if (
          data.version === deploymentVersion
        ) {
          sessionStorage.removeItem(
            DEPLOYMENT_RELOAD_KEY,
          );
          return;
        }

        const reloadMarker =
          `${deploymentVersion}->${data.version}`;

        if (
          sessionStorage.getItem(
            DEPLOYMENT_RELOAD_KEY,
          ) === reloadMarker
        ) {
          return;
        }

        sessionStorage.setItem(
          DEPLOYMENT_RELOAD_KEY,
          reloadMarker,
        );

        window.location.reload();
      } catch {
        // Keep current page usable when offline.
      } finally {
        checkingDeployment = false;
      }
    }

    function recoverFromStaleServerAction(
      value: unknown,
    ) {
      if (
        !isStaleServerActionError(value)
      ) {
        return;
      }

      if (
        sessionStorage.getItem(
          ACTION_RELOAD_KEY,
        ) === deploymentVersion
      ) {
        return;
      }

      sessionStorage.setItem(
        ACTION_RELOAD_KEY,
        deploymentVersion,
      );

      window.location.reload();
    }

    function handleWindowError(
      event: ErrorEvent,
    ) {
      recoverFromStaleServerAction(
        event.error,
      );

      recoverFromStaleServerAction(
        event.message,
      );
    }

    function handleUnhandledRejection(
      event: PromiseRejectionEvent,
    ) {
      recoverFromStaleServerAction(
        event.reason,
      );
    }

    function handleWindowFocus() {
      void refreshIfDeploymentChanged();
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState === 'visible'
      ) {
        void refreshIfDeploymentChanged();
      }
    }

    async function registerServiceWorker() {
      if (
        !('serviceWorker' in navigator)
      ) {
        return;
      }

      try {
        const registration =
          await navigator.serviceWorker.register(
            '/sw.js',
            {
              scope: '/',
            },
          );

        void registration.update();

        if (registration.waiting) {
          window.dispatchEvent(
            new CustomEvent(
              'bloom-kigali:pwa-update-ready',
            ),
          );
        }

        registration.addEventListener(
          'updatefound',
          () => {
            const worker =
              registration.installing;

            if (!worker) {
              return;
            }

            worker.addEventListener(
              'statechange',
              () => {
                if (
                  worker.state ===
                    'installed' &&
                  navigator.serviceWorker
                    .controller
                ) {
                  window.dispatchEvent(
                    new CustomEvent(
                      'bloom-kigali:pwa-update-ready',
                    ),
                  );
                }
              },
            );
          },
        );
      } catch (error) {
        console.error(
          'Service worker registration failed:',
          error,
        );
      }
    }

    void registerServiceWorker();
    void refreshIfDeploymentChanged();

    window.addEventListener(
      'focus',
      handleWindowFocus,
    );

    window.addEventListener(
      'error',
      handleWindowError,
    );

    window.addEventListener(
      'unhandledrejection',
      handleUnhandledRejection,
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    const deploymentCheckInterval =
      window.setInterval(() => {
        void refreshIfDeploymentChanged();
      }, 60_000);

    return () => {
      disposed = true;

      window.clearInterval(
        deploymentCheckInterval,
      );

      window.removeEventListener(
        'focus',
        handleWindowFocus,
      );

      window.removeEventListener(
        'error',
        handleWindowError,
      );

      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection,
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [deploymentVersion]);

  return null;
}
