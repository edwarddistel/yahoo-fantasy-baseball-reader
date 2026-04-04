#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_CONFIG_PATH = './config.json';
const DEFAULT_OUTPUT_PATH = './allMyData.json';
const AUTH_ENDPOINT = 'https://api.login.yahoo.com/oauth2/get_token';
const API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';
const USER_AGENT = 'yfbb-modern/1.0';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
  isArray: (name, jpath) => {
    return [
      'fantasy_content.league.players.player',
      'fantasy_content.team.roster.players.player',
      'fantasy_content.league.scoreboard.matchups.matchup',
      'fantasy_content.team.team_stats.stats.stat',
      'fantasy_content.game.stat_categories.stats.stat',
    ].includes(jpath);
  },
});

function parseArgs(argv) {
  const args = {
    command: 'fetch-all',
    configPath: DEFAULT_CONFIG_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
  };

  let commandSeen = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.command = 'help';
      continue;
    }

    if (arg === '--config') {
      if (i + 1 >= argv.length) {
        throw new Error('--config requires a value');
      }
      args.configPath = argv[++i];
      continue;
    }

    if (arg === '--output') {
      if (i + 1 >= argv.length) {
        throw new Error('--output requires a value');
      }
      args.outputPath = argv[++i];
      continue;
    }

    if (!arg.startsWith('--') && !commandSeen) {
      args.command = arg;
      commandSeen = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Yahoo Fantasy Baseball CLI

Usage:
  node yfbb.mjs fetch-all [--config ./config.json] [--output ./allMyData.json]
  node yfbb.mjs league-prefix [--config ./config.json]
  node yfbb.mjs help

Supported config keys (config.json or environment variables):
  CONSUMER_KEY
  CONSUMER_SECRET
  YAHOO_AUTH_CODE
  AUTH_FILE
  LEAGUE_KEY
  TEAM
  FREE_AGENTS
  FREE_AGENT_PAGE_SIZE
`);
}

function normalizeConfig(config, configPath) {
  const env = process.env;
  const merged = {
    ...config,
    CONSUMER_KEY: env.CONSUMER_KEY ?? config.CONSUMER_KEY,
    CONSUMER_SECRET: env.CONSUMER_SECRET ?? config.CONSUMER_SECRET,
    YAHOO_AUTH_CODE: env.YAHOO_AUTH_CODE ?? config.YAHOO_AUTH_CODE,
    AUTH_FILE: env.AUTH_FILE ?? config.AUTH_FILE,
    LEAGUE_KEY: env.LEAGUE_KEY ?? config.LEAGUE_KEY,
    TEAM: env.TEAM ?? config.TEAM,
    FREE_AGENTS: env.FREE_AGENTS ?? config.FREE_AGENTS ?? 0,
    FREE_AGENT_PAGE_SIZE: env.FREE_AGENT_PAGE_SIZE ?? config.FREE_AGENT_PAGE_SIZE ?? 25,
  };

  const configDir = path.dirname(path.resolve(configPath));
  merged.AUTH_FILE = path.resolve(configDir, merged.AUTH_FILE ?? './yahoo-oauth.json');

  const required = ['CONSUMER_KEY', 'CONSUMER_SECRET', 'AUTH_FILE', 'LEAGUE_KEY', 'TEAM'];
  const missing = required.filter((key) => !merged[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required config values: ${missing.join(', ')}`);
  }

  return merged;
}

async function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);

  let fileConfig = {};
  try {
    const raw = await fs.readFile(absolutePath, 'utf8');
    fileConfig = JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read config file ${absolutePath}: ${error.message}`);
    }
  }

  return normalizeConfig(fileConfig, absolutePath);
}

function toArray(value) {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

class YahooFantasyBaseballClient {
  #config;
  #credentials = null;
  #week = null;

  constructor(config) {
    this.#config = config;
  }

  get leagueKey() {
    return this.#config.LEAGUE_KEY;
  }

  get teamNumber() {
    return this.#config.TEAM;
  }

  get authFile() {
    return this.#config.AUTH_FILE;
  }

  get authHeader() {
    return Buffer.from(`${this.#config.CONSUMER_KEY}:${this.#config.CONSUMER_SECRET}`, 'utf8').toString('base64');
  }

  get apiBase() {
    return API_BASE;
  }

  get credentials() {
    return this.#credentials;
  }

  async initialize() {
    await this.#loadOrCreateCredentials();
  }

  async #loadOrCreateCredentials() {
    try {
      const raw = await fs.readFile(this.authFile, 'utf8');
      this.#credentials = JSON.parse(raw);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to read credentials file ${this.authFile}: ${error.message}`);
      }
    }

    if (!this.#config.YAHOO_AUTH_CODE) {
      throw new Error(
        `Credentials file not found at ${this.authFile} and no YAHOO_AUTH_CODE was provided for first-time authorization.`
      );
    }

    const tokenData = await this.#exchangeAuthorizationCode(this.#config.YAHOO_AUTH_CODE);
    await this.#saveCredentials(tokenData);
  }

  async #saveCredentials(tokenData) {
    this.#credentials = tokenData;
    await fs.writeFile(this.authFile, `${JSON.stringify(tokenData, null, 2)}\n`, 'utf8');
  }

  async #exchangeAuthorizationCode(code) {
    const body = new URLSearchParams({
      client_id: this.#config.CONSUMER_KEY,
      client_secret: this.#config.CONSUMER_SECRET,
      redirect_uri: 'oob',
      code,
      grant_type: 'authorization_code',
    });

    return this.#requestToken(body, 'initial authorization');
  }

  async #refreshAuthorizationToken() {
    if (!this.#credentials?.refresh_token) {
      throw new Error('Cannot refresh OAuth token: refresh_token is missing.');
    }

    const body = new URLSearchParams({
      redirect_uri: 'oob',
      grant_type: 'refresh_token',
      refresh_token: this.#credentials.refresh_token,
    });

    const tokenData = await this.#requestToken(body, 'token refresh');

    if (!tokenData.refresh_token && this.#credentials.refresh_token) {
      tokenData.refresh_token = this.#credentials.refresh_token;
    }

    await this.#saveCredentials(tokenData);
    return tokenData;
  }

  async #requestToken(body, context) {
    const response = await fetch(AUTH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body,
    });

    const text = await response.text();
    let payload;

    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Yahoo ${context} returned a non-JSON response: ${text}`);
    }

    if (!response.ok) {
      const description = payload.error_description || payload.error || response.statusText;
      throw new Error(`Yahoo ${context} failed (${response.status}): ${description}`);
    }

    if (!payload.access_token) {
      throw new Error(`Yahoo ${context} succeeded but no access_token was returned.`);
    }

    return payload;
  }

  #buildUrl(resourcePath) {
    if (resourcePath.startsWith('http://') || resourcePath.startsWith('https://')) {
      return resourcePath;
    }
    return `${this.apiBase}${resourcePath.startsWith('/') ? '' : '/'}${resourcePath}`;
  }

  async #fetchFantasyResource(resourcePath, { retryOnAuthFailure = true } = {}) {
    if (!this.#credentials?.access_token) {
      throw new Error('Client is not authenticated. Call initialize() first.');
    }

    const url = this.#buildUrl(resourcePath);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.#credentials.access_token}`,
        'User-Agent': USER_AGENT,
        Accept: 'application/xml',
      },
    });

    const responseText = await response.text();

    if (response.status === 401 && retryOnAuthFailure) {
      await this.#refreshAuthorizationToken();
      return this.#fetchFantasyResource(resourcePath, { retryOnAuthFailure: false });
    }

    if (!response.ok) {
      const tokenExpired = /token_expired/i.test(responseText);
      if (tokenExpired && retryOnAuthFailure) {
        await this.#refreshAuthorizationToken();
        return this.#fetchFantasyResource(resourcePath, { retryOnAuthFailure: false });
      }
      throw new Error(`Yahoo Fantasy API request failed (${response.status} ${response.statusText}) for ${url}: ${responseText}`);
    }

    return xmlParser.parse(responseText);
  }

  gameKeyPath() {
    return '/game/mlb';
  }

  teamRosterPath() {
    return `/team/${this.leagueKey}.t.${this.teamNumber}/roster/`;
  }

  teamRosterPlayersPath() {
    return `/team/${this.leagueKey}.t.${this.teamNumber}/roster/players`;
  }

  teamWeeklyStatsPath(week) {
    return `/team/${this.leagueKey}.t.${this.teamNumber}/stats;type=week;week=${week}`;
  }

  leagueScoreboardPath(week) {
    return `/league/${this.leagueKey}/scoreboard;week=${week}`;
  }

  leagueMetadataPath() {
    return `/league/${this.leagueKey}/metadata`;
  }

  leagueTransactionsPath() {
    return `/league/${this.leagueKey}/transactions;types=add,trade,drop`;
  }

  userGamesPath() {
    return '/users;use_login=1/games';
  }

  statsCategoriesPath() {
    return `/game/${this.leagueKey.slice(0, 3)}/stat_categories`;
  }

  freeAgentsPath(start = 0, count = this.#config.FREE_AGENT_PAGE_SIZE) {
    return `/league/${this.leagueKey}/players;status=FA;start=${start};count=${count};sort=OR`;
  }

  async getLeaguePrefix() {
    const results = await this.#fetchFantasyResource(this.gameKeyPath());
    return results?.fantasy_content?.game?.game_id ?? null;
  }

  async getUserInfo() {
    const results = await this.#fetchFantasyResource(this.userGamesPath());
    return results?.fantasy_content?.users?.user?.games ?? null;
  }

  async getCurrentWeek() {
    if (this.#week != null) {
      return this.#week;
    }
    const results = await this.#fetchFantasyResource(this.leagueMetadataPath());
    this.#week = results?.fantasy_content?.league?.current_week ?? null;
    return this.#week;
  }

  async getFreeAgents() {
    const pageCount = Number.parseInt(String(this.#config.FREE_AGENTS ?? 0), 10);
    const normalizedPageCount = Number.isFinite(pageCount) && pageCount >= 0 ? pageCount : 0;
    const pageSize = Number.parseInt(String(this.#config.FREE_AGENT_PAGE_SIZE ?? 25), 10) || 25;

    const requests = [];
    for (let page = 0; page <= normalizedPageCount; page += 1) {
      requests.push(this.#fetchFantasyResource(this.freeAgentsPath(page * pageSize, pageSize)));
    }

    const pages = await Promise.all(requests);
    return pages.flatMap((result) => toArray(result?.fantasy_content?.league?.players?.player));
  }

  async getMyPlayers() {
    const results = await this.#fetchFantasyResource(this.teamRosterPath());
    return toArray(results?.fantasy_content?.team?.roster?.players?.player);
  }

  async getMyWeeklyStats() {
    const week = await this.getCurrentWeek();
    const results = await this.#fetchFantasyResource(this.teamWeeklyStatsPath(week));
    return toArray(results?.fantasy_content?.team?.team_stats?.stats?.stat);
  }

  async getMyScoreboard() {
    const week = await this.getCurrentWeek();
    const results = await this.#fetchFantasyResource(this.leagueScoreboardPath(week));
    return toArray(results?.fantasy_content?.league?.scoreboard?.matchups?.matchup);
  }

  async getMyPlayersStats() {
    const players = await this.getMyPlayers();
    if (players.length === 0) {
      return [];
    }

    const playerKeys = players
      .map((player) => player?.player_key)
      .filter(Boolean)
      .join(',');

    if (!playerKeys) {
      return [];
    }

    return this.#fetchFantasyResource(`/players;player_keys=${playerKeys};out=stats`);
  }

  async getTransactions() {
    const results = await this.#fetchFantasyResource(this.leagueTransactionsPath());
    return results?.fantasy_content?.league?.transactions ?? null;
  }

  async getStatsIDs() {
    const results = await this.#fetchFantasyResource(this.statsCategoriesPath());
    return results?.fantasy_content?.game?.stat_categories?.stats ?? null;
  }

  async getCurrentRoster() {
    const results = await this.#fetchFantasyResource(this.teamRosterPlayersPath());
    return results?.fantasy_content?.team?.roster?.players ?? null;
  }

  async fetchAllData() {
    await this.getUserInfo();
    const week = await this.getCurrentWeek();

    const [
      freeAgents,
      myPlayers,
      myPlayersStats,
      myScoreboard,
      statsIDs,
      currentRoster,
      transactions,
    ] = await Promise.all([
      this.getFreeAgents(),
      this.getMyPlayers(),
      this.getMyPlayersStats(),
      this.getMyScoreboard(),
      this.getStatsIDs(),
      this.getCurrentRoster(),
      this.getTransactions(),
    ]);

    return {
      meta: {
        fetchedAt: new Date().toISOString(),
        week,
      },
      'free agents': freeAgents,
      'my players': myPlayers,
      "my players' stats": myPlayersStats,
      'my scoreboard': myScoreboard,
      'stat IDs': statsIDs,
      'current roster': currentRoster,
      transactions,
    };
  }
}

async function runFetchAll(client, outputPath) {
  console.log('Authenticating...');
  await client.initialize();

  console.log('Getting current week...');
  const allData = await client.fetchAllData();

  const absoluteOutputPath = path.resolve(outputPath);
  await fs.writeFile(absoluteOutputPath, `${JSON.stringify(allData, null, 2)}\n`, 'utf8');
  console.log(`Data successfully written to ${absoluteOutputPath}`);
}

async function runLeaguePrefix(client) {
  console.log('Authenticating...');
  await client.initialize();

  const prefix = await client.getLeaguePrefix();
  console.log(prefix);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.command === 'help') {
    printHelp();
    return;
  }

  const config = await loadConfig(args.configPath);
  const client = new YahooFantasyBaseballClient(config);

  switch (args.command) {
    case 'fetch-all':
      await runFetchAll(client, args.outputPath);
      break;
    case 'league-prefix':
      await runLeaguePrefix(client);
      break;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: serializeError(error) }, null, 2));
  process.exitCode = 1;
});
