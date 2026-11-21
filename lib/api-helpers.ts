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

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

function payloadTooLarge(): { error: NextResponse } {
  return {
    error: NextResponse.json(
      { success: false, error: 'Request payload too large' },
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    ),
  };
}

/**
 * Safely parse JSON body from incoming Request with an enforced byte limit.
 * Returns structured 400/413 response for empty, oversized, or malformed JSON payloads.
 */
export async function parseJsonBody<T = unknown>(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<{ data?: T; error?: NextResponse }> {
  try {
    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        return payloadTooLarge();
      }
    }

    let text = '';
    const reader = request.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let receivedBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          if (receivedBytes > maxBytes) {
            // Cancellation may wait on the source. Return 413 without waiting for it.
            void reader.cancel().catch(() => {});
            return payloadTooLarge();
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }

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
