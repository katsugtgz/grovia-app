import { db, seedDatabase } from '../lib/db';

console.log('[Seed] Initializing database schema and seeding demo records...');
seedDatabase(db);

const waitlistCount = db.query('SELECT COUNT(*) as count FROM waitlist').get() as { count: number };
const inquiriesCount = db.query('SELECT COUNT(*) as count FROM inquiries').get() as { count: number };
const usersCount = db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };
const peopleCount = db.query('SELECT COUNT(*) as count FROM people').get() as { count: number };

console.log(
  `[Seed] Complete. Waitlist records: ${waitlistCount.count}, Inquiries records: ${inquiriesCount.count}, Users: ${usersCount.count}, People: ${peopleCount.count}`
);
