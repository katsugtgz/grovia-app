import { NextResponse } from 'next/server';
import { WaitlistRequestSchema } from '@/lib/validations';
import {
  addWaitlistEntry,
  getWaitlist,
  getWaitlistCount,
  isRosterAdminSession,
} from '@/lib/db';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  // Same single admin policy as the roster API and workspace shell: admin
  // role plus the private-mode/demo-mode identity checks — no divergent
  // secondary path.
  if (!isRosterAdminSession(auth.user)) {
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

  try {
    const count = getWaitlistCount();
    const list = getWaitlist(100);
    return NextResponse.json(
      {
        success: true,
        count,
        waitlist: list,
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
      { success: false, error: err.message || 'Failed to retrieve waitlist' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const { data: rawBody, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const parsed = WaitlistRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message || 'Validation failed',
        details: parsed.error.errors,
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = addWaitlistEntry(parsed.data);
    if (result.duplicate) {
      return NextResponse.json(
        { success: false, error: 'Email already registered on the waitlist' },
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Added to waitlist',
        position: result.position,
      },
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (
      err.message &&
      (err.message.includes('UNIQUE constraint failed') ||
        err.message.includes('SQLITE_CONSTRAINT_UNIQUE'))
    ) {
      return NextResponse.json(
        { success: false, error: 'Email already registered on the waitlist' },
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Internal database error' },
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
