import { NextResponse } from 'next/server';
import { getDeploymentVersion } from '@/lib/deployment-version';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      version: getDeploymentVersion(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    },
  );
}
