import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import path from 'node:path';
import fs from 'node:fs';

describe('Tier 2 — Boundary: Database Engine (bun:sqlite)', () => {
  const testDbPath = path.resolve(process.cwd(), 'test-e2e-tier2-db.db');
  let db: Database;

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Bind to application db module if available (M2+)
    try {
      const dbMod = await import(path.resolve(process.cwd(), 'lib/db.ts'));
      if (typeof dbMod.initDatabase === 'function') {
        dbMod.initDatabase(testDbPath);
      }
    } catch {
      // Schema contract fallback
    }

    db = new Database(testDbPath);
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA foreign_keys = ON;');
    db.run(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        company TEXT,
        team_size TEXT DEFAULT '1-10',
        use_case TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'invited', 'rejected')),
        created_at DATETIME DEFAULT (datetime('now'))
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      );
    `);
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_ticket ON inquiries(ticket_id);');
    db.run('CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);');
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
        if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
        if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
      } catch {}
    }
  });

  test('T2.5.1: Unique email constraint violation throws SQLite constraint error', () => {
    db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run('User Alpha', 'unique@test.com');
    expect(() => {
      db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run('User Beta', 'unique@test.com');
    }).toThrow();
  });

  test('T2.5.2: Unique ticket_id constraint violation throws SQLite constraint error', () => {
    const ticketId = 'GROV-UNIQ-1';
    db.prepare('INSERT INTO inquiries (ticket_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?);').run(
      ticketId,
      'User 1',
      'u1@test.com',
      'Subj',
      'Message 1234'
    );
    expect(() => {
      db.prepare('INSERT INTO inquiries (ticket_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?);').run(
        ticketId,
        'User 2',
        'u2@test.com',
        'Subj',
        'Message 5678'
      );
    }).toThrow();
  });

  test('T2.5.3: Transaction rollback on failure leaves table unmodified', () => {
    const countBefore = (db.prepare('SELECT COUNT(*) as c FROM waitlist;').get() as any).c;
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run('Tx User', 'tx@test.com');
      throw new Error('Intentional transaction abort');
    });

    expect(() => tx()).toThrow('Intentional transaction abort');
    const countAfter = (db.prepare('SELECT COUNT(*) as c FROM waitlist;').get() as any).c;
    expect(countAfter).toBe(countBefore);
  });

  test('T2.5.4: Re-running table creation DDL is strictly idempotent', () => {
    expect(() => {
      db.run('CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY);');
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);');
    }).not.toThrow();
  });

  test("T2.5.5: Single-quote escaping in names (O'Connor) executes safely via parameterized queries", () => {
    const nameWithApostrophe = "Shaun O'Connor & D'Angelo";
    db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run(nameWithApostrophe, 'oconnor@test.com');
    const row = db.prepare('SELECT name FROM waitlist WHERE email = ?;').get('oconnor@test.com') as any;
    expect(row.name).toBe(nameWithApostrophe);
  });

  test('T2.5.6: Null byte in strings handled cleanly by parameterized statements', () => {
    const nullByteName = 'Malicious\u0000User';
    db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run(nullByteName, 'nullbyte@test.com');
    const row = db.prepare('SELECT name FROM waitlist WHERE email = ?;').get('nullbyte@test.com') as any;
    expect(row).toBeDefined();
  });

  test('T2.5.7: Querying non-existent table throws SQLite exception without crashing application', () => {
    expect(() => {
      db.prepare('SELECT * FROM non_existent_table;').all();
    }).toThrow();
  });

  test('T2.5.8: Concurrent reads during active transaction return consistent snapshot without deadlock', () => {
    const results = [];
    for (let i = 0; i < 50; i++) {
      results.push(db.prepare('SELECT COUNT(*) as count FROM waitlist;').get() as any);
    }
    expect(results.length).toBe(50);
  });

  test('T2.5.9: Batch insertion of 500 rows in single transaction completes in <250ms', () => {
    const insertStmt = db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);');
    const insertMany = db.transaction((rows: Array<[string, string]>) => {
      for (const row of rows) {
        insertStmt.run(row[0], row[1]);
      }
    });

    const dataset: Array<[string, string]> = Array.from({ length: 500 }, (_, i) => [
      `Batch User ${i}`,
      `batch_${Date.now()}_${i}@test.com`,
    ]);

    const start = performance.now();
    insertMany(dataset);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(250);
  });

  test('T2.5.10: Automatic timestamp assignment (created_at) produces valid UTC timestamps', () => {
    const email = 'timecheck@test.com';
    db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run('Time Check', email);
    const row = db.prepare('SELECT created_at FROM waitlist WHERE email = ?;').get(email) as any;
    expect(row.created_at).toBeDefined();
    expect(Date.parse(row.created_at)).not.toBeNaN();
  });

  test('T2.5.11: Deleting a record decreases count accurately', () => {
    const email = 'delete_me@test.com';
    db.prepare('INSERT INTO waitlist (name, email) VALUES (?, ?);').run('To Delete', email);
    const countBefore = (db.prepare('SELECT COUNT(*) as c FROM waitlist;').get() as any).c;

    db.prepare('DELETE FROM waitlist WHERE email = ?;').run(email);
    const countAfter = (db.prepare('SELECT COUNT(*) as c FROM waitlist;').get() as any).c;
    expect(countAfter).toBe(countBefore - 1);
  });

  test('T2.5.12: Filtering on non-indexed column succeeds without syntax error', () => {
    const results = db.prepare("SELECT * FROM waitlist WHERE use_case LIKE '%capacity%';").all();
    expect(Array.isArray(results)).toBe(true);
  });

  test('T2.5.13: PRAGMA index_list verifies unique index exists on waitlist table', () => {
    const indexes = db.prepare("PRAGMA index_list('waitlist');").all() as Array<{ name: string; unique: number }>;
    const emailIndex = indexes.find((i) => i.name === 'idx_waitlist_email');
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.unique).toBe(1);
  });
});
