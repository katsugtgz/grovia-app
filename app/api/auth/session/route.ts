import { NextResponse } from 'next/server';
import { methodNotAllowed } from '@/lib/api-helpers';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: 'Authentication required',
      },
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  return NextResponse.json(
    {
      success: true,
      authenticated: true,
      user: {
        id: session.id,
        email: session.email,
        name: session.name,
        role: session.role,
      },
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
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
