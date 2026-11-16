import { NextResponse } from 'next/server';
import type { HealthResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const runtimeVersion = typeof Bun !== 'undefined' ? Bun.version : process.version;

  const payload: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'healthy',
    uptime: typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() : 0,
    system: {
      runtime: 'bun',
      version: runtimeVersion,
    },
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json',
    },
  });
}
