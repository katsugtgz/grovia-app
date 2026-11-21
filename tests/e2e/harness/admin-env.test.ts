import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAdminEmail, resolveAdminPassword } from './admin-env';
import { resetLiveDatabase } from './live-http';

const configuredEnv = {
  ADMIN_EMAIL: '  Owner@EXAMPLE.TEST  ',
  ADMIN_PASSWORD: '  fixture-password  ',
  NODE_ENV: 'production' as const,
};

test('explicit admin configuration wins even with demo access disabled', () => {
  expect(resolveAdminEmail(configuredEnv)).toBe('owner@example.test');
  expect(resolveAdminPassword(configuredEnv)).toBe('fixture-password');
});

test('blank configured password only falls back when the target allows demo access', () => {
  const env = { ...configuredEnv, ADMIN_PASSWORD: '   ' };
  expect(resolveAdminPassword(env)).toBeUndefined();
  expect(resolveAdminPassword({ ...env, ALLOW_DEMO_ADMIN: '1' })).toBe(
    resolveAdminPassword({ NODE_ENV: 'development' })
  );
  expect(resolveAdminPassword({ NODE_ENV: 'development' })).toBeTruthy();
});

test('live reset preserves the configured administrator, not a fixed email', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grovia-test-admin-reset-'));
  const dbPath = join(dir, 'fixture.db');
  const db = new Database(dbPath);
  try {
    db.run('CREATE TABLE users (email TEXT);');
    db.run('INSERT INTO users VALUES (?), (?);', ['Owner@EXAMPLE.TEST', 'other@example.test']);
    resetLiveDatabase(dbPath, resolveAdminEmail(configuredEnv));
    expect(db.query('SELECT email FROM users').all()).toEqual([{ email: 'Owner@EXAMPLE.TEST' }]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
