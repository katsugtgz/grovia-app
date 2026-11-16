import { NextResponse } from 'next/server';
import type { HealthResponse } from '@/lib/types';
import { checkHealth } from '@/lib/db';
import { methodNotAllowed } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const runtimeVersion = typeof Bun !== 'undefined' ? Bun.version : process.version;
  const dbStatus = checkHealth();

  const payload: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbStatus,
    uptime: typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() : 0,
    system: {
      runtime: 'bun',
      version: runtimeVersion,
    },
  };

  return NextResponse.json(payload, {
    status: dbStatus === 'healthy' ? 200 : 503,
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
