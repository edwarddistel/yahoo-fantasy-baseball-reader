import test from 'node:test';
import assert from 'node:assert/strict';
import { YahooFantasyBaseballReader } from '../src/reader.mjs';
import { fantasyPaths } from '../src/paths.mjs';
const config = { LEAGUE_KEY: '469.l.99', TEAM: 4, FREE_AGENTS: 1, FREE_AGENT_PAGE_SIZE: 2 };

const rosterPlayers = Array.from({ length: 27 }, (_, n) => ({ player_key: `469.p.${n + 1}` }));

test('paths use dynamic game prefix and reject malformed player keys', () => {
  const paths = fantasyPaths(config);
  assert.equal(paths.statCategories, '/game/469/stat_categories');
  assert.equal(paths.roster, '/team/469.l.99.t.4/roster/');
  assert.throws(() => paths.playerStats(['evil/../thing']), /Invalid player key/);
});

test('fetch-all preserves the original output schema and avoids duplicate roster fetches', async () => {
  const seen = [];
  const fakeApi = { get: async (resource) => {
    seen.push(resource);
    if (resource === '/users;use_login=1/games') return { fantasy_content: { users: { user: { games: {} } } } };
    if (resource.endsWith('/metadata')) return { fantasy_content: { league: { current_week: 12 } } };
    if (resource.includes('status=FA')) return { fantasy_content: { league: { players: { player: { player_key: resource.includes('start=0') ? 'a' : 'b' } } } } };
    if (resource.endsWith('/roster/')) return { fantasy_content: { team: { roster: { players: { player: rosterPlayers } } } } };
    if (resource.endsWith('/roster/players')) return { fantasy_content: { team: { roster: { players: { player: rosterPlayers } } } } };
    if (resource.includes('scoreboard;week=')) return { fantasy_content: { league: { scoreboard: { matchups: { matchup: { week: 12 } } } } } };
    if (resource.endsWith('/stat_categories')) return { fantasy_content: { game: { stat_categories: { stats: { stat: [] } } } } };
    if (resource.includes('transactions;types=')) return { fantasy_content: { league: { transactions: { count: 0 } } } };
    if (resource.includes('player_keys=')) return { fantasy_content: { players: { player: [ { player_key: 'dummy' } ] } } };
    throw new Error(`Unhandled fake route: ${resource}`);
  } };
  const reader = new YahooFantasyBaseballReader(config, fakeApi, { now: () => new Date('2026-11-20T12:00:00Z') });
  const result = await reader.fetchAllData();
  assert.deepEqual(Object.keys(result), ['meta', 'free agents', 'my players', "my players' stats", 'my scoreboard', 'stat IDs', 'current roster', 'transactions']);
  assert.equal(result.meta.week, 12);
  assert.equal(result.meta.fetchedAt, '2026-11-20T12:00:00.000Z');
  assert.equal(result['free agents'].length, 2);
  assert.equal(result['my players'].length, 27);
  assert.equal(seen.filter((x) => x.endsWith('/roster/')).length, 1);
  const playerBatches = seen.filter((x) => x.includes('player_keys='));
  assert.equal(playerBatches.length, 2);
  assert.equal(playerBatches[0].split(';player_keys=')[1].split(';')[0].split(',').length, 25);
  assert.equal(result["my players' stats"].fantasy_content.players.player.length, 2);
  assert.ok(seen.includes('/league/469.l.99/players;status=FA;start=0;count=2;sort=OR'));
  assert.ok(seen.includes('/league/469.l.99/players;status=FA;start=2;count=2;sort=OR'));
});

test('missing current-week metadata fails early rather than querying week=null', async () => {
  const reader = new YahooFantasyBaseballReader(config, { get: async () => ({ fantasy_content: { league: {} } }) });
  await assert.rejects(reader.getCurrentWeek(), /current_week/);
});
