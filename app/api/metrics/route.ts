import { NextResponse } from 'next/server';
import type { MetricsResponse } from '@/lib/types';
import { getWaitlistCount } from '@/lib/db';
import { methodNotAllowed } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let waitlistCount = 0;
  try {
    waitlistCount = getWaitlistCount();
  } catch {
    waitlistCount = 0;
  }

  const payload: MetricsResponse & { waitlistCount: number; updatedAt: string } = {
    teamCount: 84 + waitlistCount,
    hiringCount: 37,
    projectsCount: 212,
    pipeline: {
      interviews: 17,
      hired: 15,
      projectTime: 56,
      output: 12,
    },
    weeklyWorkdayAverage: 6.6,
    activeSessions: 42,
    benchmarkQuartile: 'Top 10%',
    waitlistCount,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json',
    },
  });
}

export async function POST(): Promise<Response> {
  return methodNotAllowed(['GET']);
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['GET']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['GET']);
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed(['GET']);
}
