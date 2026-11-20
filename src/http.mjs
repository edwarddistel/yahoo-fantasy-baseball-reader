import { parseYahooXml } from './xml.mjs';
import { YahooApiError } from './errors.mjs';

export const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bounds concurrent calls, including paginated requests, to avoid flooding Yahoo. */
export class RequestLimiter {
  #active = 0;
  #pending = [];
  constructor(maxConcurrent = 3) { this.maxConcurrent = maxConcurrent; }
  async run(task) {
    if (this.#active >= this.maxConcurrent) await new Promise((resolve) => this.#pending.push(resolve));
    this.#active += 1;
    try { return await task(); }
    finally {
      this.#active -= 1;
      this.#pending.shift()?.();
    }
  }
}

export class YahooFantasyApi {
  #oauth;
  #fetch;
  #delay;
  #limiter;
  constructor(oauth, { fetchImpl = globalThis.fetch, delay = sleep, maxConcurrent = 3 } = {}) {
    this.#oauth = oauth;
    this.#fetch = fetchImpl;
    this.#delay = delay;
    this.#limiter = new RequestLimiter(maxConcurrent);
  }

  async get(resource) {
    if (typeof resource !== 'string' || !resource.startsWith('/') || resource.startsWith('//')) {
      throw new YahooApiError('Only relative Yahoo Fantasy API paths are supported.');
    }
    return this.#limiter.run(() => this.#request(resource));
  }

  async #request(resource) {
    const url = `${YAHOO_API_BASE}${resource}`;
    let refreshed = false;
    for (let retry = 0; retry <= 3; retry += 1) {
      const token = await this.#oauth.getAccessToken();
      let response;
      try {
        response = await this.#fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' },
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (retry < 3) { await this.#delay(250 * 2 ** retry); continue; }
        throw new YahooApiError(`Network failure reading Yahoo resource ${resource} (${error.name === 'TimeoutError' ? 'timeout' : 'connection error'}).`, { resource });
      }
      const body = await response.text();
      if (!response.ok && !refreshed && (response.status === 401 || /token_expired/i.test(body))) {
        refreshed = true;
        await this.#oauth.refresh(token);
        // Do not consume the rate-limit retry budget when refreshing a token.
        retry -= 1;
        continue;
      }
      if (RETRYABLE_STATUSES.has(response.status) && retry < 3) {
        const seconds = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10_000) : 250 * 2 ** retry;
        await this.#delay(wait);
        continue;
      }
      if (!response.ok) {
        throw new YahooApiError(`Yahoo Fantasy API returned HTTP ${response.status} for ${resource}. Check application approval, league access, and your OAuth scope.`, { status: response.status, resource });
      }
      return parseYahooXml(body, resource);
    }
    throw new YahooApiError(`Yahoo request failed after retries: ${resource}.`, { resource });
  }
}
