# Yahoo Fantasy Baseball API Reader

Want to download your fantasy baseball data from Yahoo but having a hard time interfacing with their poorly documented API? 

This tool is for you.

- Installation
- Usage
- Yahoo's API docs

If you want a more advanced tool, see my [Yahoo Fantasy Baseball Automater](https://github.com/edwarddistel/yahoo-fantasy-baseball-automater), which attempts to start an optimal lineup for you based on your team vs the day's probably pitchers.

Also, this is written in NodeJS. If you prefer PHP I have a primitive version of this in /php-version.

## Installation

### Part 1: Get access codes from Yahoo
1. Log into Yahoo
2. Navigate to https://developer.yahoo.com/apps/create/
3. Fill out the form
    - Application Name (Whatever)
    - Description (Whatever)
    - Homepage URL (anything, e.g. www.github.com)
    - Redirect URI(s) (anything, e.g. www.github.com)
    - API Permissions (checkmark Fantasy Sports, then Read/Write)
    - ![](/screenshots/yahoo-1.png)
4. Create App
5. Yahoo will give you 3 values. Write down the last two:
    - App ID (don't care)
    - Client ID/Consumer Key
    - Client Secret/Consumer Secret
    - ![](/screenshots/yahoo-2.png)    
6. However the above codes are **not enough** to interface with the Yahoo Fantasy API. Take the `Client ID/Consumer Key` from above and paste it into the following URL:
    
https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR-CLIENT-ID-GOES-HERE&redirect_uri=oob&response_type=code&language=en-us

7. Enter that URL into your browser.
8. Agree to allow access for your app.
 - ![](/screenshots/yahoo-4.png)

9. Grab the code Yahoo now gives you.
 - ![](/screenshots/yahoo-5.png)


### Part 2: Configure this app

10. [Install NodeJS](https://nodejs.org/en/download/) (Check the .nvmrc file for version but most versions should work)
11. Clone this repo
12. In the repo directory type `npm install`
13. Optional: To make sure you're using the right version NodeJS, type in `nvm use`. If you get an error message that `nvm` cannot be found, install it (e.g. [Mac](https://formulae.brew.sh/formula/nvm)) and try again
14. Rename `config.json.example` to `config.json` and open it in a text editor
15. Enter in the following values and save:
    - `CONSUMER_KEY`: Obtained from Yahoo in step 5 above
    - `CONSUMER_SECRET`: Also obtained from Yahoo in step 5 above
    - `YAHOO_AUTH_CODE`: Obtained from Yahoo in step 9 above (**not the App ID in step 5!**)
    - `LEAGUE_KEY`: the League Key has three parts: 
        - (1) a unique prefix Yahoo randomly assigns each season
        - (2) the string ".l." (that's a lowercase L)
        - (3) the unique ID of your league
        - E.g.: `422.l.123456`
        - To find out this number:
            - If it's 2023 and baseball, the unique prefix for MLB is `422`. 
            - You can find out the league prefix by running:
            ```
            npm run start
            npm run league-prefix
            ```
            - You can find your league ID simply by logging into the Yahoo Fantasy Baseball website - it'll be the value after `https://baseball.fantasysports.yahoo.com/b1/`
            - Combine those two with ".l." for a final format of `412.l.123456`
    - `TEAM`: This is your team number.
        - Just log into the Yahoo Fantasy Baseball website, click on "My Team", then check the URL to see what team number you are. Usually 1-8
    - `AUTH_FILE`: Where to store the credentials. Can be anything you want.
    - `FREE_AGENTS`: How many "pages" of free agents to request from Yahoo, 25 at a time. E.g. 0 = first 25 free agents by rank in the league, 1 = 50, 2 = 75, etc.

## Usage
### Run the app

Navigate to the repo directory and run:
```
> npm run start
```


By default this app will pull in the following data:

```json
const allData = {
    "free agents": freeAgents, 
    "my players": myPlayers, 
    "my players' stats": myPlayersStats, 
    "my scoreboard": myScoreboard, 
    "stat IDs": statsIDs, 
    "current roster": currentRoster, 
    "transactions": transactions
};
```

And write this JSON object to a file, `allMyData.json`.  From there you should be able to consume and manipulate your data.

This may or may not include your desired data set, but you should be able to use this template to pull in whatever you want. The Yahoo API docs are not great so I've summarized them below.

## Yahoo Fantasy API Docs
### Overview of Endpoints/Resources
There's [Yahoo's official guide](https://developer.yahoo.com/fantasysports/guide) but it's not great. All of the info below is from their website, just more organized.

First, an overview of the "Resources" (aka endpoints) Yahoo makes available:

![Yahoo Fantasy API](/screenshots/plectica-small.png)

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

### Subresouces

Each endpoint has subresources that can be accessed:

![](/screenshots/plectica-big.png)

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
