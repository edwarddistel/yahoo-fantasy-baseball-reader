import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, run } from '../src/cli.mjs';

const xml = (body) => `<?xml version="1.0"?><fantasy_content>${body}</fantasy_content>`;

test('CLI options, commands and invalid arguments', () => {
  assert.equal(parseArgs([]).command, 'fetch-all');
  assert.equal(parseArgs(['--config', './x.json', 'league-prefix']).configPath, './x.json');
  assert.equal(parseArgs(['--help']).command, 'help');
  assert.throws(() => parseArgs(['--output']), /requires a path/);
  assert.throws(() => parseArgs(['unknown']), /Unknown command/);
});

test('auth-url works without a secret or an existing config file', async () => {
  const output = [];
  await run(['auth-url', '--config', '/file/that/does/not/exist'], { env: { CONSUMER_KEY: 'test-id' }, stdout: (s) => output.push(s) });
  assert.match(output[0], /client_id=test-id/);
});

test('end-to-end mocked CLI writes expected data without live credentials or requests', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'yfbb-cli-test-'));
  try {
    const configFile = path.join(folder, 'config.json');
    const credentialsFile = path.join(folder, 'credentials.json');
    const outputFile = path.join(folder, 'out.json');
    await writeFile(configFile, JSON.stringify({
      CONSUMER_KEY: 'FAKE_CLIENT', CONSUMER_SECRET: 'FAKE_SECRET',
      LEAGUE_KEY: '469.l.44', TEAM: '2', AUTH_FILE: './credentials.json',
      FREE_AGENTS: 0,
    }));
    await writeFile(credentialsFile, JSON.stringify({ access_token: 'FAKE_ACCESS_TOKEN', refresh_token: 'FAKE_REFRESH_TOKEN' }));
    let apiCalls = 0;
    const fetchImpl = async (url, options) => {
      apiCalls += 1;
      assert.equal(options.headers.Authorization, 'Bearer FAKE_ACCESS_TOKEN');
      const resource = new URL(url).pathname.replace('/fantasy/v2', '');
      let body;
      if (resource === '/users;use_login=1/games') body = '<users><user><games/></user></users>';
      else if (resource.endsWith('/metadata')) body = '<league><current_week>9</current_week></league>';
      else if (resource.includes('status=FA')) body = '<league><players><player><player_key>469.p.1</player_key></player></players></league>';
      else if (resource.endsWith('/roster/')) body = '<team><roster><players><player><player_key>469.p.2</player_key></player></players></roster></team>';
      else if (resource.endsWith('/roster/players')) body = '<team><roster><players><player><player_key>469.p.2</player_key></player></players></roster></team>';
      else if (resource.includes('player_keys=')) body = '<players><player><player_key>469.p.2</player_key></player></players>';
      else if (resource.includes('scoreboard;week=')) body = '<league><scoreboard><matchups><matchup><week>9</week></matchup></matchups></scoreboard></league>';
      else if (resource.endsWith('/stat_categories')) body = '<game><stat_categories><stats/></stat_categories></game>';
      else if (resource.includes('transactions;types=')) body = '<league><transactions count="0"/></league>';
      else throw new Error(`Unexpected API resource ${resource}`);
      return new Response(xml(body), { status: 200, headers: { 'content-type': 'application/xml' } });
    };
    const messages = [];
    await run(['fetch-all', '--config', configFile, '--output', outputFile], {
      env: {}, fetchImpl, stdout: (s) => messages.push(s), now: () => new Date('2026-11-20T16:00:00.000Z'),
    });
    const result = JSON.parse(await readFile(outputFile, 'utf8'));
    assert.equal(result.meta.week, 9);
    assert.equal(result.meta.fetchedAt, '2026-11-20T16:00:00.000Z');
    assert.equal(result['free agents'][0].player_key, '469.p.1');
    assert.equal(result['my players'][0].player_key, '469.p.2');
    assert.equal(result['my scoreboard'][0].week, 9);
    assert.ok(apiCalls >= 9);
    assert.match(messages[0], /Saved Yahoo Fantasy data/);
    if (process.platform !== 'win32') assert.equal((await stat(outputFile)).mode & 0o777, 0o600);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
