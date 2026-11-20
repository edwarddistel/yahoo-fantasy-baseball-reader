import { ConfigurationError } from './errors.mjs';

function validSegment(value, label) {
  if (!/^[A-Za-z0-9_.-]+$/.test(String(value))) throw new ConfigurationError(`Invalid ${label}.`);
  return String(value);
}

export function fantasyPaths(config) {
  const leagueKey = validSegment(config.LEAGUE_KEY, 'league key');
  const teamKey = `${leagueKey}.t.${validSegment(config.TEAM, 'team number')}`;
  const gameKey = leagueKey.split('.l.')[0];
  return {
    game: '/game/mlb',
    userGames: '/users;use_login=1/games',
    leagueMetadata: `/league/${leagueKey}/metadata`,
    roster: `/team/${teamKey}/roster/`,
    rosterPlayers: `/team/${teamKey}/roster/players`,
    teamWeeklyStats: (week) => `/team/${teamKey}/stats;type=week;week=${validSegment(week, 'week')}`,
    scoreboard: (week) => `/league/${leagueKey}/scoreboard;week=${validSegment(week, 'week')}`,
    transactions: `/league/${leagueKey}/transactions;types=add,trade,drop`,
    statCategories: `/game/${gameKey}/stat_categories`,
    freeAgents: (start, count) => `/league/${leagueKey}/players;status=FA;start=${validSegment(start, 'start')};count=${validSegment(count, 'count')};sort=OR`,
    playerStats: (keys) => `/players;player_keys=${keys.map((key) => validSegment(key, 'player key')).join(',')};out=stats`,
  };
}
