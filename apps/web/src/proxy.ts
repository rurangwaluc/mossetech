import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ASSETS = [
  '/brand/',
  '/icons/',
  '/_next/static/',
  '/_next/image',
];

const PUBLIC_FILES = new Set([
  '/',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sw.js',
]);

export function proxy(request: NextRequest) {
  // Only restrict the unfinished public production release.
  // Local development and Vercel Preview retain normal routing.
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_FILES.has(pathname) ||
    PUBLIC_ASSETS.some(
      (prefix) => pathname.startsWith(prefix),
    );

  const isPublicCatalog =
    pathname === '/catalog' ||
    pathname.startsWith('/catalog/');

  const isPublicProductImage =
    /^\/api\/public\/product-image\/[0-9a-f-]{36}$/.test(
      pathname,
    );

  if (
    (isPublic || isPublicCatalog || isPublicProductImage) &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    return NextResponse.next();
  }

  // Enable product synchronization and photo uploads.
  // Their route handlers enforce authentication and permissions.
  const enabledOperationalApi =
    pathname === '/api/sync/outbox' ||
    pathname === '/api/media/product-image' ||
    pathname.startsWith('/api/media/product-image/');

  if (enabledOperationalApi) {
    return NextResponse.next();
  }

  // Keep other unfinished API routes restricted.
  if (pathname.startsWith('/api/')) {
    return new NextResponse('Not available', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  // Next.js Server Actions submit POST requests to the
  // page that renders the form. Allow those requests only
  // for login and the authenticated application; the
  // corresponding server-side actions enforce identity.
  //
  // Requests without valid sessions are redirected by
  // the protected application layout.
  if (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/customers' ||
    pathname.startsWith('/customers/') ||
    pathname === '/debts' ||
    pathname.startsWith('/debts/') ||
    pathname === '/expenses' ||
    pathname.startsWith('/expenses/') ||
    pathname === '/money' ||
    pathname.startsWith('/money/') ||
    pathname === '/products' ||
    pathname.startsWith('/products/') ||
    pathname === '/reports' ||
    pathname.startsWith('/reports/') ||
    pathname === '/requests' ||
    pathname.startsWith('/requests/') ||
    pathname === '/sales' ||
    pathname.startsWith('/sales/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname === '/stock' ||
    pathname.startsWith('/stock/')
  ) {
    return NextResponse.next();
  }

  // Keep remaining unfinished routes unavailable.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new NextResponse('Not available', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.redirect(
    new URL('/', request.url),
    307,
  );
}

export const config = {
  matcher: '/:path*',
};
