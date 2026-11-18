import { getServerSession, type SessionPayload } from '@/lib/auth';
import { getPeople } from '@/lib/db';
import type { AuthUser, Person } from '@/lib/types';

export interface ResolveWorkspacePageStateArgs {
  getSession?: () => Promise<SessionPayload | null>;
  loadPeople?: () => Person[];
}

export interface WorkspacePageState {
  redirectTo: string | null;
  user: AuthUser | null;
  people: Person[];
}

export async function resolveWorkspacePageState({
  getSession = getServerSession,
  loadPeople = getPeople,
}: ResolveWorkspacePageStateArgs = {}): Promise<WorkspacePageState> {
  const session = await getSession();
  if (!session) {
    return {
      redirectTo: '/login?next=%2Fworkspace',
      user: null,
      people: [],
    };
  }

  const user: AuthUser = {
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
  };

  return {
    redirectTo: null,
    user,
    people: loadPeople(),
  };
}
