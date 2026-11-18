import type { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'node:module';
import { hashPassword } from './password';
import { SEED_PEOPLE } from './seed-people';
import { AVATAR_BG_COLORS, getAppearanceForSeed } from './template-core';
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

declare global {
  // eslint-disable-next-line no-var
  var __grovia_db__: Database | undefined;
  // eslint-disable-next-line no-var
  var __grovia_db_path__: string | undefined;
  // eslint-disable-next-line no-var
  var __grovia_dummy_stores__: DummyStores | undefined;
}

function getDummyStores(): DummyStores {
  if (!globalThis.__grovia_dummy_stores__) {
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
                return { changes: 1, lastInsertRowid: id };
              }

              if (normalized.startsWith('INSERT') && normalized.includes('INTO INQUIRIES')) {
                const ticketId = String(params[0] ?? '');
                const exists = stores.inquiries.some((r) => r.ticket_id === ticketId);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0, lastInsertRowid: 0 };
                  throw new Error('UNIQUE constraint failed: inquiries.ticket_id');
                }
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
                return { changes: 1, lastInsertRowid: id };
              }

              if (normalized.startsWith('INSERT') && normalized.includes('INTO USERS')) {
                const email = String(params[0] ?? '').trim().toLowerCase();
                const exists = stores.users.some((u) => u.email.toLowerCase() === email);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0, lastInsertRowid: 0 };
                  throw new Error('UNIQUE constraint failed: users.email');
                }
                const id = stores.nextUserId++;
                stores.users.push({
                  id,
                  email,
                  name: String(params[1] ?? ''),
                  role: String(params[2] ?? 'member'),
                  password_hash: String(params[3] ?? ''),
                  created_at: now,
                });
                return { changes: 1, lastInsertRowid: id };
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
                stores.people.push({
                  id,
                  name: String(params[1] ?? ''),
                  role: String(params[2] ?? ''),
                  team: String(params[3] ?? ''),
                  city: String(params[4] ?? 'Remote'),
                  hire_date: String(params[5] ?? ''),
                  since: String(params[6] ?? 'Invited today'),
                  status: String(params[7] ?? 'Invited'),
                  av: String(params[8] ?? '#cfe0c8'),
                  rate: Number(params[9] ?? 40),
                  email,
                  phone: params[11] != null ? String(params[11]) : 'Not provided',
                  bday: params[12] != null ? String(params[12]) : 'Not provided',
                  look_json: params[13] != null ? String(params[13]) : null,
                  created_at: now,
                });
                return { changes: 1, lastInsertRowid: stores.people.length };
              }

              if (normalized.startsWith('UPDATE INQUIRIES')) {
                const [status, priority, targetId] = params;
                const row = stores.inquiries.find((r) => r.id === Number(targetId));
                if (!row) return { changes: 0 };
                row.status = String(status);
                row.priority = String(priority);
                row.updated_at = now;
                return { changes: 1 };
              }

              if (normalized.startsWith('DELETE FROM WAITLIST')) {
                const count = stores.waitlist.length;
                stores.waitlist.length = 0;
                return { changes: count };
              }

              if (normalized.startsWith('DELETE FROM INQUIRIES')) {
                const count = stores.inquiries.length;
                stores.inquiries.length = 0;
                return { changes: count };
              }

              if (normalized.startsWith('DELETE FROM USERS')) {
                if (normalized.includes("LOWER(EMAIL) != 'ADMIN@GROVIA.IO'")) {
                  const before = stores.users.length;
                  stores.users = stores.users.filter((u) => u.email.toLowerCase() === 'admin@grovia.io');
                  return { changes: before - stores.users.length };
                }
                const count = stores.users.length;
                stores.users.length = 0;
                return { changes: count };
              }

              if (normalized.startsWith('DELETE FROM PEOPLE')) {
                if (normalized.includes('ID NOT IN')) {
                  const baselineIds = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
                  const before = stores.people.length;
                  stores.people = stores.people.filter((p) => baselineIds.has(p.id));
                  return { changes: before - stores.people.length };
                }
                const count = stores.people.length;
                stores.people.length = 0;
                return { changes: count };
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
      av TEXT NOT NULL DEFAULT '#cfe0c8',
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

export function ensureAuthAndPeopleSeeded(database: Database): void {
  const existingAdmin = database
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .get('admin@grovia.io');

  if (!existingAdmin) {
    const adminHash = hashPassword('grovia-demo-2026');
    database
      .prepare('INSERT OR IGNORE INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
      .run('admin@grovia.io', 'Alex Rivera', 'admin', adminHash);
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
      person.av || '#cfe0c8',
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

  const DbConstructor = getDatabaseConstructor();
  const database = new DbConstructor(targetPath, { create: true });
  configurePragmas(database);
  initSchema(database);

  globalThis.__grovia_db__ = database;
  globalThis.__grovia_db_path__ = targetPath;
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
    av: row.av || '#cfe0c8',
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
  const av = AVATAR_BG_COLORS[nameHash % AVATAR_BG_COLORS.length] || '#cfe0c8';
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
