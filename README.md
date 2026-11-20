# Yahoo Fantasy Baseball API Reader

**A read-only Node.js CLI for downloading Yahoo Fantasy Baseball league, roster, player, matchup, and transaction data as JSON.**

> [!IMPORTANT]
> **Yahoo Fantasy Sports API access now requires approval.** In summer 2026, Yahoo moved Fantasy Sports API access from self-service registration to an application and review process. Creating a Yahoo developer app and obtaining OAuth keys is **no longer sufficient**.
>
> To access Yahoo Fantasy data, **[apply to Yahoo for Fantasy Sports API access](https://sports.yahoo.com/developer/access/)** and **sign Yahoo's required API Access and Use Agreement** (the NDA-style access paperwork). Once Yahoo approves and provisions your application for **read access**, you can authenticate and use this reader. **New write access is not currently offered by Yahoo.**
>
> This project is **not discontinued**: the code remains a read-only API client, but whether it works for you depends on Yahoo granting access. It cannot bypass Yahoo's approval requirement.

This repository started as a way to make Yahoo's sparsely documented Fantasy Sports endpoints easier to work with. It includes a runnable downloader and an extensive endpoint reference below. The CLI was refactored for **v2.0** and updated for the 2026 baseball season.

## Contents

- [Getting Yahoo API access](#getting-yahoo-api-access)
- [What's new in v2.0](#whats-new-in-v20)
- [Installation and configuration](#installation-and-configuration)
- [Usage](#usage)
- [Yahoo Fantasy API Docs](#yahoo-fantasy-api-docs)

## Getting Yahoo API access

Yahoo's current process has **two separate steps**: Yahoo must authorize your *application* to use the Fantasy Sports API, and the Yahoo account whose fantasy data you want to read must then authorize the app using OAuth.

1. **[Apply for Fantasy Sports API access](https://sports.yahoo.com/developer/access/)**. Describe your application and its expected usage accurately. Yahoo reviews applications individually; approval is not automatic.
2. **Complete Yahoo's legal agreement.** Yahoo requires you to sign its **API Access and Use Agreement** (sometimes described as an NDA or access agreement) before it provisions API access.
3. **Create or update a [Yahoo developer application](https://developer.yahoo.com/apps/create/)**, following Yahoo's instructions. Request **Fantasy Sports — Read** permission if it is available. New write access is not currently available.
4. **Confirm that your application is provisioned.** If Fantasy Sports permissions are missing from your application, follow Yahoo's [application confirmation instructions](https://sports.yahoo.com/developer/application-confirmation/). Supply the associated developer-account information and Client ID as Yahoo requests.
5. **Obtain your application's OAuth Client ID and Client Secret.** These are also called the **Consumer Key** and **Consumer Secret**. You will need them for the setup below.

> [!NOTE]
> The Yahoo developer-console screenshots in `screenshots/` show the **older self-service flow** and may no longer match what Yahoo displays. Follow Yahoo's current developer portal and your approval instructions rather than relying on those screenshots.

## What's new in v2.0

The April 2026 code refactor replaced the older multi-file client with a single modern CLI in `src/index.mjs`. These are the capabilities implemented by the current version:

| Area | What the revised version does |
| --- | --- |
| **Modern Node.js implementation** | Uses ES modules, built-in `fetch`, `async`/`await`, and `node:fs`/`node:path`; removes the previous `axios`, `qs`, and `xml2json` dependencies. |
| **XML-to-JavaScript parsing** | Uses `fast-xml-parser` to turn Yahoo's XML responses into JavaScript objects, with array handling for several common repeating resources. |
| **OAuth 2.0 lifecycle** | Exchanges an initial authorization code for tokens, saves the token response to `AUTH_FILE`, reloads saved tokens on later runs, and refreshes/retries once when Yahoo returns HTTP 401 or a `token_expired` error. |
| **Configuration options** | Reads settings from a JSON config file or environment variables (environment variables override the JSON values). Supports alternate configuration and output paths via CLI flags. |
| **Free-agent pagination** | Requests configurable pages of available players, sorted by overall rank, in parallel. Configurable page size; default is 25. |
| **Concurrent data collection** | Retrieves the main data sets using `Promise.all()` instead of fetching each sequentially. |
| **League and weekly context** | Looks up your current league week and adds a `meta` section containing that week and the fetch timestamp. |
| **Commands** | Supports `fetch-all` (the default), `league-prefix`, and `help`. |
| **Error reporting** | Produces structured error output with details from failed authentication, invalid configuration, or failed API requests. |
| **Read-only requests** | Retrieves data using authenticated GET requests. It does **not** edit your lineup, add/drop players, or perform trades. |

### Data retrieved

A normal run fetches your free agents, roster players, player stats, current-week scoreboard, stat-category IDs, current roster, and league transactions. It also queries your Yahoo account's games and the league's current week. All returned results are written to a single JSON file.

The code also includes a `getMyWeeklyStats()` method for team weekly statistics, but **that method is not included in the default `fetch-all` output**.

## Installation and configuration

### 1. Install dependencies

Install [Node.js](https://nodejs.org/en/download/) and clone the repository. The project includes an `.nvmrc` file to select its configured Node version if you use [`nvm`](https://github.com/nvm-sh/nvm).

```bash
git clone https://github.com/edwarddistel/yahoo-fantasy-baseball-reader.git
cd yahoo-fantasy-baseball-reader
nvm use       # optional, if you have nvm installed
npm install
```

### 2. Authorize your Yahoo account

**Do this only after Yahoo has approved and provisioned the application** as described in [Getting Yahoo API access](#getting-yahoo-api-access).

The current implementation uses Yahoo's **out-of-band OAuth 2.0 authorization-code flow** (`redirect_uri=oob`). Insert your approved application's **Client ID / Consumer Key** into this URL:

```text
https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR-CLIENT-ID-GOES-HERE&redirect_uri=oob&response_type=code&language=en-us
```

Open the URL in a browser, sign in with the Yahoo account that owns your fantasy team, approve the requested read access, and copy the **authorization code** that Yahoo supplies. That code is the initial `YAHOO_AUTH_CODE`; it is **not** your App ID, Consumer Key, or Consumer Secret.

Yahoo documents the out-of-band flow in its [OAuth 2.0 authorization-code guide](https://developer.yahoo.com/oauth2/guide/flows_authcode/). If Yahoo has provisioned your app with different OAuth instructions, follow Yahoo's requirements; this CLI currently expects `oob` for its initial code exchange.

### 3. Configure the reader

Copy the example configuration and fill in your values:

```bash
cp config.json.example config.json
```

```json
{
  "CONSUMER_KEY": "YOUR_YAHOO_CLIENT_ID",
  "CONSUMER_SECRET": "YOUR_YAHOO_CLIENT_SECRET",
  "YAHOO_AUTH_CODE": "YOUR_ONE_TIME_AUTHORIZATION_CODE",
  "LEAGUE_KEY": "469.l.123456",
  "TEAM": "1",
  "AUTH_FILE": "./credentials.json",
  "FREE_AGENTS": "3",
  "FREE_AGENT_PAGE_SIZE": "25"
}
```

| Setting | Description |
| --- | --- |
| `CONSUMER_KEY` | Yahoo-approved application's **Client ID / Consumer Key**. |
| `CONSUMER_SECRET` | Its **Client Secret / Consumer Secret**. |
| `YAHOO_AUTH_CODE` | One-time OAuth code from the previous step. Only needed when there is no saved credentials file. |
| `LEAGUE_KEY` | Format: `{game_key}.l.{league_id}`, e.g., `469.l.123456` for a 2026 MLB league. Game keys change by season. |
| `TEAM` | Your team number within the league, visible in the **My Team** URL on Yahoo. |
| `AUTH_FILE` | Path for the saved OAuth token response, resolved relative to the config file's directory. |
| `FREE_AGENTS` | **Zero-based last page index**, not the number of pages. `0` fetches one page, `1` fetches two, `3` fetches four. |
| `FREE_AGENT_PAGE_SIZE` | Number of free agents requested per page; defaults to `25` if omitted. |

**Finding your league key:** For the 2026 MLB season the game prefix is `469`. For another season, use `npm run league-prefix` after authorization to look up the current MLB prefix. Your league ID appears in the URL when you open your league on Yahoo Fantasy Baseball, after `/b1/`. Join these values with `.l.`. For example, `469.l.123456`.

**Protect your secrets:** Do not commit `config.json`, `credentials.json`, or downloaded fantasy data to a public repository. The included `.gitignore` excludes the default filenames, but custom credential/output filenames need to be ignored separately. Treat the Client Secret, authorization code, and refresh tokens as sensitive credentials.

### 4. Optional: configure with environment variables

All supported config values can be passed as environment variables, which take precedence over `config.json`. If you supply all required values in the environment, the JSON config file may be omitted.

```bash
export CONSUMER_KEY='your-client-id'
export CONSUMER_SECRET='your-client-secret'
export LEAGUE_KEY='469.l.123456'
export TEAM='1'
export AUTH_FILE='./credentials.json'
# Also set YAHOO_AUTH_CODE for the first run if AUTH_FILE does not exist.
npm start
```

## Usage

### Download all supported data

```bash
npm start
```

Equivalent direct invocation:

```bash
node src/index.mjs fetch-all
```

The command writes pretty-printed JSON to `allMyData.json` by default. The output structure is:

```json
{
  "meta": {
    "fetchedAt": "2026-04-04T12:00:00.000Z",
    "week": 1
  },
  "free agents": [],
  "my players": [],
  "my players' stats": {},
  "my scoreboard": [],
  "stat IDs": {},
  "current roster": {},
  "transactions": {}
}
```

The values above are **illustrative placeholders**, not a guaranteed response schema: Yahoo may return different object shapes, and missing resources may be represented by empty arrays or `null`. The `meta` object contains the actual retrieval time and league week.

### Find the current MLB game prefix

```bash
npm run league-prefix
```

This invokes the `league-prefix` command and prints the current MLB game ID, which can help build a `LEAGUE_KEY` for the active season.

### Change the config or output file

```bash
node src/index.mjs fetch-all --config ./my-config.json --output ./fantasy-data.json
```

Or pass the arguments through npm:

```bash
npm start -- --config ./my-config.json --output ./fantasy-data.json
```

For the available commands and configuration fields:

```bash
node src/index.mjs --help
```

**Yahoo access issues:** An HTTP 403 or a missing Fantasy Sports permission may mean Yahoo has not provisioned your app for the API. Valid OAuth credentials alone do not grant Yahoo Fantasy API access; return to the [developer portal](https://sports.yahoo.com/developer/) and check your approval and application status.

---

## Yahoo Fantasy API Docs
### Overview of Endpoints/Resources
This reference reorganizes Yahoo's legacy [Fantasy Sports API guide](https://developer.yahoo.com/fantasysports/guide). For the latest availability and policies, consult the [current Yahoo Sports API documentation](https://sports.yahoo.com/developer/docs/). It covers the broader API, including historical write operations; **this reader only makes GET requests and does not change rosters or perform transactions**. Some historical examples use football league keys, but the resource patterns also explain baseball data.

First, an overview of the "Resources" (aka endpoints) Yahoo makes available:

![Yahoo Fantasy API](screenshots/plectica-small.png)

- **Player**
    - Player stats & info, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/player-resource.html)
- **Game**
    - individual game data, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/game-resource.html)
- **League**
    - info about your league, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/league-resource.html)
- **Team**
    - stats, standings and roster info about your team, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/team-resource.html)
- **Roster**
    - manage your roster, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/roster-resource.html)
- **Transaction**
    - monitor or make transactions, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/transaction-resource.html)
- **User**
    - info about the Yahoo user, [docs](https://web.archive.org/web/20131003155757/https://developer.yahoo.com/fantasysports/guide/user-resource.html)

Except for "Roster", all other 6 endpoints also offer groups of items called "Collections" (instead of "Resources"). Basically the same content, just more than one item at a time.

### Subresources

Each endpoint has subresources that can be accessed:

![](screenshots/plectica-big.png)

### Base URL

For all the links below, the base URL is https://fantasysports.yahooapis.com/fantasy/v2

#### Player subresources
- With the Player API, you can obtain the player (athlete) related information, such as their name, professional team, and eligible positions.
- E.g. https://fantasysports.yahooapis.com/fantasy/v2/league/223.l.431/players;player_keys=223.p.5479

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| metadata | Includes player key, id, name, editorial information, image, eligible positions, etc. | /fantasy/v2/player/{player_key}/metadata | Drew Brees's info in the 2009 season: /player/223.p.5479 |
| stats | Player stats and points (if in a league context). | Season stats: /fantasy/v2/player/{player_key}/stats Week stats: /fantasy/v2/player/{player_key}/stats;type=week;week={week} Here {week} is a non-zero integer. | Drew Brees's info and stats in the 2009 season: /player/223.p.5479/stats |
| ownership | The player ownership status within a league (whether they're owned by a team, on waivers, or free agents). Only relevant within a league. | /fantasy/v2/league/{league_key}/players;player_keys={player_key}/ownership | /league/223.l.431/players;player_keys=223.p.5479/ownership |
| percent_owned | Data about ownership percentage of the player | /fantasy/v2/player/{player_key}/percent_owned | The percentage of leagues in which Drew Brees was owned in the 2009 game: /player/223.p.5479/percent_owned |
| draft_analysis | Average pick, Average round and Percent Drafted. | /fantasy/v2/player/{player_key}/draft_analysis | Yahoo! fantasy draft information for Drew Brees in 2009: /player/223.p.5479/draft_analysis |

#### Player collection
- "With the Players API, you can obtain information from a collection of players simultaneously."
- `/players;player_keys={player_key1},{player_key2};out={sub_resource_1},{sub_resource_2}`


#### Player filters
| Filter parameter | Filter parameter values | Usage |
| ---------------- | ----------------------- | ----- |
| position | Valid player positions | /players;position=QB (Note: Applied only in a league's context) |
| status | A (all available players), FA (free agents only), W (waivers only), T (all taken players), K (keepers only) | /players;status=A (Note: Applied only in a league's context) |
| search | player name | /players;search=smith (Note: Applied only in a league's context) |
| sort | {stat_id}, NAME (last, first), OR (overall rank), AR (actual rank), PTS (fantasy points) | /players;sort=60 (Note: Applied only in a league's context) |
| sort_type | season, date (baseball, basketball, and hockey only), week (football only), lastweek (baseball, basketball, and hockey only), lastmonth | /players;sort_type=season (Note: Applied only in a league's context) |
| sort_season | year | /players;sort_type=season;sort_season=2010  (Note: Applied only in a league's context)
| sort_date (baseball, basketball, and hockey only) | YYYY-MM-DD | /players;sort_type=date;sort_date=2010-02-01  (Note: Applied only in a league's context) |
| sort_week (football only) | week | /players;sort_type=week;sort_week=10
| start | Any integer 0 or greater | /players;start=25 (Note: Applied only in a league's context) |
| count | Any integer b/t 0 & 25 | /players;count=5 (Note: Applied only in a league's context) |

#### Game subresources
- With the Game API, you can obtain the fantasy game related information, like the fantasy game name, the Yahoo! game code, and season.
- E.g. /game/{game_key}/{sub_resource}

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| metadata | Includes game key, code, name, url, type and season. | /fantasy/v2/game/{game_key}/metadata | The 2009 Football PLUS game: /game/223|
| leagues | Fetch specified leagues under a game. | /fantasy/v2/game/{game_key}/leagues;league_keys={league_key1},{league_key2} | A publicly viewable league within the 2009 football plus game: /game/223/leagues;league_keys=223.l.431|
| players | Fetch specified players under a game. | /fantasy/v2/game/{game_key}/players;player_keys={player_key1},{player_key2} | Brett Favre's information from the 2009 football plus game: /game/223/players;player_keys=223.p.1025|
| game_weeks | Start and end date information for each week in the game | /fantasy/v2/game/{game_key}/game_weeks | NFL game weeks /game/nfl/game_weeks|
| stat_categories | Detailed description of all available stat categories for the game. | /fantasy/v2/game/{game_key}/stat_categories | NFL stat categories /game/nfl/stat_categories|
| position_types | Detailed description of all player position types for the game. | /fantasy/v2/game/{game_key}/position_types | NFL position types /game/nfl/position_types|
| roster_positions | Detailed description of all roster positions for the game. | /fantasy/v2/game/{game_key}/roster_positions | NFL roster positions /game/nfl/roster_positions |

#### Games collection
- With the Games API, you can obtain information from a collection of games simultaneously. Each element beneath the Games Collection will be a Game Resource
- E.g. https://fantasysports.yahooapis.com/fantasy/v2/games;game_keys={game_key1},{game_key2};out={sub_resource_1},{sub_resource_2}

#### Games filters
| Filter parameter | Filter parameter values | Usage |
| ---------------- | ----------------------- | ----- |
| is_available | 1 to only show games currently in season | /games;is_available=1 |
| game_types | full|pickem-team|pickem-group|pickem-team-list | /games;game_types=full,pickem-team |
| game_codes | Any valid game codes | /games;game_codes=nfl,mlb |
| seasons | Any valid seasons | /games;seasons=2011,2012 |

#### League subresources
- With the League API, you can obtain the league related information, like the league name, the number of teams, the draft status, et cetera.
- E.g. https://fantasysports.yahooapis.com/fantasy/v2/league/223.l.431 

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| metadata | Includes league key, id, name, url, draft status, number of teams, and current week information. | /fantasy/v2/league/{league_key}/metadata |  /league/223.l.431 |
| settings | League settings. For instance, draft type, scoring type, roster positions, stat categories and modifiers, divisions. | /fantasy/v2/league/{league_key}/settings |  /league/223.l.431/settings |
| standings | Ranking of teams within the league. Accepts Teams as a sub-resource, and includes team_standings data by default beneath the teams | /fantasy/v2/league/{league_key}/standings |  /league/223.l.431/standings |
| scoreboard | League scoreboard. Accepts Matchups as a sub-resource, which in turn accept Teams as a sub-resource. Includes team_stats data by default. | Scoreboard for current week: /fantasy/v2/league/{league_key}/scoreboard | Scoreboard for a particular week: /fantasy/v2/league/{league_key}/scoreboard;week={week} |
| teams | All teams in the league. | /fantasy/v2/league/{league_key}/teams |  /league/223.l.431/teams |
| players | The league's eligible players. | /fantasy/v2/league/{league_key}/players |  /league/223.l.431/players |
| draftresults | Draft results for all teams in the league. | /fantasy/v2/league/{league_key}/draftresults |  /league/223.l.431/draftresults |
| transactions | League transactions -- adds, drops, and trades. | /fantasy/v2/league/{league_key}/transactions |  /league/223.l.431/transactions |

#### Leagues collection
- With the Leagues API, you can obtain information from a collection of leagues simultaneously.
- /leagues;league_keys={league_key1},{league_key2}/{sub_resource}

#### Team subresources
- The Team APIs allow you to retrieve information about a team within our fantasy games.
- E.g. https://fantasysports.yahooapis.com/fantasy/v2/team/223.l.431.t.1

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| metadata | Includes team key, id, name, url, division ID, logos, and team manager information. | /fantasy/v2/team/{team_key}/metadata | /team/223.l.431.t.9 |
| stats | Team statistical data and points. | Season stats: /fantasy/v2/team/{team_key}/stats Week stats: /fantasy/v2/team/{team_key}/stats;type=week;week={week} Here {week} is a non-zero integer, or current for the current week. | /team/223.l.431.t.9/stats;type=week;week=2 |
| standings | Team rank, wins, losses, ties, and winning percentage (as well as divisional data if applicable). | /fantasy/v2/team/{team_key}/standings | /team/223.l.431.t.9/standings |
| roster | Team roster. Accepts a week parameter. Also accepts Players as a sub-resource (included by default) | Roster for a particular week: /fantasy/v2/team/{team_key}/roster;week={week} Here {week} is a non-zero integer. If week is current, or isn't provided, defaults to current week. | /team/223.l.431.t.9/roster;week=2 - The week 2 roster for team 223.l.431.t.9 |
| draftresults | List of players drafted by the team. | /fantasy/v2/team/{team_key}/draftresults | /team/223.l.431.t.9/draftresults |
| matchups | All the matchups this team has scheduled (for H2H leagues). | All matchups: /fantasy/v2/team/{team_key}/matchups Particular weeks: /fantasy/v2/team/{team_key}/matchups;weeks=1,3,6 | /team/223.l.431.t.9/matchups;weeks=1,3,6 |

#### Teams collection
- With the Teams API, you can obtain information from a collection of teams simultaneously.
- /teams;team_keys={team_key1},{team_key2};out={sub_resource_1},{sub_resource_2}

#### Roster subresources
- You can use this API to edit your lineup by PUTting up new positions for the players on a roster.
- https://fantasysports.yahooapis.com/fantasy/v2/team//roster;date=2011-05-01 

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| players | Access the players collection within the roster. | /fantasy/v2/team/{team_key}/roster/players | /team/223.l.431.t.9/roster/players |


#### Transaction subresources
- With the Transaction API, you can obtain information about transactions (adds, drops, trades, and league settings changes) performed on a league
- E.g. https://fantasysports.yahooapis.com/fantasy/v2/transaction/257.l.193.tr.2 

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| metadata | Includes transaction key, id, type, timestamp, status, players (not displayed for all transaction types) | /fantasy/v2/transaction/{transaction_key}/metadata | An add/drop transaction: /transaction/223.l.431.tr.26 |
| players | Players that are part of the transaction. The Player Resources will include a transaction data element by default. | /fantasy/v2/transaction/{transaction_key}/players | /transaction/223.l.431.tr.26/players |


#### Transaction collection
- With the Transactions API, you can obtain information via GET from a collection of transactions simultaneously.
- E.g. /transactions;transaction_keys={transaction_key1},{transaction_key2};out={sub_resource_1},{sub_resource_2}

#### Transaction filters
| Filter parameter | Filter parameter values | Usage |
| ---------------- | ----------------------- | ----- |
| type | add,drop,commish,trade | /transactions;type=add |
| types | Any valid types | /transactions;types=add,trade |
| team_key | A team_key within the league | /transactions;team_key=257.l.193.t.1 |
| type with team_key | waiver,pending_trade | You can only use these options when also providing the team_key, ie /transactions;team_key=257.l.193.t.1;type=waiver |
| count | Any integer greater than 0 | /transactions;count=5 |


#### User subresources
- With the User API, you can retrieve fantasy information for a particular Yahoo! user. It is generally recommended that you instead use the Users collection, passing along the use_login flag.

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| games | Fetch the Games in which the user has played. Additionally accepts flags is_available to only return available games. | /fantasy/v2/users;use_login=1/games | /users;use_login=1/games |
| games/leagues | Fetch leagues that the user belongs to in one or more games. The leagues will be scoped to the user. This will throw an error if any of the specified games do not support league sub-resources. | /fantasy/v2/users;use_login=1/games;game_keys={game_key1},{game_key2}/leagues | /users;use_login=1/games;game_keys=223/leagues |
| games/teams | Fetch teams owned by the user in one or more games. The teams will be scoped to the user. This will throw an error if any of the specified games do not support team sub-resources. | /fantasy/v2/users;use_login=1/games;game_keys={game_key1},{game_key2}/teams |

#### User resource/collection
- With the User API, you can retrieve fantasy information for a particular Yahoo! user. It is generally recommended that you instead use the Users collection, passing along the use_login flag.

| Name | Description | URI | Sample |
| ---- | ----------- | --- | ------ |
| games | Fetch the Games in which the user has played. Additionally accepts flags is_available to only return available games. | /fantasy/v2/users;use_login=1/games | /users;use_login=1/games |
| games/leagues | Fetch leagues that the user belongs to in one or more games. The leagues will be scoped to the user. This will throw an error if any of the specified games do not support league sub-resources. | /fantasy/v2/users;use_login=1/games;game_keys={game_key1},{game_key2}/leagues | /users;use_login=1/games;game_keys=223/leagues |
| games/teams | Fetch teams owned by the user in one or more games. The teams will be scoped to the user. This will throw an error if any of the specified games do not support team sub-resources. | /fantasy/v2/users;use_login=1/games;game_keys={game_key1},{game_key2}/teams | /users;use_login=1/games;game_keys=223/teams |
