import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYahooXml, toArray } from '../src/xml.mjs';

test('parses Yahoo-style XML, retaining attributes and singleton collections', () => {
  const data = parseYahooXml('<?xml version="1.0"?><fantasy_content><league><current_week>17</current_week><players count="1"><player><player_key>469.p.123</player_key></player></players></league></fantasy_content>');
  assert.equal(data.fantasy_content.league.current_week, 17);
  assert.equal(data.fantasy_content.league.players['@_count'], '1');
  assert.equal(toArray(data.fantasy_content.league.players.player)[0].player_key, '469.p.123');
});

test('rejects empty and malformed XML safely', () => {
  assert.throws(() => parseYahooXml(''), /Empty XML/);
  assert.throws(() => parseYahooXml('<fantasy_content><league></fantasy_content>'), /Malformed XML/);
  assert.throws(() => parseYahooXml('<error><description>Unauthorized</description></error>'), /API error/);
});

test('toArray preserves empty and repeated resources', () => {
  assert.deepEqual(toArray(null), []);
  assert.deepEqual(toArray({ id: 1 }), [{ id: 1 }]);
  assert.deepEqual(toArray([1, 2]), [1, 2]);
});
