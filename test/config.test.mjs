import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.mjs';

const valid = {
  CONSUMER_KEY: 'client', CONSUMER_SECRET: 'secret',
  LEAGUE_KEY: '469.l.123456', TEAM: '1', FREE_AGENTS: 3,
};

test('merges env over file, resolves AUTH_FILE relative to config', () => {
  const config = normalizeConfig(valid, { env: { TEAM: '2' }, configPath: '/example/reader/config.json' });
  assert.equal(config.TEAM, 2);
  assert.equal(config.AUTH_FILE, '/example/reader/credentials.json');
  assert.equal(config.FREE_AGENTS, 3);
  assert.equal(config.FREE_AGENT_PAGE_SIZE, 25);
  assert.equal(config.YAHOO_REDIRECT_URI, 'oob');
});

test('rejects missing and malformed settings', () => {
  assert.throws(() => normalizeConfig({}, { env: {} }), /CONSUMER_KEY/);
  assert.throws(() => normalizeConfig({ ...valid, FREE_AGENTS: '1garbage' }, { env: {} }), /FREE_AGENTS/);
  assert.throws(() => normalizeConfig({ ...valid, LEAGUE_KEY: '../invalid' }, { env: {} }), /LEAGUE_KEY/);
  assert.throws(() => normalizeConfig({ ...valid, TEAM: '1.5' }, { env: {} }), /TEAM/);
  assert.throws(() => normalizeConfig({ ...valid, FREE_AGENT_PAGE_SIZE: 26 }, { env: {} }), /FREE_AGENT_PAGE_SIZE/);
});

test('auth-url and league-prefix require only their necessary config values', () => {
  assert.equal(normalizeConfig({ CONSUMER_KEY: 'id' }, { env: {}, command: 'auth-url' }).CONSUMER_KEY, 'id');
  assert.equal(normalizeConfig({ CONSUMER_KEY: 'id', CONSUMER_SECRET: 'secret' }, { env: {}, command: 'league-prefix' }).TEAM, undefined);
});
