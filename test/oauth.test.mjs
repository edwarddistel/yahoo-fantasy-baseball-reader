import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { YahooOAuth, authorizationUrl } from '../src/oauth.mjs';

const tokenConfig = (file) => ({
  CONSUMER_KEY: 'example-client', CONSUMER_SECRET: 'example-secret',
  YAHOO_AUTH_CODE: 'one-time-code', YAHOO_REDIRECT_URI: 'https://example.org/oauth/callback', AUTH_FILE: file,
});

async function withDirectory(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'yfbb-auth-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('authorization URL uses the registered callback', () => {
  const url = new URL(authorizationUrl(tokenConfig('/tmp/unused')));
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.org/oauth/callback');
  assert.equal(url.searchParams.get('client_id'), 'example-client');
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('exchanges a code and writes a private credential file', async () => withDirectory(async (dir) => {
  let body;
  const oauth = new YahooOAuth(tokenConfig(path.join(dir, 'credentials.json')), {
    now: () => 1_700_000_000_000,
    fetchImpl: async (_, request) => {
      assert.match(request.headers.Authorization, /^Basic /);
      body = new URLSearchParams(request.body);
      return Response.json({ access_token: 'TEST_ACCESS', refresh_token: 'TEST_REFRESH', expires_in: 3600 });
    },
  });
  assert.equal(await oauth.getAccessToken(), 'TEST_ACCESS');
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('redirect_uri'), 'https://example.org/oauth/callback');
  const filename = path.join(dir, 'credentials.json');
  const stored = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(stored.refresh_token, 'TEST_REFRESH');
  assert.equal(stored.expires_at, 1_700_003_600_000);
  if (process.platform !== 'win32') assert.equal((await stat(filename)).mode & 0o777, 0o600);
}));

test('refresh is single-flight, preserves a missing rotated refresh token', async () => withDirectory(async (dir) => {
  const file = path.join(dir, 'credentials.json');
  await writeFile(file, JSON.stringify({ access_token: 'EXPIRED_ACCESS', refresh_token: 'ORIGINAL_REFRESH' }));
  let calls = 0;
  const oauth = new YahooOAuth(tokenConfig(file), {
    fetchImpl: async (_, options) => {
      calls += 1;
      assert.equal(options.body.get('refresh_token'), 'ORIGINAL_REFRESH');
      assert.equal(options.body.get('redirect_uri'), 'https://example.org/oauth/callback');
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Response.json({ access_token: 'NEW_ACCESS', expires_in: 3600 });
    },
  });
  await oauth.initialize();
  await Promise.all([oauth.refresh('EXPIRED_ACCESS'), oauth.refresh('EXPIRED_ACCESS'), oauth.refresh('EXPIRED_ACCESS')]);
  assert.equal(calls, 1);
  assert.equal(await oauth.getAccessToken(), 'NEW_ACCESS');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).refresh_token, 'ORIGINAL_REFRESH');
  await oauth.refresh('EXPIRED_ACCESS'); // A stale 401 from another request cannot rotate again.
  assert.equal(calls, 1);
}));

test('OAuth errors never echo sensitive provider responses', async () => withDirectory(async (dir) => {
  const oauth = new YahooOAuth(tokenConfig(path.join(dir, 'credentials.json')), {
    fetchImpl: async () => Response.json({ error: 'invalid_grant', error_description: 'secret: ONE_TIME_CODE_AND_SECRET' }, { status: 400 }),
  });
  await assert.rejects(oauth.initialize(), (err) => {
    assert.match(err.message, /HTTP 400/);
    assert.doesNotMatch(err.message, /ONE_TIME_CODE_AND_SECRET/);
    return true;
  });
}));
