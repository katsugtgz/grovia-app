import { expect, test } from 'bun:test';
import { parseJsonBody } from '@/lib/api-helpers';

test('JSON byte limit includes the UTF-8 byte order mark', async () => {
  const request = new Request('http://localhost/api', {
    method: 'POST',
    body: '\uFEFF{}',
  });

  const { error } = await parseJsonBody(request, 4);
  expect(error?.status).toBe(413);
});

test('accepts JSON at the exact byte limit, including multibyte characters', async () => {
  const request = new Request('http://localhost/api', {
    method: 'POST',
    body: '"é"',
  });

  expect(await parseJsonBody(request, 4)).toEqual({ data: 'é' });
});

test('keeps empty and malformed JSON responses distinct', async () => {
  const empty = await parseJsonBody(new Request('http://localhost/api', { method: 'POST' }));
  const malformed = await parseJsonBody(new Request('http://localhost/api', { method: 'POST', body: '{' }));

  expect(empty.error?.status).toBe(400);
  expect(await empty.error?.json()).toEqual({ success: false, error: 'Empty request body' });
  expect(malformed.error?.status).toBe(400);
  expect(await malformed.error?.json()).toEqual({ success: false, error: 'Invalid or missing JSON payload' });
});
