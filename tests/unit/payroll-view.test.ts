import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PayrollView } from '@/components/views/PayrollView';
import { SEED_PEOPLE } from '@/lib/seed-people';

const first = SEED_PEOPLE[0];
const second = SEED_PEOPLE[1];
const excluded = SEED_PEOPLE[4];
const invite = { ...first, id: 'new-invite', name: 'New Invite' };

function renderPayroll(people: typeof first[]) {
  return renderToStaticMarkup(createElement(PayrollView, { active: true, people }));
}

test('keeps the demo payroll roster and hours stable when People is reordered or prepended', () => {
  const baseline = renderPayroll([first, second, ...SEED_PEOPLE.slice(2)]);
  const updated = renderPayroll([invite, ...SEED_PEOPLE.slice(1).reverse(), first]);
  expect(updated).toBe(baseline);
  expect(updated).toContain('id="pay-hours">144.0<');
  expect(updated).not.toContain(excluded.name);
});

test('shows available demo payroll people and preserves their original hours', () => {
  const html = renderPayroll([second]);
  expect(html).toContain(second.name);
  expect(html).toContain('aria-selected="true"');
  expect(html).toContain('id="pay-hours">163.5<');
});

test('falls back to an available employee without demo roster members', () => {
  const html = renderPayroll([invite]);
  expect(html).toContain(invite.name);
  expect(html).toContain('aria-selected="true"');
  expect(renderPayroll([])).toContain('No roster data available for your role.');
});
