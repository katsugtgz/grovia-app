import { EMAIL_PATTERN } from '@/lib/email-validation';
import type { IconName, WaitlistResponse } from '@/lib/types';

export interface LandingFeatureItem {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  tag: string;
}

export interface LandingPricingTier {
  id: string;
  name: string;
  price: string;
  cadence: string;
  description: string;
  badge?: string;
  featured?: boolean;
  teamSize: string;
  ctaLabel: string;
  features: string[];
}

export const WAITLIST_TEAM_SIZES = ['1-10', '11-50', '51-200', '200+'] as const;

export const LANDING_FEATURES: LandingFeatureItem[] = [
  {
    id: 'directory',
    icon: 'users',
    title: 'People directory',
    description:
      'Keep roles, teams, work locations, and onboarding statuses organized in one searchable roster.',
    tag: 'Live roster',
  },
  {
    id: 'onboarding',
    icon: 'user-plus',
    title: 'Guided onboarding',
    description:
      'Send teammate invites, assign hardware provisioning steps, and track Day-1 checklists automatically.',
    tag: '4-step flow',
  },
  {
    id: 'time-tracking',
    icon: 'alarm',
    title: 'Time & capacity tracking',
    description:
      'Monitor weekly workday hours, interview pipelines, and team capacity without noisy spreadsheets.',
    tag: 'Real-time',
  },
  {
    id: 'payroll',
    icon: 'doc',
    title: 'Payroll & compliance',
    description:
      'Review hourly rates, timesheet approvals, and audit-ready payout summaries from a unified calendar.',
    tag: 'Audit-ready',
  },
];

export const LANDING_PRICING_TIERS: LandingPricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$0',
    cadence: '/ month',
    description: 'For early teams organizing their first hires and onboarding checklists.',
    teamSize: '1-10',
    ctaLabel: 'Join Starter waitlist',
    features: [
      'Up to 10 team seats included',
      'Shared people directory & roles',
      'Guided onboarding task lists',
      'Workday timer & weekly summary',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$12',
    cadence: '/ seat / month',
    description: 'Full Bento workspace for scaling operations, payroll review, and team invites.',
    badge: 'Most popular',
    featured: true,
    teamSize: '11-50',
    ctaLabel: 'Request Growth access',
    features: [
      'Unlimited onboarding workflows',
      'Role-based workspace access control',
      'Payroll timesheet & rate summaries',
      'Priority waitlist onboarding',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual plan',
    description: 'Tailored compliance controls, dedicated rollout support, and multi-team governance.',
    teamSize: '200+',
    ctaLabel: 'Book Enterprise rollout',
    features: [
      'Multi-department policy templates',
      'Dedicated implementation specialist',
      'Custom audit exports & retention',
      'SLA-backed priority support',
    ],
  },
];

export interface WaitlistFormValues {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  useCase: string;
}

export interface WaitlistFieldErrors {
  name?: string;
  email?: string;
  company?: string;
  useCase?: string;
}

export type WaitlistSubmitResult =
  | {
      ok: true;
      position: number;
      message: string;
    }
  | {
      ok: false;
      status: number;
      duplicate?: boolean;
      error: string;
    };

export function validateWaitlistInput(values: WaitlistFormValues): WaitlistFieldErrors {
  const errors: WaitlistFieldErrors = {};
  const cleanName = values.name.trim();
  const cleanEmail = values.email.trim().toLowerCase();
  const cleanCompany = values.company.trim();
  const cleanUseCase = values.useCase.trim();

  if (cleanName.length < 1) {
    errors.name = 'Enter your full name.';
  } else if (cleanName.length > 1000) {
    errors.name = 'Name must not exceed 1000 characters.';
  }

  if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 255) {
    errors.email = 'Enter a valid work email address.';
  }

  if (cleanCompany.length > 255) {
    errors.company = 'Company name must not exceed 255 characters.';
  }

  if (cleanUseCase.length > 1000) {
    errors.useCase = 'Use case must not exceed 1000 characters.';
  }

  return errors;
}

export async function submitWaitlistRequest(
  values: WaitlistFormValues,
  fetchImpl: typeof fetch = fetch
): Promise<WaitlistSubmitResult> {
  const payload = {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    company: values.company.trim() || undefined,
    teamSize: values.teamSize.trim() || '11-50',
    useCase: values.useCase.trim() || undefined,
  };

  try {
    const response = await fetchImpl('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | (Partial<WaitlistResponse> & { error?: string })
      | null;

    if (response.status === 201 && data?.success && typeof data.position === 'number') {
      return {
        ok: true,
        position: data.position,
        message: data.message || 'Added to waitlist',
      };
    }

    if (response.status === 409) {
      return {
        ok: false,
        status: 409,
        duplicate: true,
        error: data?.error || 'Email already registered on the waitlist',
      };
    }

    return {
      ok: false,
      status: response.status,
      error: data?.error || 'Could not join the waitlist. Please check your details.',
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Network error while submitting. Please try again.',
    };
  }
}
