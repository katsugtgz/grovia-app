import { NextResponse } from 'next/server';
import { InquiryPatchRequestSchema, InquiryPostRequestSchema } from '@/lib/validations';
import { createInquiry, getInquiries, updateInquiry } from '@/lib/db';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || undefined;
    const inquiries = getInquiries(statusFilter);

    return NextResponse.json(
      {
        success: true,
        count: inquiries.length,
        inquiries,
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
      { success: false, error: err.message || 'Failed to retrieve inquiries' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const { data: rawBody, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const parsed = InquiryPostRequestSchema.safeParse(rawBody);
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
    const inquiry = createInquiry(parsed.data);
    return NextResponse.json(
      {
        success: true,
        ticketId: inquiry.ticketId,
        status: inquiry.status,
        message: 'Inquiry submitted successfully',
      },
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create inquiry' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const { data: rawBody, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const url = new URL(request.url);
  const idFromQuery =
    url.searchParams.get('id') || url.searchParams.get('ticketId') || undefined;

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

  const targetId =
    parsed.data.ticketId || parsed.data.ticket_id || parsed.data.id || idFromQuery;

  if (!targetId) {
    return NextResponse.json(
      { success: false, error: 'Ticket ID is required for PATCH update' },
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const updated = updateInquiry(targetId, {
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

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['GET', 'POST', 'PATCH']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['GET', 'POST', 'PATCH']);
}
