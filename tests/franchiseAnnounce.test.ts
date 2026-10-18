import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleOf, hashtagOf } from '../src/lib/franchise/announce.ts';

test('a franchise handle is its name run together, shortened the way teams do', () => {
  assert.equal(handleOf('Taco Tuesday Titans'), '@TacoTitans');
  assert.equal(handleOf('Punt Intended'), '@PuntIntended');
  assert.equal(handleOf("Grandma's Two-Point Conversion"), '@GTPConversion');
  assert.equal(handleOf('Fourth & Forever'), '@FourthForever');
});

test('a hashtag is the fan base: the last word, or the initials when it is short', () => {
  assert.equal(hashtagOf('Taco Tuesday Titans'), '#TitansNation');
  assert.equal(hashtagOf('Bye Week Bandits'), '#BanditsNation');
  assert.equal(hashtagOf('Couch Potato Cartel'), '#CartelNation');
  assert.equal(hashtagOf('Ctrl Alt Defeat'), '#DefeatNation');
  assert.equal(hashtagOf('The Big Red'), '#TBRNation');
});
