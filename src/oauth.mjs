import { readFile } from 'node:fs/promises';
import { atomicWriteJson } from './storage.mjs';
import { YahooAuthError } from './errors.mjs';

export const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
export const YAHOO_AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';

export function authorizationUrl({ CONSUMER_KEY, YAHOO_REDIRECT_URI = 'oob' }) {
  const url = new URL(YAHOO_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: CONSUMER_KEY,
    redirect_uri: YAHOO_REDIRECT_URI,
    response_type: 'code',
    language: 'en-us',
  }).toString();
  return url.toString();
}

/** OAuth credentials are saved 0600; simultaneous 401 responses share one refresh. */
export class YahooOAuth {
  #config;
  #fetch;
  #now;
  #tokens = null;
  #refreshPromise = null;

  constructor(config, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    this.#config = config;
    this.#fetch = fetchImpl;
    this.#now = now;
  }

  get credentialFile() { return this.#config.AUTH_FILE; }

  async initialize() {
    if (this.#tokens) return;
    let tokens;
    try {
      tokens = JSON.parse(await readFile(this.credentialFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new YahooAuthError(`Cannot load OAuth credentials from ${this.credentialFile}: invalid or unreadable JSON.`);
      }
    }
    if (tokens) {
      if (!tokens.access_token && !tokens.refresh_token) {
        throw new YahooAuthError('Credentials file does not contain an access_token or refresh_token.');
      }
      this.#tokens = tokens;
    } else {
      if (!this.#config.YAHOO_AUTH_CODE) {
        throw new YahooAuthError('No saved OAuth credentials. Authorize your Yahoo account and set YAHOO_AUTH_CODE for the first run (see README).');
      }
      const newTokens = await this.#tokenRequest(new URLSearchParams({
        grant_type: 'authorization_code',
        code: this.#config.YAHOO_AUTH_CODE,
        redirect_uri: this.#config.YAHOO_REDIRECT_URI,
      }));
      await this.#saveTokens(newTokens);
    }
  }

  async getAccessToken() {
    await this.initialize();
    // Existing legacy files have no expires_at: Yahoo will tell us via HTTP 401.
    if (!this.#tokens.access_token || (Number.isFinite(this.#tokens.expires_at) && this.#now() >= this.#tokens.expires_at - 60_000)) {
      await this.refresh();
    }
    return this.#tokens.access_token;
  }

  /** Avoid duplicate refreshes even if several requests fail with the same token. */
  async refresh(staleAccessToken) {
    if (staleAccessToken && this.#tokens?.access_token !== staleAccessToken) return;
    if (!this.#refreshPromise) {
      this.#refreshPromise = this.#performRefresh().finally(() => { this.#refreshPromise = null; });
    }
    return this.#refreshPromise;
  }

  async #performRefresh() {
    if (!this.#tokens?.refresh_token) throw new YahooAuthError('OAuth refresh token is missing; re-authorize your Yahoo account.');
    const newTokens = await this.#tokenRequest(new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: this.#tokens.refresh_token,
      redirect_uri: this.#config.YAHOO_REDIRECT_URI,
    }));
    await this.#saveTokens({ ...newTokens, refresh_token: newTokens.refresh_token || this.#tokens.refresh_token });
  }

  async #tokenRequest(body) {
    const basicAuth = Buffer.from(`${this.#config.CONSUMER_KEY}:${this.#config.CONSUMER_SECRET}`, 'utf8').toString('base64');
    let response;
    try {
      response = await this.#fetch(YAHOO_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new YahooAuthError(`Yahoo OAuth request failed (${error.name === 'TimeoutError' ? 'timeout' : 'network error'}).`);
    }
    let data;
    try { data = await response.json(); } catch { throw new YahooAuthError(`Yahoo OAuth returned invalid JSON (HTTP ${response.status}).`, { status: response.status }); }
    if (!response.ok) {
      // Deliberately do not print provider response bodies, bearer tokens, or client secrets.
      const reason = typeof data.error === 'string' ? `: ${data.error.replace(/[^\w-]/g, '').slice(0, 40)}` : '';
      throw new YahooAuthError(`Yahoo OAuth rejected request (HTTP ${response.status})${reason}.`, { status: response.status });
    }
    if (typeof data.access_token !== 'string' || !data.access_token) {
      throw new YahooAuthError('Yahoo OAuth response did not contain an access token.');
    }
    return data;
  }

  async #saveTokens(tokens) {
    const expires = Number(tokens.expires_in);
    const normalized = {
      ...tokens,
      ...(Number.isFinite(expires) && expires > 0 ? { expires_at: this.#now() + expires * 1000 } : {}),
    };
    await atomicWriteJson(this.credentialFile, normalized, { mode: 0o600 });
    this.#tokens = normalized;
  }
}
