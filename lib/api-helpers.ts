import { NextResponse } from 'next/server';

/**
 * Standard HTTP 405 Method Not Allowed response with Allow header.
 */
export function methodNotAllowed(allowed: string[]): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: `Method Not Allowed. Supported methods: ${allowed.join(', ')}`,
    },
    {
      status: 405,
      headers: {
        Allow: allowed.join(', '),
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Safely parse JSON body from incoming Request.
 * Returns structured 400 response for empty or malformed JSON payloads.
 */
export async function parseJsonBody<T = unknown>(
  request: Request
): Promise<{ data?: T; error?: NextResponse }> {
  try {
    const text = await request.text();
    if (!text || text.trim() === '') {
      return {
        error: NextResponse.json(
          { success: false, error: 'Empty request body' },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
      };
    }
    const data = JSON.parse(text);
    return { data: data as T };
  } catch {
    return {
      error: NextResponse.json(
        { success: false, error: 'Invalid or missing JSON payload' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
}
