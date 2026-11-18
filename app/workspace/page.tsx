import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { WorkspaceShell } from '@/components/WorkspaceShell';
import { resolveWorkspacePageState } from './workspace-helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Workspace — GROVIA',
  description: 'Authenticated Grovia people-ops workspace, onboarding queue, and payroll.',
};

export default async function WorkspacePage() {
  const state = await resolveWorkspacePageState();

  if (state.redirectTo || !state.user) {
    redirect(state.redirectTo ?? '/login?next=%2Fworkspace');
  }

  return <WorkspaceShell initialPeople={state.people} user={state.user} />;
}
