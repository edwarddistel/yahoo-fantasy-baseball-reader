import test from 'node:test';
import assert from 'node:assert/strict';
import { YahooFantasyApi, RequestLimiter } from '../src/http.mjs';

const xml = '<fantasy_content><game><game_id>469</game_id></game></fantasy_content>';

test('GET sends Bearer, receives XML', async () => {
  const api = new YahooFantasyApi({ getAccessToken: async () => 'FAKE_TOKEN' }, {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fantasysports.yahooapis.com/fantasy/v2/game/mlb');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer FAKE_TOKEN');
      return new Response(xml);
    },
  });
  assert.equal((await api.get('/game/mlb')).fantasy_content.game.game_id, 469);
  await assert.rejects(api.get('https://example.com'), /relative/);
});

test('401 refreshes once and retries with a different bearer', async () => {
  let token = 'OLD'; let refreshCount = 0; let calls = 0;
  const oauth = {
    getAccessToken: async () => token,
    refresh: async (old) => { assert.equal(old, 'OLD'); token = 'NEW'; refreshCount += 1; },
  };
  const api = new YahooFantasyApi(oauth, { fetchImpl: async (_, req) => {
    calls += 1;
    if (req.headers.Authorization === 'Bearer OLD') return new Response('unauthorized', { status: 401 });
    return new Response(xml);
  } });
  assert.equal((await api.get('/game/mlb')).fantasy_content.game.game_id, 469);
  assert.equal(calls, 2);
  assert.equal(refreshCount, 1);
});

test('429 retries with Retry-After and does not reveal provider response body', async () => {
  let calls = 0; const delays = [];
  const api = new YahooFantasyApi({ getAccessToken: async () => 'TOKEN' }, {
    delay: async (n) => delays.push(n),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? new Response('SENSITIVE_BODY', { status: 429, headers: { 'retry-after': '1' } }) : new Response(xml);
    },
  });
  await api.get('/game/mlb');
  assert.deepEqual(delays, [1000]);
});

test('fatal errors show status and resource but not response contents', async () => {
  const api = new YahooFantasyApi({ getAccessToken: async () => 'TOKEN' }, { fetchImpl: async () => new Response('SECRET_TOKEN_NOT_FOR_LOGS', { status: 403 }) });
  await assert.rejects(api.get('/game/mlb'), (err) => {
    assert.match(err.message, /HTTP 403/);
    assert.doesNotMatch(err.message, /SECRET_TOKEN_NOT_FOR_LOGS/);
    return true;
  });
});

test('request limiter bounds concurrency without dropping requests', async () => {
  const limiter = new RequestLimiter(2);
  let current = 0; let max = 0;
  const outputs = await Promise.all(Array.from({ length: 12 }, (_, id) => limiter.run(async () => {
    current += 1; max = Math.max(max, current);
    await new Promise((resolve) => setTimeout(resolve, 2));
    current -= 1;
    return id;
  })));
  assert.deepEqual(outputs, Array.from({ length: 12 }, (_, i) => i));
  assert.equal(max, 2);
});
