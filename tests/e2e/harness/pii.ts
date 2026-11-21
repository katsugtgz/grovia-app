import { expect } from 'bun:test';
import { SEED_PEOPLE } from '@/lib/seed-people';

const sensitiveMarkers = new Set([
  ...SEED_PEOPLE.flatMap(({ name, email, phone, bday }) =>
    [name, email, phone, bday].filter((marker): marker is string => Boolean(marker))
  ),
  // Synthetic markers from legacy waitlist, inquiry, and payroll fixtures.
  'alex@innovate.io',
  'elena@quantum.tech',
  'marcus@hypergrowth.co',
  'sarah@vertex.io',
  'liam@finscale.org',
  'chloe@nexus.co',
  '$4,850',
  'Payslip-09',
  'Contract.pdf',
]);

const seededRates = [...new Set(SEED_PEOPLE.map(({ rate }) => rate))]
  .filter((rate): rate is number => rate !== undefined)
  .map((rate) => String(rate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

// Match an entire object key (plain, quoted, or escaped) and numeric literal.
const seededRateField = seededRates.length > 0
  ? new RegExp(String.raw`(?:^|[,{])\s*(?:(\\*["'])rate\1|rate)\s*:\s*(?:${seededRates.join('|')})(?![\w$.])`)
  : null;

export function assertNoSeedPeoplePii(content: string): void {
  for (const marker of sensitiveMarkers) {
    expect(content).not.toContain(marker);
  }
  if (seededRateField) {
    expect(content).not.toMatch(seededRateField);
  }
}
