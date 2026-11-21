import { NextResponse } from 'next/server';
import { InquiryPatchRequestSchema } from '@/lib/validations';
import { updateInquiry } from '@/lib/db';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Ticket ID is required' },
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: rawBody, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const parsed = InquiryPatchRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message || 'Invalid status or priority',
        details: parsed.error.errors,
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const updated = updateInquiry(id, {
      status: parsed.data.status,
      priority: parsed.data.priority,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Inquiry not found' },
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ticketId: updated.ticketId,
        status: updated.status,
        priority: updated.priority,
        updatedAt: updated.updatedAt,
      },
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update inquiry' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed(['PATCH']);
}

export async function POST(): Promise<Response> {
  return methodNotAllowed(['PATCH']);
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['PATCH']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['PATCH']);
}
