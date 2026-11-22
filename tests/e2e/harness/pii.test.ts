import { expect, test } from 'bun:test';
import { assertNoSeedPeoplePii } from './pii';

const seededRate = 38;

test.each([
  `{rate:${seededRate}}`,
  `{"rate": ${seededRate}}`,
  `{'rate' : ${seededRate}}`,
  String.raw`{\"rate\": ${seededRate}}`,
])('flags an exact seeded rate field in %s', (fixture) => {
  expect(() => assertNoSeedPeoplePii(fixture)).toThrow();
});

test.each([
  `{prorate:${seededRate}}`,
  `{"hourly-rate":${seededRate}}`,
  `{"rate_limit":${seededRate}}`,
  `{"rate":${seededRate}0}`,
  `{rate:${seededRate}.5}`,
  `{rate:${seededRate}e1}`,
  `{rate:${seededRate}n}`,
  `{rate:8}`,
])('ignores other keys or values in %s', (fixture) => {
  expect(() => assertNoSeedPeoplePii(fixture)).not.toThrow();
});
