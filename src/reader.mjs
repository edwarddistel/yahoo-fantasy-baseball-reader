import { fantasyPaths } from './paths.mjs';
import { toArray } from './xml.mjs';
import { YahooApiError } from './errors.mjs';

/** Yahoo's player_keys collection is intentionally requested in small batches. */
const PLAYER_BATCH_SIZE = 25;

export class YahooFantasyBaseballReader {
  #api;
  #config;
  #paths;
  #week;

  constructor(config, api, { now = () => new Date() } = {}) {
    this.#api = api;
    this.#config = config;
    this.#paths = config.LEAGUE_KEY && config.TEAM ? fantasyPaths(config) : null;
    this.now = now;
  }

  async getLeaguePrefix() {
    const result = await this.#api.get('/game/mlb');
    return result?.fantasy_content?.game?.game_id ?? null;
  }

  async getUserInfo() {
    const result = await this.#api.get('/users;use_login=1/games');
    return result?.fantasy_content?.users?.user?.games ?? null;
  }

  async getCurrentWeek() {
    if (this.#week !== undefined) return this.#week;
    const result = await this.#api.get(this.#paths.leagueMetadata);
    const week = Number(result?.fantasy_content?.league?.current_week);
    if (!Number.isSafeInteger(week) || week < 1) {
      throw new YahooApiError('Yahoo league metadata did not include a valid current_week.');
    }
    this.#week = week;
    return week;
  }

  async getFreeAgents() {
    // FREE_AGENTS retains the historic *last page index* semantics: 0 => one page.
    const count = this.#config.FREE_AGENT_PAGE_SIZE;
    const requests = Array.from({ length: this.#config.FREE_AGENTS + 1 }, (_, page) =>
      this.#api.get(this.#paths.freeAgents(page * count, count)));
    const pages = await Promise.all(requests);
    return pages.flatMap((page) => toArray(page?.fantasy_content?.league?.players?.player));
  }

  async getMyPlayers() {
    const result = await this.#api.get(this.#paths.roster);
    return toArray(result?.fantasy_content?.team?.roster?.players?.player);
  }

  async getCurrentRoster() {
    const result = await this.#api.get(this.#paths.rosterPlayers);
    return result?.fantasy_content?.team?.roster?.players ?? null;
  }

  async getMyWeeklyStats(week) {
    const selectedWeek = week ?? await this.getCurrentWeek();
    const result = await this.#api.get(this.#paths.teamWeeklyStats(selectedWeek));
    return toArray(result?.fantasy_content?.team?.team_stats?.stats?.stat);
  }

  async getMyScoreboard(week) {
    const selectedWeek = week ?? await this.getCurrentWeek();
    const result = await this.#api.get(this.#paths.scoreboard(selectedWeek));
    return toArray(result?.fantasy_content?.league?.scoreboard?.matchups?.matchup);
  }

  async getMyPlayersStats(players) {
    const roster = players ?? await this.getMyPlayers();
    const keys = [...new Set(roster.map((player) => player?.player_key).filter(Boolean).map(String))];
    if (!keys.length) return [];
    const batches = [];
    for (let i = 0; i < keys.length; i += PLAYER_BATCH_SIZE) {
      batches.push(keys.slice(i, i + PLAYER_BATCH_SIZE));
    }
    const responses = await Promise.all(batches.map((batch) => this.#api.get(this.#paths.playerStats(batch))));
    if (responses.length === 1) return responses[0]; // Preserve original Yahoo response shape.
    const combined = responses.flatMap((result) => toArray(result?.fantasy_content?.players?.player));
    return {
      fantasy_content: {
        ...responses[0]?.fantasy_content,
        players: { ...responses[0]?.fantasy_content?.players, player: combined, '@_count': String(combined.length) },
      },
    };
  }

  async getTransactions() {
    const result = await this.#api.get(this.#paths.transactions);
    return result?.fantasy_content?.league?.transactions ?? null;
  }

  async getStatsIDs() {
    const result = await this.#api.get(this.#paths.statCategories);
    return result?.fantasy_content?.game?.stat_categories?.stats ?? null;
  }

  async fetchAllData() {
    // Retain the original account check before reading league-specific data.
    await this.getUserInfo();
    const week = await this.getCurrentWeek();
    const myPlayersPromise = this.getMyPlayers();
    const [freeAgents, myPlayers, myScoreboard, statsIDs, currentRoster, transactions] = await Promise.all([
      this.getFreeAgents(),
      myPlayersPromise,
      this.getMyScoreboard(week),
      this.getStatsIDs(),
      this.getCurrentRoster(),
      this.getTransactions(),
    ]);
    // Reuse roster obtained above, avoiding a redundant Yahoo API request.
    const myPlayersStats = await this.getMyPlayersStats(myPlayers);
    return {
      meta: { fetchedAt: this.now().toISOString(), week },
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
