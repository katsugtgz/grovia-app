import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASS } from '@/lib/demo-credentials';

export type AdminEnv = Readonly<Record<string, string | undefined>>;

// Match the server's seeding logic in lib/db.ts for the target environment.
export function resolveAdminEmail(env: AdminEnv = process.env): string {
  return (env.ADMIN_EMAIL?.trim() || DEMO_ADMIN_EMAIL).toLowerCase();
}

export function resolveAdminPassword(env: AdminEnv = process.env): string | undefined {
  const configured = env.ADMIN_PASSWORD?.trim();
  if (configured) return configured;
  if (env.NODE_ENV !== 'production' || env.ALLOW_DEMO_ADMIN === '1') {
    return DEMO_ADMIN_PASS;
  }
  return undefined;
}
