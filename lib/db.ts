import type { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'node:module';
import { hashPassword, verifyPassword } from './password';
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASS } from './demo-credentials';
import {
  getConfiguredPrivateAdminEmail,
  isPrivateAdminMode,
  resolveConfiguredAdminEmail,
} from './admin-mode';
import { SEED_PEOPLE } from './seed-people';
import { AVATAR_BG_COLORS, getAppearanceForSeed } from './template-core';
import { DEFAULT_AVATAR_COLOR } from './data';
import type { AppearanceConfig, AuthUser, Person } from './types';

const req = createRequire(import.meta.url);

// Fallback in-memory stores for non-Bun runtimes (e.g., Next.js build or Node serverless)
interface DummyWaitlistRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  teamSize: string | null;
  useCase: string | null;
  status: string;
  createdAt: string;
}

interface DummyInquiryRow {
  id: number;
  ticket_id: string;
  ticketId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DummyUserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  created_at: string;
}

interface DummyPersonRow {
  id: string;
  name: string;
  role: string;
  team: string;
  city: string;
  hire_date: string;
  since: string;
  status: string;
  av: string;
  rate: number;
  email: string;
  phone: string | null;
  bday: string | null;
  look_json: string | null;
  created_at: string;
}

interface DummyStores {
  waitlist: DummyWaitlistRow[];
  inquiries: DummyInquiryRow[];
  users: DummyUserRow[];
  people: DummyPersonRow[];
  nextWaitlistId: number;
  nextInquiryId: number;
  nextUserId: number;
}

type UnknownRecord = Record<string, unknown>;

const STORE_ARRAY_KEYS = ['waitlist', 'inquiries', 'users', 'people'] as const;
const STORE_COUNTER_KEYS = ['nextWaitlistId', 'nextInquiryId', 'nextUserId'] as const;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

declare global {
  // eslint-disable-next-line no-var
  var __grovia_db__: Database | undefined;
  // eslint-disable-next-line no-var
  var __grovia_db_path__: string | undefined;
  // eslint-disable-next-line no-var
  var __grovia_dummy_stores__: DummyStores | undefined;
}

/**
 * Single-entry memo for the demo-credential hint check: `{ storedHash,
 * promise }` where `promise` is stored synchronously before the expensive
 * scrypt verification is awaited, so concurrent callers share one pass and a
 * slower stale computation can never overwrite a newer verdict. Keyed by the
 * stored hash, so password rotation re-computes with no TTL to expire.
 */
let demoHintEntry: { storedHash: string; promise: Promise<boolean> } | null = null;

function getDummyStoreSnapshotPath(): string | null {
  const explicitEnvPath =
    process.env.DB_PATH || process.env.DATABASE_PATH || process.env.DATABASE_URL;
  const activePath = globalThis.__grovia_db_path__;
  const defaultDbPath = path.resolve(process.cwd(), 'grovia.db');

  if (
    process.env.NODE_ENV === 'test' &&
    !explicitEnvPath &&
    (!activePath || path.resolve(activePath) === defaultDbPath)
  ) {
    return null;
  }

  const rawPath = activePath || explicitEnvPath || getDatabasePath();
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === ':memory:') return null;
  return getSnapshotPathFor(trimmed);
}

/**
 * Resolves the JSON snapshot path for a concrete database path (normalized,
 * absolute). Pure: env-independent given the argument, so cache invalidation
 * can compare the previous path with the incoming one.
 */
function getSnapshotPathFor(rawDbPath: string): string {
  const trimmed = rawDbPath.trim();
  const normalized = trimmed.startsWith('file:') ? trimmed.slice(5) : trimmed;
  return path.isAbsolute(normalized)
    ? `${normalized}.store.json`
    : path.resolve(process.cwd(), `${normalized}.store.json`);
}

/**
 * Persists the non-Bun JSON snapshot atomically via temp file + rename.
 * Note: JSON snapshot fallback assumes a single writer process; multi-process
 * deployments should run on Bun SQLite (WAL) or an external database.
 */
function persistDummyStores(stores: DummyStores): void {
  const snapshotPath = getDummyStoreSnapshotPath();
  if (!snapshotPath) {
    const rawPath =
      globalThis.__grovia_db_path__ ||
      process.env.DB_PATH ||
      process.env.DATABASE_PATH ||
      process.env.DATABASE_URL ||
      '';
    if (rawPath.trim() === ':memory:' || process.env.NODE_ENV === 'test') {
      return;
    }
    throw new Error(
      'Persistent storage path is not configured for non-Bun runtime; refusing non-durable write'
    );
  }

  const dir = path.dirname(snapshotPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${snapshotPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(stores), 'utf8');
    fs.renameSync(tmpPath, snapshotPath);
  } catch (err) {
    // Remove the half-written snapshot copy so repeated failures cannot
    // litter the volume with duplicate store data; never mask the original
    // error.
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Nothing to clean or already gone.
    }
    throw err;
  }
}

function commitDummyMutation(stores: DummyStores, rollback: () => void): void {
  try {
    persistDummyStores(stores);
  } catch (err) {
    rollback();
    throw err;
  }
}

function getDummyStores(): DummyStores {
  if (!globalThis.__grovia_dummy_stores__) {
    const snapshotPath = getDummyStoreSnapshotPath();
    if (snapshotPath) {
      let raw: string | null = null;
      try {
        raw = fs.readFileSync(snapshotPath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          // Fail closed: an existing-but-unreadable snapshot may hold real
          // records. Never seed baseline data over it — that would overwrite
          // the operator's last recovery copy.
          throw new Error(
            `Failed to load existing data snapshot at ${snapshotPath}; refusing to overwrite it with seed data.`,
            { cause: err }
          );
        }
        // ENOENT: no snapshot yet — seed baseline below.
      }
      if (raw !== null) {
        let parsed: UnknownRecord;
        try {
          parsed = JSON.parse(raw) as UnknownRecord;
        } catch (err) {
          throw new Error(
            `Failed to parse existing data snapshot at ${snapshotPath}; refusing to overwrite it with seed data.`,
            { cause: err }
          );
        }
        // Complete-shape validation: every store array and every counter the
        // JSON adapter relies on must be present and well-typed. Partial
        // snapshots (e.g. hand-edited or truncated mid-write by an older
        // version) are rejected, not partially accepted.
        const badParts: string[] = [];
        if (!isPlainObject(parsed)) {
          badParts.push('root');
        } else {
          for (const key of STORE_ARRAY_KEYS) {
            if (!Array.isArray(parsed[key])) badParts.push(key);
          }
          for (const key of STORE_COUNTER_KEYS) {
            const value = parsed[key];
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
              badParts.push(key);
            }
          }
          if (badParts.length === 0) {
            // Row ids and next-ID counters must be positive safe integers, and a
            // counter strictly above every stored id: a next-ID at or below an
            // existing row would collide on the next insert.
            const maxStoredId = (key: (typeof STORE_ARRAY_KEYS)[number]): number =>
              (parsed[key] as unknown[]).reduce(
                (max: number, row) =>
                  isPlainObject(row) &&
                  typeof row.id === 'number' &&
                  Number.isSafeInteger(row.id) &&
                  row.id > 0
                    ? Math.max(max, row.id)
                    : max,
                0
              );
            if (maxStoredId('waitlist') >= (parsed.nextWaitlistId as number)) {
              badParts.push('nextWaitlistId');
            }
            if (maxStoredId('inquiries') >= (parsed.nextInquiryId as number)) {
              badParts.push('nextInquiryId');
            }
            if (maxStoredId('users') >= (parsed.nextUserId as number)) {
              badParts.push('nextUserId');
            }

            // Every stored row must be fully well-typed: the adapter hands these
            // fields straight to auth seeding and roster rendering, and a
            // corrupted row must fail closed at load, not surface later.
            const wellTyped: Record<
              (typeof STORE_ARRAY_KEYS)[number],
              (row: UnknownRecord) => boolean
            > = {
              waitlist: (r) =>
                typeof r.id === 'number' &&
                Number.isSafeInteger(r.id) &&
                r.id > 0 &&
                typeof r.name === 'string' &&
                typeof r.email === 'string' &&
                (r.company === null || typeof r.company === 'string') &&
                (r.teamSize === null || typeof r.teamSize === 'string') &&
                (r.useCase === null || typeof r.useCase === 'string') &&
                typeof r.status === 'string' &&
                typeof r.createdAt === 'string',
              inquiries: (r) =>
                typeof r.id === 'number' &&
                Number.isSafeInteger(r.id) &&
                r.id > 0 &&
                typeof r.ticket_id === 'string' &&
                typeof r.ticketId === 'string' &&
                typeof r.name === 'string' &&
                typeof r.email === 'string' &&
                typeof r.subject === 'string' &&
                typeof r.message === 'string' &&
                typeof r.priority === 'string' &&
                typeof r.status === 'string' &&
                typeof r.created_at === 'string' &&
                typeof r.updated_at === 'string',
              users: (r) =>
                typeof r.id === 'number' &&
                Number.isSafeInteger(r.id) &&
                r.id > 0 &&
                typeof r.email === 'string' &&
                typeof r.name === 'string' &&
                typeof r.role === 'string' &&
                typeof r.password_hash === 'string' &&
                typeof r.created_at === 'string',
              people: (r) =>
                typeof r.id === 'string' &&
                typeof r.name === 'string' &&
                typeof r.role === 'string' &&
                typeof r.team === 'string' &&
                typeof r.city === 'string' &&
                typeof r.hire_date === 'string' &&
                typeof r.since === 'string' &&
                typeof r.status === 'string' &&
                typeof r.av === 'string' &&
                typeof r.rate === 'number' &&
                Number.isFinite(r.rate) &&
                typeof r.email === 'string' &&
                (r.phone === null || typeof r.phone === 'string') &&
                (r.bday === null || typeof r.bday === 'string') &&
                (r.look_json === null || typeof r.look_json === 'string') &&
                typeof r.created_at === 'string',
            };
            for (const key of STORE_ARRAY_KEYS) {
              (parsed[key] as unknown[]).forEach((row, index) => {
                if (!isPlainObject(row) || !wellTyped[key](row)) {
                  badParts.push(`${key}[${index}]`);
                }
              });
            }
          }
        }
        if (badParts.length > 0) {
          const listed = badParts.slice(0, 8).join(',');
          throw new Error(
            `Data snapshot at ${snapshotPath} is malformed (bad: ${listed}${badParts.length > 8 ? ',…' : ''}); refusing to overwrite it with seed data.`
          );
        }
        globalThis.__grovia_dummy_stores__ = parsed as unknown as DummyStores;
        return globalThis.__grovia_dummy_stores__;
      }
    }

    const initialWaitlist: DummyWaitlistRow[] = [
      {
        id: 1,
        name: 'Alex Rivera',
        email: 'alex@innovate.io',
        company: 'Innovate Labs',
        teamSize: '11-50',
        useCase: 'Automated talent operations',
        status: 'active',
        createdAt: '2026-11-16 00:00:00',
      },
      {
        id: 2,
        name: 'Elena Rostova',
        email: 'elena@quantum.tech',
        company: 'Quantum Dynamics',
        teamSize: '51-200',
        useCase: 'Enterprise compensation modeling',
        status: 'active',
        createdAt: '2026-11-16 00:00:00',
      },
      {
        id: 3,
        name: 'Marcus Chen',
        email: 'marcus@hypergrowth.co',
        company: 'Hypergrowth AI',
        teamSize: '1-10',
        useCase: 'Early-stage sprint planning',
        status: 'active',
        createdAt: '2026-11-16 00:00:00',
      },
    ];

    const initialInquiries: DummyInquiryRow[] = [
      {
        id: 1,
        ticket_id: 'GROV-1001',
        ticketId: 'GROV-1001',
        name: 'Sarah Jenkins',
        email: 'sarah@vertex.io',
        subject: 'Enterprise Tier Licensing',
        message: 'Looking for custom volume licensing and SSO integration details.',
        priority: 'high',
        status: 'new',
        created_at: '2026-11-16 00:00:00',
        updated_at: '2026-11-16 00:00:00',
      },
      {
        id: 2,
        ticket_id: 'GROV-1002',
        ticketId: 'GROV-1002',
        name: "Liam O'Connor",
        email: 'liam@finscale.org',
        subject: 'API Webhook Documentation',
        message: 'Requesting API docs for payroll synchronization webhooks.',
        priority: 'medium',
        status: 'in_progress',
        created_at: '2026-11-16 00:00:00',
        updated_at: '2026-11-16 00:00:00',
      },
      {
        id: 3,
        ticket_id: 'GROV-1003',
        ticketId: 'GROV-1003',
        name: 'Chloe Zhao',
        email: 'chloe@nexus.co',
        subject: 'Bento Dashboard Customization',
        message: 'Can we reorder bento cards via the configuration schema?',
        priority: 'low',
        status: 'resolved',
        created_at: '2026-11-16 00:00:00',
        updated_at: '2026-11-16 00:00:00',
      },
    ];

    globalThis.__grovia_dummy_stores__ = {
      waitlist: initialWaitlist,
      inquiries: initialInquiries,
      users: [],
      people: [],
      nextWaitlistId: initialWaitlist.length + 1,
      nextInquiryId: initialInquiries.length + 1,
      nextUserId: 1,
    };
  }
  return globalThis.__grovia_dummy_stores__;
}

// Dynamically resolve Bun's native Database class to support Next.js build evaluation
let SqliteDatabase: typeof Database;
function getDatabaseConstructor(): typeof Database {
  if (!SqliteDatabase) {
    if (typeof Bun !== 'undefined') {
      SqliteDatabase = req('bun:sqlite').Database;
    } else {
      SqliteDatabase = class DummyDatabase {
        run(sql?: string) {
          if (sql && sql.trim().toUpperCase().startsWith('DELETE')) {
            return this.prepare(sql).run();
          }
          return { changes: 0, lastInsertRowid: 0 };
        }
        query(sql: string) {
          const stmt = this.prepare(sql);
          return {
            get: (...params: unknown[]) => stmt.get(...params),
            all: (...params: unknown[]) => stmt.all(...params),
            run: (...params: unknown[]) => stmt.run(...params),
          };
        }
        prepare(sql: string) {
          const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
          return {
            run: (...params: unknown[]) => {
              const stores = getDummyStores();
              const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

              if (normalized.startsWith('INSERT') && normalized.includes('INTO WAITLIST')) {
                const email = String(params[1] ?? '').trim().toLowerCase();
                const exists = stores.waitlist.some((r) => r.email.toLowerCase() === email);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0, lastInsertRowid: 0 };
                  throw new Error('UNIQUE constraint failed: waitlist.email');
                }
                const prevNextId = stores.nextWaitlistId;
                const id = stores.nextWaitlistId++;
                stores.waitlist.push({
                  id,
                  name: String(params[0] ?? ''),
                  email,
                  company: params[2] ? String(params[2]) : null,
                  teamSize: params[3] ? String(params[3]) : '1-10',
                  useCase: params[4] ? String(params[4]) : null,
                  status: params[5] ? String(params[5]) : 'pending',
                  createdAt: now,
                });
                commitDummyMutation(stores, () => {
                  stores.waitlist.pop();
                  stores.nextWaitlistId = prevNextId;
                });
                return { changes: 1, lastInsertRowid: id };
              }

              if (normalized.startsWith('INSERT') && normalized.includes('INTO INQUIRIES')) {
                const ticketId = String(params[0] ?? '');
                const exists = stores.inquiries.some((r) => r.ticket_id === ticketId);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0, lastInsertRowid: 0 };
                  throw new Error('UNIQUE constraint failed: inquiries.ticket_id');
                }
                const prevNextId = stores.nextInquiryId;
                const id = stores.nextInquiryId++;
                stores.inquiries.push({
                  id,
                  ticket_id: ticketId,
                  ticketId,
                  name: String(params[1] ?? ''),
                  email: String(params[2] ?? ''),
                  subject: String(params[3] ?? ''),
                  message: String(params[4] ?? ''),
                  priority: String(params[5] ?? 'medium'),
                  status: String(params[6] ?? 'new'),
                  created_at: now,
                  updated_at: now,
                });
                commitDummyMutation(stores, () => {
                  stores.inquiries.pop();
                  stores.nextInquiryId = prevNextId;
                });
                return { changes: 1, lastInsertRowid: id };
              }

              if (normalized.startsWith('INSERT') && normalized.includes('INTO USERS')) {
                const email = String(params[0] ?? '').trim().toLowerCase();
                const exists = stores.users.some((u) => u.email.toLowerCase() === email);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0, lastInsertRowid: 0 };
                  throw new Error('UNIQUE constraint failed: users.email');
                }
                const prevNextId = stores.nextUserId;
                const id = stores.nextUserId++;
                stores.users.push({
                  id,
                  email,
                  name: String(params[1] ?? ''),
                  role: String(params[2] ?? 'member'),
                  password_hash: String(params[3] ?? ''),
                  created_at: now,
                });
                commitDummyMutation(stores, () => {
                  stores.users.pop();
                  stores.nextUserId = prevNextId;
                });
                return { changes: 1, lastInsertRowid: id };
              }

              if (normalized.startsWith('UPDATE USERS')) {
                const [newHash, targetEmail] = params;
                const emailStr = String(targetEmail ?? '').trim().toLowerCase();
                const adminOnly = normalized.includes("ROLE = 'ADMIN'");
                const row = stores.users.find(
                  (u) =>
                    u.email.toLowerCase() === emailStr && (!adminOnly || u.role.toLowerCase() === 'admin')
                );
                if (!row) return { changes: 0 };
                const prevHash = row.password_hash;
                row.password_hash = String(newHash ?? '');
                commitDummyMutation(stores, () => {
                  row.password_hash = prevHash;
                });
                return { changes: 1 };
              }

              if (normalized.startsWith('INSERT') && normalized.includes('INTO PEOPLE')) {
                const id = String(params[0] ?? '');
                const email = String(params[10] ?? '').trim().toLowerCase();
                const dupId = stores.people.some((p) => p.id === id);
                const dupEmail = stores.people.some((p) => p.email.toLowerCase() === email);
                if (dupId || dupEmail) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0, lastInsertRowid: 0 };
                  if (dupEmail) throw new Error('UNIQUE constraint failed: people.email');
                  throw new Error('UNIQUE constraint failed: people.id');
                }
                const newPersonRow: DummyPersonRow = {
                  id,
                  name: String(params[1] ?? ''),
                  role: String(params[2] ?? ''),
                  team: String(params[3] ?? ''),
                  city: String(params[4] ?? 'Remote'),
                  hire_date: String(params[5] ?? ''),
                  since: String(params[6] ?? 'Invited today'),
                  status: String(params[7] ?? 'Invited'),
                  av: String(params[8] ?? DEFAULT_AVATAR_COLOR),
                  rate: Number(params[9] ?? 40),
                  email,
                  phone: params[11] != null ? String(params[11]) : 'Not provided',
                  bday: params[12] != null ? String(params[12]) : 'Not provided',
                  look_json: params[13] != null ? String(params[13]) : null,
                  created_at: now,
                };
                stores.people.push(newPersonRow);
                commitDummyMutation(stores, () => {
                  stores.people.pop();
                });
                return { changes: 1, lastInsertRowid: stores.people.length };
              }

              if (normalized.startsWith('UPDATE INQUIRIES')) {
                const [status, priority, targetId] = params;
                const row = stores.inquiries.find((r) => r.id === Number(targetId));
                if (!row) return { changes: 0 };
                const prevStatus = row.status;
                const prevPriority = row.priority;
                const prevUpdatedAt = row.updated_at;
                row.status = String(status);
                row.priority = String(priority);
                row.updated_at = now;
                commitDummyMutation(stores, () => {
                  row.status = prevStatus;
                  row.priority = prevPriority;
                  row.updated_at = prevUpdatedAt;
                });
                return { changes: 1 };
              }

              if (normalized.startsWith('DELETE FROM WAITLIST')) {
                const prev = [...stores.waitlist];
                stores.waitlist.length = 0;
                commitDummyMutation(stores, () => {
                  stores.waitlist = prev;
                });
                return { changes: prev.length };
              }

              if (normalized.startsWith('DELETE FROM INQUIRIES')) {
                const prev = [...stores.inquiries];
                stores.inquiries.length = 0;
                commitDummyMutation(stores, () => {
                  stores.inquiries = prev;
                });
                return { changes: prev.length };
              }

              if (normalized.startsWith('DELETE FROM USERS')) {
                const prev = [...stores.users];
                if (normalized.includes("LOWER(EMAIL) != 'ADMIN@GROVIA.IO'")) {
                  stores.users = stores.users.filter((u) => u.email.toLowerCase() === 'admin@grovia.io');
                } else {
                  stores.users.length = 0;
                }
                commitDummyMutation(stores, () => {
                  stores.users = prev;
                });
                return { changes: prev.length - stores.users.length };
              }

              if (normalized.startsWith('DELETE FROM PEOPLE')) {
                const prev = [...stores.people];
                if (normalized.includes('ID NOT IN')) {
                  const baselineIds = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
                  stores.people = stores.people.filter((p) => baselineIds.has(p.id));
                } else {
                  stores.people.length = 0;
                }
                commitDummyMutation(stores, () => {
                  stores.people = prev;
                });
                return { changes: prev.length - stores.people.length };
              }

              return { changes: 0 };
            },
            get: (...params: unknown[]) => {
              const stores = getDummyStores();
              if (normalized.includes('SELECT 1 AS ALIVE')) {
                return { alive: 1 };
              }
              if (normalized.includes('COUNT(*)')) {
                if (normalized.includes('FROM WAITLIST')) {
                  return { count: stores.waitlist.length };
                }
                if (normalized.includes('FROM INQUIRIES')) {
                  return { count: stores.inquiries.length };
                }
                if (normalized.includes('FROM USERS')) {
                  return { count: stores.users.length };
                }
                if (normalized.includes('FROM PEOPLE')) {
                  return { count: stores.people.length };
                }
              }
              if (normalized.includes('FROM WAITLIST') && normalized.includes('LOWER(EMAIL) = ?')) {
                const targetEmail = String(params[0] ?? '').trim().toLowerCase();
                const found = stores.waitlist.find((r) => r.email.toLowerCase() === targetEmail);
                return found ? { id: found.id } : null;
              }
              if (normalized.includes('FROM INQUIRIES')) {
                if (normalized.includes('WHERE TICKET_ID = ? OR CAST(ID AS TEXT) = ?')) {
                  const a = String(params[0] ?? '');
                  const b = String(params[1] ?? '');
                  return stores.inquiries.find((r) => r.ticket_id === a || String(r.id) === b) || null;
                }
                if (normalized.includes('WHERE TICKET_ID = ?')) {
                  const ticketId = String(params[0] ?? '');
                  return stores.inquiries.find((r) => r.ticket_id === ticketId) || null;
                }
                if (normalized.includes('WHERE ID = ?')) {
                  const idNum = Number(params[0]);
                  const found = stores.inquiries.find((r) => r.id === idNum);
                  return found ? { ...found, updatedAt: found.updated_at } : null;
                }
              }
              if (normalized.includes('FROM USERS')) {
                if (normalized.includes('LOWER(EMAIL) = ?')) {
                  const targetEmail = String(params[0] ?? '').trim().toLowerCase();
                  const found = stores.users.find((u) => u.email.toLowerCase() === targetEmail);
                  if (!found) return null;
                  if (normalized.startsWith('SELECT ID FROM USERS')) {
                    return { id: found.id };
                  }
                  return { ...found };
                }
                if (normalized.includes('WHERE ID = ?')) {
                  const idNum = Number(params[0]);
                  const found = stores.users.find((u) => u.id === idNum);
                  if (!found) return null;
                  if (!normalized.includes('PASSWORD_HASH')) {
                    return { id: found.id, email: found.email, name: found.name, role: found.role };
                  }
                  return { ...found };
                }
              }
              if (normalized.includes('FROM PEOPLE')) {
                if (normalized.includes('LOWER(EMAIL) = ?')) {
                  const targetEmail = String(params[0] ?? '').trim().toLowerCase();
                  const found = stores.people.find((p) => p.email.toLowerCase() === targetEmail);
                  if (!found) return null;
                  if (normalized.startsWith('SELECT ID FROM PEOPLE')) {
                    return { id: found.id };
                  }
                  return { ...found };
                }
                if (normalized.includes('WHERE ID = ?')) {
                  const idStr = String(params[0] ?? '');
                  const found = stores.people.find((p) => p.id === idStr);
                  return found ? { ...found } : null;
                }
              }
              return null;
            },
            all: (...params: unknown[]) => {
              const stores = getDummyStores();
              if (normalized.includes('FROM WAITLIST')) {
                const limit = typeof params[0] === 'number' ? params[0] : 50;
                return stores.waitlist.slice(0, limit).map((r) => ({ ...r }));
              }
              if (normalized.includes('FROM INQUIRIES')) {
                const statusFilter = params.length > 0 && params[0] ? String(params[0]) : undefined;
                const rows = statusFilter
                  ? stores.inquiries.filter((r) => r.status === statusFilter)
                  : stores.inquiries;
                return [...rows].sort((a, b) => b.id - a.id).map((r) => ({ ...r }));
              }
              if (normalized.includes('FROM USERS')) {
                return stores.users.map((u) => ({ ...u }));
              }
              if (normalized.includes('FROM PEOPLE')) {
                return stores.people.map((p) => ({ ...p }));
              }
              return [];
            },
          };
        }
        transaction(fn: (...args: unknown[]) => unknown) {
          return fn;
        }
        close() {}
      } as unknown as typeof Database;
    }
  }
  return SqliteDatabase;
}

export function getDatabasePath(): string {
  const envPath =
    process.env.DB_PATH || process.env.DATABASE_PATH || process.env.DATABASE_URL;
  if (envPath) {
    if (envPath === ':memory:') return ':memory:';
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), 'grovia.db');
}

export function configurePragmas(database: Database): void {
  try {
    database.run('PRAGMA journal_mode = WAL;');
  } catch {
    // WAL mode not supported in :memory:
  }
  database.run('PRAGMA foreign_keys = ON;');
  database.run('PRAGMA synchronous = NORMAL;');
  database.run('PRAGMA busy_timeout = 5000;');
}

export function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      company TEXT,
      team_size TEXT DEFAULT '1-10',
      use_case TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'invited', 'rejected', 'active')),
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT DEFAULT 'new' CHECK (status IN ('new', 'open', 'in_progress', 'resolved', 'closed')),
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_ticket ON inquiries(ticket_id);
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      team TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Remote',
      hire_date TEXT NOT NULL,
      since TEXT NOT NULL DEFAULT 'Invited today',
      status TEXT NOT NULL DEFAULT 'Invited',
      av TEXT NOT NULL DEFAULT '${DEFAULT_AVATAR_COLOR}',
      rate REAL NOT NULL DEFAULT 40,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT DEFAULT 'Not provided',
      bday TEXT DEFAULT 'Not provided',
      look_json TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_people_email ON people(email);
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_people_team ON people(team);
  `);

  ensureAuthAndPeopleSeeded(database);
}

export function getConfiguredAdminEmail(): string {
  return resolveConfiguredAdminEmail();
}

export function isDemoAdminAllowedInEnv(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_ADMIN === '1';
}

/**
 * Production privileged-admin policy, fail closed: administrator sessions are
 * honored ONLY when the deployment explicitly opted into demo mode
 * (`ALLOW_DEMO_ADMIN=1`) or runs a valid private mode (`ADMIN_PASSWORD` set to
 * a non-public value — never the publicly known demo password). Any other
 * production configuration — no private password, or the public default
 * masquerading as one — rejects privileged admin access outright, including
 * legacy demo-era sessions for any previously configured custom admin email.
 * Ordinary member sessions are unaffected.
 */
export function isPrivilegedAdminSessionAllowed(session: {
  role: string;
  email: string;
}): boolean {
  if (session.role !== 'admin') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  if (process.env.ALLOW_DEMO_ADMIN === '1') return true;
  return isPrivateAdminMode();
}

/**
 * Single server-side policy for roster PII access (list + invite), shared by
 * `/api/people`, `/api/waitlist` and the `/workspace` page so all three can
 * never disagree about who may see or mutate privileged data.
 *
 * Production is fail closed (`isPrivilegedAdminSessionAllowed`): admin access
 * requires explicit demo opt-in or a valid private mode. Private mode further
 * restricts to the configured identity, honored on the strength of the
 * login-time proof — the login route verifies the submitted password against
 * the configured identity's stored row (the only path that issues a
 * `cred`-stamped admin session) and the session layer rejects admin sessions
 * whose credential-version stamp is missing or stale. No per-request scrypt
 * runs on read paths.
 *
 * Legacy demo-era rows (any stale admin row seeded with the public demo
 * password, under any historical admin email) fail closed: production without
 * demo opt-in grants no privileged admin access, and in private mode they are
 * not the configured identity.
 */
export function isRosterAdminSession(session: { role: string; email: string }): boolean {
  if (session.role !== 'admin') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  if (!isPrivateAdminMode()) {
    return process.env.ALLOW_DEMO_ADMIN === '1';
  }
  const configuredEmail = getConfiguredPrivateAdminEmail();
  return configuredEmail !== null && session.email.trim().toLowerCase() === configuredEmail;
}

/**
 * Whether the well-known demo credentials (`admin@grovia.io` /
 * `grovia-demo-2026`) are the ones actually live in this environment. The
 * login page may render them only when this is true:
 *
 * - the environment allows the demo admin and neither `ADMIN_EMAIL` nor
 *   `ADMIN_PASSWORD` overrides the defaults (cheap config gate, checked on
 *   every call), and
 * - the persisted admin row actually verifies the shared demo password
 *   (seeding is insert-or-ignore, so a previously saved admin password —
 *   e.g. seeded earlier under `ADMIN_PASSWORD`, override since removed — must
 *   not be claimed as the demo defaults).
 *
 * Read failures or a missing row fail closed (no hint). The lookup itself is
 * read-only; only the costly verification result is cached, in a single-entry
 * promise keyed by the stored hash, so config changes re-evaluate immediately
 * while password rotation re-keys the cache with no TTL to expire.
 */
export async function showsDefaultDemoCredentials(): Promise<boolean> {
  if (
    !isDemoAdminAllowedInEnv() ||
    getConfiguredAdminEmail() !== DEMO_ADMIN_EMAIL ||
    process.env.ADMIN_PASSWORD?.trim()
  ) {
    return false;
  }

  let entry = demoHintEntry;
  try {
    const user = findUserByEmail(DEMO_ADMIN_EMAIL);
    if (!user || user.role !== 'admin') {
      demoHintEntry = null;
      return false;
    }
    if (!entry || entry.storedHash !== user.password_hash) {
      // Store the pending promise synchronously: concurrent callers await this
      // same pass, and later verdicts only replace the entry keyed by their
      // own hash.
      entry = {
        storedHash: user.password_hash,
        promise: verifyPassword(DEMO_ADMIN_PASS, user.password_hash),
      };
      demoHintEntry = entry;
    }
    return await entry.promise;
  } catch {
    // Operational failure (e.g. transient scrypt error): hide the hint for
    // this request but allow the next request to retry. Clear the memo only
    // if it still holds this exact pending pass — a newer completed verdict
    // for the same hash must be preserved.
    if (demoHintEntry && demoHintEntry.promise === entry?.promise) {
      demoHintEntry = null;
    }
    return false;
  }
}

/**
 * Provisioning lookup for the configured admin identity: one select returning
 * the row's role, so a member row pre-claiming that email can be rejected
 * before any password-hash mutation.
 */
function findUserRowForSeeding(
  database: Database,
  adminEmail: string
): { id: unknown; role: string } | undefined {
  return database
    .prepare('SELECT id, role FROM users WHERE LOWER(email) = ?')
    .get(adminEmail) as { id: unknown; role: string } | undefined;
}

export function ensureAuthAndPeopleSeeded(database: Database): void {
  const adminEmail = resolveConfiguredAdminEmail();
  const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();
  const allowDemoAdmin = isDemoAdminAllowedInEnv();
  const adminPassword =
    configuredAdminPassword && configuredAdminPassword.length > 0
      ? configuredAdminPassword
      : allowDemoAdmin
        ? DEMO_ADMIN_PASS
        : null;

  if (adminPassword) {
    const existingRow = findUserRowForSeeding(database, adminEmail);
    if (existingRow && existingRow.role.toLowerCase() !== 'admin') {
      // Reject a non-admin row already holding the configured admin identity
      // before any password-hash mutation: rotating that row's hash (or
      // ignoring it) would silently promote member data to the privileged
      // account — regardless of demo opt-in.
      throw new Error(
        `Refusing admin seeding: non-admin user already exists with configured admin email ${adminEmail}.`
      );
    }

    if (!existingRow) {
      const adminHash = hashPassword(adminPassword);
      database
        .prepare('INSERT OR IGNORE INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
        .run(adminEmail, 'Alex Rivera', 'admin', adminHash);
    } else if (configuredAdminPassword && configuredAdminPassword.length > 0) {
      // Rotate stored admin hash when an explicit ADMIN_PASSWORD is configured so a
      // previously seeded public demo password cannot survive into production.
      // The role predicate keeps non-admin rows at this email out of scope.
      const rotatedHash = hashPassword(configuredAdminPassword);
      database
        .prepare(
          "UPDATE users SET password_hash = ? WHERE LOWER(email) = ? AND role = 'admin' COLLATE NOCASE"
        )
        .run(rotatedHash, adminEmail);
    }
  }

  const insertPerson = database.prepare(`
    INSERT OR IGNORE INTO people (id, name, role, team, city, hire_date, since, status, av, rate, email, phone, bday, look_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const person of SEED_PEOPLE) {
    const look = person.look ?? getAppearanceForSeed(person.name);
    insertPerson.run(
      person.id,
      person.name,
      person.role,
      person.team,
      person.city,
      person.hireDate,
      person.since || 'Sample date',
      person.status,
      person.av || DEFAULT_AVATAR_COLOR,
      person.rate ?? 40,
      (person.email || `person${person.id}@example.invalid`).toLowerCase(),
      person.phone || 'Not provided',
      person.bday || 'Not provided',
      JSON.stringify(look)
    );
  }
}

export function initDatabase(dbPath?: string): Database {
  const targetPath = dbPath || getDatabasePath();

  if (typeof Bun !== 'undefined' && targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // If there's an existing open database instance, close it before opening a new one
  if (globalThis.__grovia_db__) {
    try {
      globalThis.__grovia_db__.close();
    } catch {
      // Ignore if already closed
    }
    globalThis.__grovia_db__ = undefined;
    globalThis.__grovia_db_path__ = undefined;
  }

  // Snapshot rows are cached per process; a re-init at any path must drop
  // them so stale rows can never flush into the new snapshot — including the
  // case where env already points at a different path (the previous path is
  // no longer observable here, so unconditional clearing is the only safe
  // order). The cache is dropped and the path published BEFORE schema init:
  // a rejected initialization must leave the module in a cold state (no open
  // handle, no snapshot rows) so the next getDb() re-seeds from scratch.
  globalThis.__grovia_dummy_stores__ = undefined;
  globalThis.__grovia_db__ = undefined;
  globalThis.__grovia_db_path__ = targetPath;

  const DbConstructor = getDatabaseConstructor();
  const database = new DbConstructor(targetPath, { create: true });
  configurePragmas(database);
  initSchema(database);

  globalThis.__grovia_db__ = database;
  return database;
}

export function getDb(customPath?: string): Database {
  if (customPath) {
    return initDatabase(customPath);
  }

  if (globalThis.__grovia_db__) {
    const curPath = globalThis.__grovia_db_path__;
    if (typeof Bun !== 'undefined' && curPath && curPath !== ':memory:' && !fs.existsSync(curPath)) {
      try {
        globalThis.__grovia_db__.close();
      } catch {
        // Ignore
      }
      globalThis.__grovia_db__ = undefined;
      globalThis.__grovia_db_path__ = undefined;
    } else {
      try {
        globalThis.__grovia_db__.query('SELECT 1 as alive').get();
        return globalThis.__grovia_db__;
      } catch {
        try {
          globalThis.__grovia_db__.close();
        } catch {
          // Ignore
        }
        globalThis.__grovia_db__ = undefined;
        globalThis.__grovia_db_path__ = undefined;
      }
    }
  }

  return initDatabase();
}

// Proxy export for transparent dynamic database resolution
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  },
});

export function closeDb(): void {
  if (globalThis.__grovia_db__) {
    try {
      globalThis.__grovia_db__.close();
    } catch {
      // Ignore if already closed
    }
    globalThis.__grovia_db__ = undefined;
    globalThis.__grovia_db_path__ = undefined;
    // Drop snapshot rows so a close followed by re-init at another path can
    // never flush this path's rows into the new snapshot.
    globalThis.__grovia_dummy_stores__ = undefined;
  }
}

export function checkHealth(): 'healthy' | 'degraded' | 'unhealthy' {
  try {
    const currentDb = getDb();
    const result = currentDb.query('SELECT 1 as alive').get() as { alive: number } | null;
    return result && result.alive === 1 ? 'healthy' : 'degraded';
  } catch {
    return 'unhealthy';
  }
}

export function isDatabaseHealthy(): boolean {
  return checkHealth() === 'healthy';
}

export function generateTicketId(database?: Database): string {
  const currentDb = database || getDb();
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let ticketId = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 100) {
    attempts++;
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    ticketId = `GROV-${code}`;
    const row = currentDb.prepare('SELECT id FROM inquiries WHERE ticket_id = ?').get(ticketId);
    if (!row) {
      exists = false;
    }
  }

  if (exists) {
    ticketId = `GROV-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  return ticketId;
}

export interface WaitlistInputData {
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  useCase?: string;
}

export function addWaitlistEntry(data: WaitlistInputData): {
  success: boolean;
  duplicate: boolean;
  position: number;
} {
  const currentDb = getDb();
  const normalizedEmail = data.email.trim().toLowerCase();

  const existing = currentDb.prepare('SELECT id FROM waitlist WHERE LOWER(email) = ?').get(normalizedEmail);
  if (existing) {
    return { success: false, duplicate: true, position: 0 };
  }

  try {
    const insertTx = currentDb.transaction(() => {
      currentDb.prepare(`
        INSERT INTO waitlist (name, email, company, team_size, use_case, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(
        data.name.trim(),
        normalizedEmail,
        data.company?.trim() || null,
        data.teamSize?.trim() || '1-10',
        data.useCase?.trim() || null
      );

      const countRow = currentDb.query('SELECT COUNT(*) as count FROM waitlist').get() as { count: number };
      return countRow.count;
    });

    const position = insertTx();
    return { success: true, duplicate: false, position };
  } catch (err: any) {
    if (err.message && (err.message.includes('UNIQUE') || err.message.includes('constraint'))) {
      return { success: false, duplicate: true, position: 0 };
    }
    throw err;
  }
}

export function getWaitlist(limit = 50) {
  const currentDb = getDb();
  return currentDb
    .prepare(
      `SELECT id, name, email, company, team_size as teamSize, use_case as useCase, status, created_at as createdAt
       FROM waitlist
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(limit) as Array<{
      id: number;
      name: string;
      email: string;
      company: string | null;
      teamSize: string | null;
      useCase: string | null;
      status: string;
      createdAt: string;
    }>;
}

export function getWaitlistCount(): number {
  const currentDb = getDb();
  const row = currentDb.query('SELECT COUNT(*) as count FROM waitlist').get() as { count: number } | null;
  return row ? row.count : 0;
}

export interface InquiryInputData {
  name: string;
  email: string;
  subject: string;
  message: string;
  priority?: string;
}

export function createInquiry(data: InquiryInputData) {
  const currentDb = getDb();
  const ticketId = generateTicketId(currentDb);
  const priority = data.priority || 'medium';
  const status = 'new';

  const insertTx = currentDb.transaction(() => {
    currentDb.prepare(`
      INSERT INTO inquiries (ticket_id, name, email, subject, message, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticketId,
      data.name.trim(),
      data.email.trim(),
      data.subject.trim(),
      data.message.trim(),
      priority,
      status
    );

    const record = currentDb.prepare(`
      SELECT id, ticket_id as ticketId, ticket_id, name, email, subject, message, priority, status, created_at, updated_at
      FROM inquiries
      WHERE ticket_id = ?
    `).get(ticketId) as any;

    return record;
  });

  return insertTx();
}

export function getInquiries(statusFilter?: string) {
  const currentDb = getDb();
  let query = 'SELECT id, ticket_id as ticketId, ticket_id, name, email, subject, message, priority, status, created_at, updated_at FROM inquiries';
  const params: any[] = [];
  if (statusFilter) {
    query += ' WHERE status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY id DESC';

  return currentDb.prepare(query).all(...params) as Array<{
    id: number;
    ticketId: string;
    ticket_id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
}

export function updateInquiry(
  ticketIdOrId: string | number,
  updates: { status?: string; priority?: string }
) {
  const currentDb = getDb();
  const idStr = String(ticketIdOrId);

  const existing = currentDb
    .prepare('SELECT * FROM inquiries WHERE ticket_id = ? OR CAST(id AS TEXT) = ?')
    .get(idStr, idStr) as any;

  if (!existing) {
    return null;
  }

  const newStatus = updates.status || existing.status;
  const newPriority = updates.priority || existing.priority;

  currentDb
    .prepare(
      `UPDATE inquiries SET status = ?, priority = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(newStatus, newPriority, existing.id);

  const updated = currentDb
    .prepare(
      `SELECT id, ticket_id as ticketId, ticket_id, name, email, subject, message, priority, status, created_at, updated_at as updatedAt
       FROM inquiries
       WHERE id = ?`
    )
    .get(existing.id) as any;

  return updated;
}

export interface UserDbRow {
  id: number;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  created_at: string;
}

export function findUserByEmail(email: string): UserDbRow | null {
  const currentDb = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const row = currentDb
    .prepare(
      'SELECT id, email, name, role, password_hash, created_at FROM users WHERE LOWER(email) = ?'
    )
    .get(normalizedEmail) as UserDbRow | null | undefined;
  return row ?? null;
}

export function findUserById(id: number): AuthUser | null {
  const currentDb = getDb();
  const row = currentDb
    .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
    .get(id) as AuthUser | null | undefined;
  return row ?? null;
}

interface PersonDbRow {
  id: string;
  name: string;
  role: string;
  team: string;
  city: string;
  hire_date: string;
  since: string | null;
  status: string;
  av: string | null;
  rate: number | null;
  email: string;
  phone: string | null;
  bday: string | null;
  look_json: string | null;
  created_at?: string;
}

function mapPersonRow(row: PersonDbRow): Person {
  let look: AppearanceConfig | undefined;
  if (row.look_json) {
    try {
      look = JSON.parse(row.look_json) as AppearanceConfig;
    } catch {
      look = getAppearanceForSeed(row.name);
    }
  } else {
    look = getAppearanceForSeed(row.name);
  }

  return {
    id: String(row.id),
    name: row.name,
    role: row.role,
    team: row.team,
    city: row.city,
    hireDate: row.hire_date,
    since: row.since || 'Sample date',
    status: row.status,
    av: row.av || DEFAULT_AVATAR_COLOR,
    rate: typeof row.rate === 'number' ? row.rate : Number(row.rate ?? 40),
    email: row.email,
    phone: row.phone || 'Not provided',
    bday: row.bday || 'Not provided',
    look,
  };
}

export function getPeople(): Person[] {
  const currentDb = getDb();
  const rows = currentDb
    .prepare(
      `SELECT id, name, role, team, city, hire_date, since, status, av, rate, email, phone, bday, look_json, created_at
       FROM people
       ORDER BY rowid ASC`
    )
    .all() as PersonDbRow[];
  return rows.map(mapPersonRow);
}

export interface CreatePersonInput {
  name: string;
  email: string;
  role: string;
  team: string;
  city?: string;
  rate?: number;
}

export function createPerson(data: CreatePersonInput): {
  success: boolean;
  duplicate: boolean;
  person: Person | null;
} {
  const currentDb = getDb();
  const cleanName = data.name.trim();
  const normalizedEmail = data.email.trim().toLowerCase();
  const cleanRole = data.role.trim();
  const cleanTeam = data.team.trim();
  const cleanCity = data.city?.trim() || 'Remote';
  const cleanRate = typeof data.rate === 'number' && Number.isFinite(data.rate) ? data.rate : 40;

  const existing = currentDb
    .prepare('SELECT id FROM people WHERE LOWER(email) = ?')
    .get(normalizedEmail);
  if (existing) {
    return { success: false, duplicate: true, person: null };
  }

  const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hireDate = new Date().toISOString().split('T')[0];
  const since = 'Invited today';
  const status = 'Invited';
  const nameHash = [...cleanName].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const av = AVATAR_BG_COLORS[nameHash % AVATAR_BG_COLORS.length] || DEFAULT_AVATAR_COLOR;
  const look = getAppearanceForSeed(cleanName);

  try {
    const insertTx = currentDb.transaction(() => {
      currentDb
        .prepare(
          `INSERT INTO people (id, name, role, team, city, hire_date, since, status, av, rate, email, phone, bday, look_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          cleanName,
          cleanRole,
          cleanTeam,
          cleanCity,
          hireDate,
          since,
          status,
          av,
          cleanRate,
          normalizedEmail,
          'Not provided',
          'Not provided',
          JSON.stringify(look)
        );

      return currentDb
        .prepare(
          `SELECT id, name, role, team, city, hire_date, since, status, av, rate, email, phone, bday, look_json, created_at
           FROM people
           WHERE id = ?`
        )
        .get(id) as PersonDbRow | null;
    });

    const row = insertTx() as PersonDbRow | null;
    if (!row) {
      return { success: false, duplicate: false, person: null };
    }
    return { success: true, duplicate: false, person: mapPersonRow(row) };
  } catch (err: any) {
    if (err?.message && (err.message.includes('UNIQUE') || err.message.includes('constraint'))) {
      return { success: false, duplicate: true, person: null };
    }
    throw err;
  }
}

export function seedDatabase(database: Database): void {
  initSchema(database);

  const insertWaitlist = database.prepare(`
    INSERT OR IGNORE INTO waitlist (name, email, company, team_size, use_case, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const initialWaitlist = [
    ['Alex Rivera', 'alex@innovate.io', 'Innovate Labs', '11-50', 'Automated talent operations', 'active'],
    ['Elena Rostova', 'elena@quantum.tech', 'Quantum Dynamics', '51-200', 'Enterprise compensation modeling', 'active'],
    ['Marcus Chen', 'marcus@hypergrowth.co', 'Hypergrowth AI', '1-10', 'Early-stage sprint planning', 'active'],
  ];

  for (const entry of initialWaitlist) {
    insertWaitlist.run(...entry);
  }

  const insertInquiry = database.prepare(`
    INSERT OR IGNORE INTO inquiries (ticket_id, name, email, subject, message, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const initialInquiries = [
    ['GROV-1001', 'Sarah Jenkins', 'sarah@vertex.io', 'Enterprise Tier Licensing', 'Looking for custom volume licensing and SSO integration details.', 'high', 'new'],
    ['GROV-1002', 'Liam O\'Connor', 'liam@finscale.org', 'API Webhook Documentation', 'Requesting API docs for payroll synchronization webhooks.', 'medium', 'in_progress'],
    ['GROV-1003', 'Chloe Zhao', 'chloe@nexus.co', 'Bento Dashboard Customization', 'Can we reorder bento cards via the configuration schema?', 'low', 'resolved'],
  ];

  for (const item of initialInquiries) {
    insertInquiry.run(...item);
  }
}
