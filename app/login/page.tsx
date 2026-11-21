import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { showsDefaultDemoCredentials } from '@/lib/db';
import { LoginForm } from '@/components/auth/LoginForm';
import { resolveLoginPageState } from '@/components/auth/login-helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — GROVIA',
  description: 'Sign in to access the Grovia people-ops workspace.',
};

export interface LoginPageProps {
  searchParams?: Promise<{ next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { nextPath, shouldRedirect } = await resolveLoginPageState({
    rawNext: resolvedSearchParams?.next,
    getSession: getServerSession,
  });

  if (shouldRedirect) {
    redirect(nextPath);
  }

  return (
    <LoginForm
      nextPath={nextPath}
      showDemoCredentials={showsDefaultDemoCredentials()}
    />
  );
}
