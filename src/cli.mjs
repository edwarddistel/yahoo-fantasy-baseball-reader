import { DEFAULT_CONFIG_PATH, DEFAULT_OUTPUT_PATH, loadConfig } from './config.mjs';
import { YahooOAuth, authorizationUrl } from './oauth.mjs';
import { YahooFantasyApi } from './http.mjs';
import { YahooFantasyBaseballReader } from './reader.mjs';
import { atomicWriteJson } from './storage.mjs';
import { ConfigurationError } from './errors.mjs';

export const HELP = `Yahoo Fantasy Baseball Reader (read-only)

Usage:
  npm start -- [fetch-all] [--config PATH] [--output PATH]
  npm run league-prefix -- [--config PATH]
  npm run auth-url -- [--config PATH]
  node src/index.mjs --help

Commands:
  fetch-all       Download your league and roster data to JSON (default)
  league-prefix   Look up the current MLB game ID
  auth-url        Print your Yahoo OAuth authorization URL (no credentials exchange)
  help            Show this help

Configuration: config.json or environment variables (environment overrides JSON)
  CONSUMER_KEY, CONSUMER_SECRET, YAHOO_AUTH_CODE (first run only),
  YAHOO_REDIRECT_URI (default: oob), AUTH_FILE (default: ./credentials.json),
  LEAGUE_KEY, TEAM, FREE_AGENTS, FREE_AGENT_PAGE_SIZE

Yahoo requires prior Fantasy Sports API approval and an access agreement:
  https://sports.yahoo.com/developer/access/
`;

export function parseArgs(argv) {
  const result = { command: 'fetch-all', configPath: DEFAULT_CONFIG_PATH, outputPath: DEFAULT_OUTPUT_PATH };
  let sawCommand = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { result.command = 'help'; return result; }
    if (arg === '--config' || arg === '--output') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new ConfigurationError(`${arg} requires a path.`);
      result[arg === '--config' ? 'configPath' : 'outputPath'] = value;
      continue;
    }
    if (!arg.startsWith('-') && !sawCommand) { result.command = arg; sawCommand = true; continue; }
    throw new ConfigurationError(`Unrecognized argument: ${arg}`);
  }
  if (!['fetch-all', 'league-prefix', 'auth-url', 'help'].includes(result.command)) {
    throw new ConfigurationError(`Unknown command: ${result.command}. Run --help for usage.`);
  }
  return result;
}

/** Dependency injection permits full CLI coverage without contacting Yahoo. */
export async function run(argv = process.argv.slice(2), {
  env = process.env,
  stdout = console.log,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const args = parseArgs(argv);
  if (args.command === 'help') { stdout(HELP); return; }
  const config = await loadConfig(args.configPath, { env, command: args.command });
  if (args.command === 'auth-url') { stdout(authorizationUrl(config)); return; }

  const oauth = new YahooOAuth(config, { fetchImpl });
  await oauth.initialize();
  const api = new YahooFantasyApi(oauth, { fetchImpl });
  const reader = new YahooFantasyBaseballReader(config, api, { now });
  if (args.command === 'league-prefix') {
    stdout(String(await reader.getLeaguePrefix()));
    return;
  }
  const data = await reader.fetchAllData();
  await atomicWriteJson(args.outputPath, data);
  stdout(`Saved Yahoo Fantasy data to ${args.outputPath}`);
}
