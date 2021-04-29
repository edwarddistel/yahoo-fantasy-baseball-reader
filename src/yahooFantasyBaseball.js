const fs = require("fs");
const qs = require("qs");
const axios = require("axios");
const parser = require("xml2json");
const CONFIG = require("../config.json");

exports.yfbb = {
  // Global credentials variable
  CREDENTIALS: null,

  // Used for authentication
  AUTH_HEADER: Buffer.from(`${CONFIG.CONSUMER_KEY}:${CONFIG.CONSUMER_SECRET}`, `binary`).toString(`base64`),
  AUTH_ENDPOINT: `https://api.login.yahoo.com/oauth2/get_token`,

  // Global week variable, start at 1
  WEEK: 1,

  // API endpoints
  YAHOO: `https://fantasysports.yahooapis.com/fantasy/v2`,
  gameKey() {
    return `${this.YAHOO}/game/mlb`;
  },
  freeAgents(i) {
    const startNum = typeof i !== "number" || i < 0 || i > 20 ? 0 : i;
    return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/players;status=FA;start=${startNum};sort=OR`;
  },
  myTeam() {
    return `${this.YAHOO}/team/${CONFIG.LEAGUE_KEY}.t.${CONFIG.TEAM}/roster/`;
  },
  myWeeklyStats() {
    return `${this.YAHOO}/team/${CONFIG.LEAGUE_KEY}.t.${CONFIG.TEAM}/stats;type=week;week=${this.WEEK}`;
  },
  scoreboard() {
    return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/scoreboard;week=${this.WEEK}`;
  },
  metadata() {
    return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/metadata`;
  },
  transactions() {
    return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/transactions;types=add,trade,drop`;
  },
  user() {
    return `${this.YAHOO}/users;use_login=1/games`;
  },
  statsID() {
    return `${this.YAHOO}/game/${CONFIG.LEAGUE_KEY.substr(0, 3)}/stat_categories`;
  },
  roster() {
    return `${this.YAHOO}/team/${CONFIG.LEAGUE_KEY}.t.${CONFIG.TEAM}/roster/players`;
  },

  // Write to an external file to display output data
  writeToFile(data, file, flag) {
    if (flag === null) {
      flag = `a`;
    }
    fs.writeFile(file, data, { flag }, (err) => {
      if (err) {
        console.error(`Error in writing to ${file}: ${err}`);
      }
    });
    return 1;
  },

  // Read the Yahoo OAuth credentials file
  async readCredentials() {
    try {
      // If the credentials file exists
      if (fs.existsSync(CONFIG.AUTH_FILE)) {
        try {
          this.CREDENTIALS = JSON.parse(fs.readFileSync(CONFIG.AUTH_FILE, "utf8"));
        } catch (err) {
          console.error(`Error parsing credentials file ${CONFIG.AUTH_FILE}: ${err}.\n`);
          process.exit();
        }
      } else {
        // Get initial authorization token
        const newToken = await this.getInitialAuthorization();
        if (newToken && newToken.data && newToken.data.access_token) {
          this.writeToFile(JSON.stringify(newToken.data), CONFIG.AUTH_FILE, "w");
          this.CREDENTIALS = newToken.data;
        }
      }
    } catch (err) {
      console.error(`Error in readCredentials(): ${err}`);
      process.exit();
    }
  },

  // If no yahoo.json file, initialize first authorization
  getInitialAuthorization() {
    return axios({
      url: this.AUTH_ENDPOINT,
      method: "post",
      headers: {
        Authorization: `Basic ${this.AUTH_HEADER}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36",
      },
      data: qs.stringify({
        client_id: CONFIG.CONSUMER_KEY,
        client_secret: CONFIG.CONSUMER_SECRET,
        redirect_uri: "oob",
        code: CONFIG.YAHOO_AUTH_CODE,
        grant_type: "authorization_code",
      }),
    }).catch((err) => {
      console.error(`Error in getInitialAuthorization(): ${err}`);
    });
  },

  // If authorization token is stale, refresh it
  refreshAuthorizationToken(token) {
    return axios({
      url: this.AUTH_ENDPOINT,
      method: "post",
      headers: {
        Authorization: `Basic ${this.AUTH_HEADER}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36",
      },
      data: qs.stringify({
        redirect_uri: "oob",
        grant_type: "refresh_token",
        refresh_token: token,
      }),
    }).catch((err) => {
      console.error(`Error in refreshAuthorizationToken(): ${err}`);
    });
  },

  // Hit the Yahoo Fantasy API
  async makeAPIrequest(url) {
    let response;
    try {
      response = await axios({
        url,
        method: "get",
        headers: {
          Authorization: `Bearer ${this.CREDENTIALS.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36",
        },
      });
      const jsonData = JSON.parse(parser.toJson(response.data));
      return jsonData;
    } catch (err) {
      if (err.response.data && err.response.data.error && err.response.data.error.description && err.response.data.error.description.includes("token_expired")) {
        const newToken = await this.refreshAuthorizationToken(this.CREDENTIALS.refresh_token);
        if (newToken && newToken.data && newToken.data.access_token) {
          this.CREDENTIALS = newToken.data;
          this.writeToFile(JSON.stringify(newToken.data), CONFIG.AUTH_FILE, "w");
          return this.makeAPIrequest(url, newToken.data.access_token, newToken.data.refresh_token);
        }
      } else {
        console.error(`Error with credentials in makeAPIrequest()/refreshAuthorizationToken(): ${err}`);
      }
      return err;
    }
  },

  // Get a list of free agents
  async getFreeAgents() {
    try {
      const freeAgentLimit = CONFIG.FREE_AGENTS && /\d/.test(CONFIG.FREE_AGENTS) ? parseInt(CONFIG.FREE_AGENTS, 10) : 0;
      const promises = [];

      for (let i = 0; i <= freeAgentLimit; i++) {
        const reqUrl = this.freeAgents(freeAgentLimit);
        promises.push(this.makeAPIrequest(reqUrl));
      }
      const completedPromises = await Promise.all(promises);
      const results = [];
      completedPromises.forEach((result) => {
        if (result.fantasy_content && result.fantasy_content.league && result.fantasy_content.league.players && result.fantasy_content.league.players.player) {
          results.push(...result.fantasy_content.league.players.player);
        }
      });
      return results;
    } catch (err) {
      console.error(`Error in getFreeAgents(): ${err}`);
      return err;
    }
  },

  // Get a list of players on my team
  async getMyPlayers() {
    try {
      const results = await this.makeAPIrequest(this.myTeam());
      return results.fantasy_content.team.roster.players.player;
    } catch (err) {
      console.error(`Error in getMyPlayers(): ${err}`);
      return err;
    }
  },

  // Get my weekly stats
  async getMyWeeklyStats() {
    try {
      const results = await this.makeAPIrequest(this.myWeeklyStats());
      return results.fantasy_content.team.team_stats.stats.stat;
    } catch (err) {
      console.error(`Error in getMyweeklyStats(): ${err}`);
      return err;
    }
  },

  // Get my scoreboard
  async getMyScoreboard() {
    try {
      const results = await this.makeAPIrequest(this.scoreboard());
      return results.fantasy_content.league.scoreboard.matchups.matchup;
    } catch (err) {
      console.error(`Error in getMyweeklyScoreboard(): ${err}`);
      return err;
    }
  },

  // Get a JSON object of your players
  async getMyPlayersStats() {
    try {
      const players = await this.getMyPlayers(this.myTeam());

      // Build the list
      let playerIDList = "";
      if (players) {
        players.forEach((player) => {
          playerIDList += `${player.player_key},`;
        });

        // Remove trailing comma
        playerIDList = playerIDList.substring(0, playerIDList.length - 1);

        const playerStats = `${this.YAHOO}/players;player_keys=${playerIDList};out=stats`;

        return await this.makeAPIrequest(playerStats);
      }
      return "Error";
    } catch (err) {
      console.error(`Error in getMyPlayersStats(): ${err}`);
      return err;
    }
  },

  // Get what week it is in the season
  async getCurrentWeek() {
    try {
      const results = await this.makeAPIrequest(this.metadata());
      return results.fantasy_content.league.current_week;
    } catch (err) {
      console.error(`Error in getCurrentWeek(): ${err}`);
      return err;
    }
  },

  // Get the numerical prefix for the league. Was 388 in 2019
  async getLeaguePrefix() {
    try {
      const results = await this.makeAPIrequest(this.gameKey());
      return results.fantasy_content.game.game_id;
    } catch (err) {
      console.error(`Error in getLeaguePrefix(): ${err}`);
      return err;
    }
  },

  // Get the adds, drops and trades
  async getTransactions() {
    try {
      const results = await this.makeAPIrequest(this.transactions());
      return results.fantasy_content.league.transactions;
    } catch (err) {
      console.error(`Error in getTransactions(): ${err}`);
      return err;
    }
  },

  // Get user info
  async getUserInfo() {
    try {
      const results = await this.makeAPIrequest(this.user());
      return results.fantasy_content.users.user.games;
    } catch (err) {
      console.error(`Error in getUserInfo(): ${err}`);
      return err;
    }
  },

  // Get stats IDs
  async getStatsIDs() {
    try {
      const results = await this.makeAPIrequest(this.statsID());
      return results.fantasy_content.game.stat_categories.stats;
    } catch (err) {
      console.error(`Error in getStatsIDs(): ${err}`);
      return err;
    }
  },

  // See who's starting on your team
  async getCurrentRoster() {
    try {
      const results = await this.makeAPIrequest(this.roster());
      return results.fantasy_content.team.roster.players;
    } catch (err) {
      console.error(`Error in getCurrentRoster(): ${err}`);
      return err;
    }
  },
};
