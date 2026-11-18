import type {
  Person,
  PersonInviteRequest,
  PersonInviteResponse,
} from '@/lib/types';

export interface InviteFieldErrors {
  name?: string;
  email?: string;
  role?: string;
}

export type InviteSubmitResult =
  | {
      ok: true;
      status: 201;
      person: Person;
    }
  | {
      ok: false;
      status: number;
      unauthorized?: boolean;
      duplicate?: boolean;
      error: string;
    };

export function validateInviteInput(input: {
  name: string;
  email: string;
  role: string;
}): InviteFieldErrors {
  const cleanName = input.name.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanRole = input.role.trim();

  const errors: InviteFieldErrors = {};

  if (cleanName.length < 2) {
    errors.name = 'Enter their full name.';
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!cleanRole) {
    errors.role = 'Add their role.';
  }

  return errors;
}

export async function submitInvitePersonRequest(
  input: PersonInviteRequest,
  fetchImpl: typeof fetch = fetch
): Promise<InviteSubmitResult> {
  const payload: PersonInviteRequest = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role.trim(),
    team: input.team,
    city: input.city?.trim() || 'Remote',
    ...(typeof input.rate === 'number' ? { rate: input.rate } : {}),
  };

  try {
    const response = await fetchImpl('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      return {
        ok: false,
        status: 401,
        unauthorized: true,
        error: 'Authentication required',
      };
    }

    const data = (await response.json().catch(() => null)) as PersonInviteResponse | null;

    if (response.status === 409) {
      return {
        ok: false,
        status: 409,
        duplicate: true,
        error: data?.error || 'A team member with this email already exists',
      };
    }

    if ((response.status === 201 || response.ok) && data?.success && data.person) {
      return {
        ok: true,
        status: 201,
        person: data.person,
      };
    }

    return {
      ok: false,
      status: response.status,
      error: data?.error || 'Unable to send invite. Please try again.',
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Network error while sending invite. Please try again.',
    };
  }
}
