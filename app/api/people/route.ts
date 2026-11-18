import { NextResponse } from 'next/server';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/auth';
import { createPerson, getPeople } from '@/lib/db';
import { InvitePersonRequestSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const people = getPeople();
    return NextResponse.json(
      {
        success: true,
        people,
        count: people.length,
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to retrieve people' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { data: rawBody, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const parsed = InvitePersonRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message || 'Validation failed',
        details: parsed.error.errors,
      },
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  try {
    const result = createPerson(parsed.data);
    if (result.duplicate || !result.person) {
      return NextResponse.json(
        {
          success: false,
          error: 'A team member with this email already exists',
        },
        {
          status: 409,
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
        person: result.person,
      },
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    if (
      err?.message &&
      (err.message.includes('UNIQUE constraint failed') ||
        err.message.includes('SQLITE_CONSTRAINT_UNIQUE'))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'A team member with this email already exists',
        },
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to invite team member' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['GET', 'POST']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['GET', 'POST']);
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed(['GET', 'POST']);
}
