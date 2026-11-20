import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ConfigurationError } from './errors.mjs';

export const DEFAULT_CONFIG_PATH = './config.json';
export const DEFAULT_OUTPUT_PATH = './allMyData.json';

function integerSetting(value, name, { defaultValue, min, max }) {
  if (value === undefined || value === null || value === '') return defaultValue;
  // Do not accept e.g. '2abc' as parseInt would.
  if (!/^\d+$/.test(String(value))) throw new ConfigurationError(`${name} must be an integer (${min}–${max}).`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigurationError(`${name} must be an integer (${min}–${max}).`);
  }
  return parsed;
}

/**
 * Environment variables take precedence over config.json. AUTH_FILE is resolved relative
 * to the config file (not the current working directory), matching the legacy reader.
 */
export function normalizeConfig(fileConfig = {}, { configPath = DEFAULT_CONFIG_PATH, env = process.env, command = 'fetch-all' } = {}) {
  const config = {};
  for (const key of [
    'CONSUMER_KEY', 'CONSUMER_SECRET', 'YAHOO_AUTH_CODE', 'YAHOO_REDIRECT_URI',
    'AUTH_FILE', 'LEAGUE_KEY', 'TEAM', 'FREE_AGENTS', 'FREE_AGENT_PAGE_SIZE',
  ]) {
    config[key] = env[key] ?? fileConfig[key];
  }
  config.YAHOO_REDIRECT_URI ||= 'oob';
  config.AUTH_FILE = path.resolve(path.dirname(path.resolve(configPath)), config.AUTH_FILE || './credentials.json');
  config.FREE_AGENTS = integerSetting(config.FREE_AGENTS, 'FREE_AGENTS', { defaultValue: 0, min: 0, max: 39 });
  config.FREE_AGENT_PAGE_SIZE = integerSetting(config.FREE_AGENT_PAGE_SIZE, 'FREE_AGENT_PAGE_SIZE', { defaultValue: 25, min: 1, max: 25 });

  const required = command === 'auth-url'
    ? ['CONSUMER_KEY']
    : command === 'league-prefix'
      ? ['CONSUMER_KEY', 'CONSUMER_SECRET']
      : ['CONSUMER_KEY', 'CONSUMER_SECRET', 'LEAGUE_KEY', 'TEAM'];
  const missing = required.filter((key) => typeof config[key] !== 'string' && typeof config[key] !== 'number' || !String(config[key]).trim());
  if (missing.length) throw new ConfigurationError(`Missing required configuration: ${missing.join(', ')}.`);

  if (command === 'fetch-all') {
    const match = /^([a-zA-Z0-9]+)\.l\.(\d+)$/.exec(String(config.LEAGUE_KEY));
    if (!match) throw new ConfigurationError('LEAGUE_KEY must look like 469.l.123456.');
    config.TEAM = integerSetting(config.TEAM, 'TEAM', { defaultValue: undefined, min: 1, max: 100 });
  }
  if (!config.YAHOO_REDIRECT_URI || typeof config.YAHOO_REDIRECT_URI !== 'string') {
    throw new ConfigurationError('YAHOO_REDIRECT_URI must be a nonempty string.');
  }
  return config;
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH, options = {}) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new ConfigurationError(`Cannot read JSON config at ${path.resolve(configPath)}: ${error instanceof SyntaxError ? 'invalid JSON' : error.message}`);
    }
  }
  if (!fileConfig || Array.isArray(fileConfig) || typeof fileConfig !== 'object') {
    throw new ConfigurationError('Config must be a JSON object.');
  }
  return normalizeConfig(fileConfig, { ...options, configPath });
}
