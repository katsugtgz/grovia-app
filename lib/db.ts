import type { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

// Fallback in-memory stores for non-Bun runtimes (e.g., Next.js build or Netlify Node serverless)
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

const dummyWaitlistStore: DummyWaitlistRow[] = [
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

const dummyInquiriesStore: DummyInquiryRow[] = [
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

let nextDummyWaitlistId = dummyWaitlistStore.length + 1;
let nextDummyInquiryId = dummyInquiriesStore.length + 1;

// Dynamically resolve Bun's native Database class to support Next.js build evaluation
let SqliteDatabase: typeof Database;
function getDatabaseConstructor(): typeof Database {
  if (!SqliteDatabase) {
    if (typeof Bun !== 'undefined') {
      SqliteDatabase = req('bun:sqlite').Database;
    } else {
      SqliteDatabase = class DummyDatabase {
        run() {
          return { changes: 0, lastInsertRowid: 0 };
        }
        query(sql: string) {
          const normalized = sql.trim().toUpperCase();
          return {
            get: () => {
              if (normalized.includes('SELECT 1 AS ALIVE')) {
                return { alive: 1 };
              }
              if (normalized.includes('COUNT(*)') && normalized.includes('WAITLIST')) {
                return { count: dummyWaitlistStore.length };
              }
              return null;
            },
            all: () => [],
          };
        }
        prepare(sql: string) {
          const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
          return {
            run: (...params: unknown[]) => {
              const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
              if (normalized.startsWith('INSERT') && normalized.includes('INTO WAITLIST')) {
                const email = String(params[1] ?? '').trim().toLowerCase();
                const exists = dummyWaitlistStore.some((r) => r.email.toLowerCase() === email);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0 };
                  throw new Error('UNIQUE constraint failed: waitlist.email');
                }
                const id = nextDummyWaitlistId++;
                dummyWaitlistStore.push({
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
                const exists = dummyInquiriesStore.some((r) => r.ticket_id === ticketId);
                if (exists) {
                  if (normalized.includes('OR IGNORE')) return { changes: 0 };
                  throw new Error('UNIQUE constraint failed: inquiries.ticket_id');
                }
                const id = nextDummyInquiryId++;
                dummyInquiriesStore.push({
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

              if (normalized.startsWith('UPDATE INQUIRIES')) {
                const [status, priority, targetId] = params;
                const row = dummyInquiriesStore.find((r) => r.id === Number(targetId));
                if (!row) return { changes: 0 };
                row.status = String(status);
                row.priority = String(priority);
                row.updated_at = now;
                return { changes: 1 };
              }

              return { changes: 0 };
            },
            get: (...params: unknown[]) => {
              if (normalized.includes('FROM WAITLIST') && normalized.includes('LOWER(EMAIL) = ?')) {
                const targetEmail = String(params[0] ?? '').toLowerCase();
                const found = dummyWaitlistStore.find((r) => r.email.toLowerCase() === targetEmail);
                return found ? { id: found.id } : null;
              }
              if (normalized.includes('FROM INQUIRIES')) {
                if (normalized.includes('WHERE TICKET_ID = ? OR CAST(ID AS TEXT) = ?')) {
                  const a = String(params[0] ?? '');
                  const b = String(params[1] ?? '');
                  return dummyInquiriesStore.find((r) => r.ticket_id === a || String(r.id) === b) || null;
                }
                if (normalized.includes('WHERE TICKET_ID = ?')) {
                  const ticketId = String(params[0] ?? '');
                  return dummyInquiriesStore.find((r) => r.ticket_id === ticketId) || null;
                }
                if (normalized.includes('WHERE ID = ?')) {
                  const idNum = Number(params[0]);
                  const found = dummyInquiriesStore.find((r) => r.id === idNum);
                  return found ? { ...found, updatedAt: found.updated_at } : null;
                }
              }
              return null;
            },
            all: (...params: unknown[]) => {
              if (normalized.includes('FROM WAITLIST')) {
                const limit = typeof params[0] === 'number' ? params[0] : 50;
                return dummyWaitlistStore.slice(0, limit).map((r) => ({ ...r }));
              }
              if (normalized.includes('FROM INQUIRIES')) {
                const statusFilter = params.length > 0 && params[0] ? String(params[0]) : undefined;
                const rows = statusFilter
                  ? dummyInquiriesStore.filter((r) => r.status === statusFilter)
                  : dummyInquiriesStore;
                return [...rows].sort((a, b) => b.id - a.id).map((r) => ({ ...r }));
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

declare global {
  // eslint-disable-next-line no-var
  var __grovia_db__: Database | undefined;
  // eslint-disable-next-line no-var
  var __grovia_db_path__: string | undefined;
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
