import { NextResponse } from 'next/server';
import { methodNotAllowed } from '@/lib/api-helpers';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  revokeSessionToken,
} from '@/lib/auth';
import { parseCookieValue } from '@/lib/auth-edge';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const token = parseCookieValue(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  if (token) {
    revokeSessionToken(token);
  }
  const response = NextResponse.json(
    { success: true },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
  return clearSessionCookie(response, request);
}

export async function GET(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed(['POST']);
}
