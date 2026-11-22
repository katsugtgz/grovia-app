import { NextResponse } from 'next/server';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/auth';
import { createPerson, getPeople, isRosterAdminSession } from '@/lib/db';
import type { PeopleListResponse, PersonInviteResponse } from '@/lib/types';
import { InvitePersonRequestSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const MAX_INVITE_BODY_BYTES = 16 * 1024;

function forbiddenResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Forbidden' },
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  if (!isRosterAdminSession(auth.user)) return forbiddenResponse();

  try {
    const people = getPeople();
    const payload: PeopleListResponse = {
      success: true,
      people,
      count: people.length,
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    console.error('[api/people] GET failed:', err);
    const errorPayload: PeopleListResponse = {
      success: false,
      error: 'Failed to retrieve people',
    };
    return NextResponse.json(errorPayload, {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  if (!isRosterAdminSession(auth.user)) return forbiddenResponse();

  const { data: rawBody, error: parseError } = await parseJsonBody(
    request,
    MAX_INVITE_BODY_BYTES
  );
  if (parseError) return parseError;

  const parsed = InvitePersonRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const validationPayload: PersonInviteResponse = {
      success: false,
      error: parsed.error.errors[0]?.message || 'Validation failed',
      details: parsed.error.errors,
    };
    return NextResponse.json(validationPayload, {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }

  try {
    const result = createPerson(parsed.data);
    if (result.duplicate || !result.person) {
      const conflictPayload: PersonInviteResponse = {
        success: false,
        error: 'A team member with this email already exists',
      };
      return NextResponse.json(conflictPayload, {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const createdPayload: PersonInviteResponse = {
      success: true,
      person: result.person,
    };
    return NextResponse.json(createdPayload, {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (
      message.includes('UNIQUE constraint failed') ||
      message.includes('SQLITE_CONSTRAINT_UNIQUE')
    ) {
      const conflictPayload: PersonInviteResponse = {
        success: false,
        error: 'A team member with this email already exists',
      };
      return NextResponse.json(conflictPayload, {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('[api/people] POST failed:', err);
    const errorPayload: PersonInviteResponse = {
      success: false,
      error: 'Failed to invite team member',
    };
    return NextResponse.json(errorPayload, {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
