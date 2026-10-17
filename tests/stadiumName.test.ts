import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultStadiumName } from '../src/lib/franchise/stadiumName.ts';

const TEAMS = ['Trash Pandas', 'The Elite Band Group', 'Mitch, Please! #$@$', "DQ'd ❌", '* All Mahomes *', 'Whatever floats your goat', 'Big D', '', 'Fight Milk FC', 'Lamar Lamerrier'];

test('every team gets a stadium name that reads like one, the same every time', () => {
  const names = TEAMS.map((t, i) => defaultStadiumName(`espn-1-u-${i}`, t));
  for (const [i, n] of names.entries()) {
    assert.equal(defaultStadiumName(`espn-1-u-${i}`, TEAMS[i]), n);
    assert.match(n, /^[\p{L}\p{N}][\p{L}\p{N} '&.-]*(Stadium|Field|Park|Bowl|Coliseum)$/u, n);
    assert.ok(n.length <= 40 && !/\s{2}|—|–/.test(n), n);
    assert.ok(!/^the /i.test(n), n);
  }
  assert.ok(new Set(names).size >= 8, 'teams differ');
});

test('a name built from the team reads cleanly', () => {
  const many = Array.from({ length: 200 }, (_, i) => defaultStadiumName(`id-${i}`, 'The Trash Pandas'));
  assert.ok(many.includes('Trash Pandas Stadium'));
  assert.ok(many.includes('Pandas Field'));
  assert.ok(many.some(n => !n.includes('Pandas')), 'sponsors too');
  // Names that wouldn't fit on a building always go to a sponsor.
  for (let i = 0; i < 50; i++) assert.ok(!defaultStadiumName(`id-${i}`, 'Whatever floats your goat').includes('goat'));
});
