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

  if (
    isPublic &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    return NextResponse.next();
  }

  // Never expose operational API routes or mutations.
  if (
    pathname.startsWith('/api/') ||
    (request.method !== 'GET' && request.method !== 'HEAD')
  ) {
    return new NextResponse('Not available', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  // Until owner authentication is ready, keep visitors
  // on the public homepage rather than opening the app.
  return NextResponse.redirect(
    new URL('/', request.url),
    307,
  );
}

export const config = {
  matcher: '/:path*',
};
