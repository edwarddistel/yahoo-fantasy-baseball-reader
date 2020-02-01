const fs = require('fs');
const qs = require('qs');
const axios = require('axios');
const parser = require('xml2json');
const CONFIG = require('./config.json');


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
    gameKey: function () { return `${this.YAHOO}/game/mlb` },
    freeAgents: function () { return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/players;status=FA;start=0;sort=OR`},
    myTeam: function () { return `${this.YAHOO}/team/${CONFIG.LEAGUE_KEY}.t.${CONFIG.TEAM}/roster/`}, 
    myWeeklyStats: function () { return `${this.YAHOO}/team/${CONFIG.LEAGUE_KEY}.t.${CONFIG.TEAM}/stats;type=week;week=${this.WEEK}`},
    scoreboard: function () { return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/scoreboard;week=${this.WEEK}`}, 
    metadata: function () { return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/metadata`},
    transactions: function () { return `${this.YAHOO}/league/${CONFIG.LEAGUE_KEY}/transactions;types=add,trade,drop`;},
    user: function () { return `${this.YAHOO}/users;use_login=1/games`},
    statsID: function () { return `${this.YAHOO}/game/${CONFIG.LEAGUE_KEY.substr(0, 3)}/stat_categories` },
    roster: function () { return `${this.YAHOO}/team/${CONFIG.LEAGUE_KEY}.t.${CONFIG.TEAM}/roster/players` },
    

    // Write to an external file to display output data
    writeToFile: function (data, file, flag) {
        if (flag === null) flag = `a`;
        fs.writeFile(file, data, {flag: flag}, (err) => {
            if (err) {
                console.error(`Error in writing to ${file}: ${err}`);
            }
        });
        return 1;
    },

     
    // Read the Yahoo OAuth credentials file
    readCredentials: async function () {
        try {
            // If the credentials file exists
            if (fs.existsSync(CONFIG.AUTH_FILE)) {
                try {
                    this.CREDENTIALS = JSON.parse(fs.readFileSync(CONFIG.AUTH_FILE, 'utf8'));
                } catch (err) {
                    console.error(`Error parsing credentials file ${CONFIG.AUTH_FILE}: ${err}.\n`);
                    process.exit();
                }
            } else {
                // Get initial authorization token
                const newToken = await this.getInitialAuthorization();
                if (newToken && newToken.data && newToken.data.access_token) {
                    this.writeToFile(JSON.stringify(newToken.data), CONFIG.AUTH_FILE, 'w');
                    this.CREDENTIALS = newToken.data;
                }
            }
        } catch(err) {
            console.error(`Error in readCredentials(): ${err}`);
            process.exit();
        }   
    },   

    // If no yahoo.json file, initialize first authorization
    getInitialAuthorization: function () {
        return axios({
            url: this.AUTH_ENDPOINT,
            method: 'post',
            headers: {
                'Authorization': `Basic ${this.AUTH_HEADER}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36',
            },
            data: qs.stringify({
                client_id: CONFIG.CONSUMER_KEY,
                client_secret: CONFIG.CONSUMER_SECRET,
                redirect_uri: 'oob',
                code: CONFIG.YAHOO_AUTH_CODE,
                grant_type: 'authorization_code'
            }),
            }).catch((err) => {
                console.error(`Error in getInitialAuthorization(): ${err}`);
            });
    },

    // If authorization token is stale, refresh it 
    refreshAuthorizationToken: function (token) {
        return axios({
            url: this.AUTH_ENDPOINT,
            method: 'post',
            headers: {
                'Authorization': `Basic ${this.AUTH_HEADER}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36',
            },
            data: qs.stringify({
                redirect_uri: 'oob',
                grant_type: 'refresh_token',
                refresh_token: token
            }),
        }).catch((err) => {
            console.error(`Error in refreshAuthorizationToken(): ${err}`);
        });       
    },

    // Hit the Yahoo Fantasy API
    makeAPIrequest: async function (url) {
        let response;
        try {
            response = await axios({
            url: url,
                method: 'get',
                headers: {
                    'Authorization': `Bearer ${this.CREDENTIALS.access_token}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36',
                },
            });
            const jsonData = JSON.parse(parser.toJson(response.data));
            return jsonData;
        } catch (err) {
            if (err.response.data && err.response.data.error && err.response.data.error.description && err.response.data.error.description.includes("token_expired")) {
                const newToken = await this.refreshAuthorizationToken(this.CREDENTIALS.refresh_token);
                if (newToken && newToken.data && newToken.data.access_token) {
                    this.CREDENTIALS = newToken.data;
                    this.writeToFile(JSON.stringify(newToken.data), CONFIG.AUTH_FILE, 'w');
                    return this.makeAPIrequest(url, newToken.data.access_token, newToken.data.refresh_token);
    
                 }
            } else {
                console.error(`Error with credentials in makeAPIrequest()/refreshAuthorizationToken(): ${err}`);
                process.exit();
            }
        }
    },


    // Get a list of free agents
    getFreeAgents: async function () {
        try {
            const results = await this.makeAPIrequest(this.freeAgents());
            return results.fantasy_content.league.players
        
        } catch (err) {
            console.error(`Error in getFreeAgents(): ${err}`);
        }
    },

    // Get a list of players on my team
    getMyPlayers: async function () {
        try {
            const results = await this.makeAPIrequest(this.myTeam());
            return results.fantasy_content.team.roster.players.player;    
        } catch (err) {
            console.error(`Error in getMyPlayers(): ${err}`);
        }
    },

    // Get my weekly stats
    getMyWeeklyStats: async function ()  {
        try {
            const results = await this.makeAPIrequest(this.myWeeklyStats());
            return results.fantasy_content.team.team_stats.stats.stat;    
        } catch (err) {
            console.error(`Error in getMyweeklyStats(): ${err}`);
        }
    },

    // Get my scoreboard
    getMyScoreboard: async function ()  {
        try {
            const results = await this.makeAPIrequest(this.scoreboard());
            return results.fantasy_content.league.scoreboard.matchups.matchup;
        } catch (err) {
            console.error(`Error in getMyweeklyScoreboard(): ${err}`);
        }
    },
    
    // Get a JSON object of your players
    getMyPlayersStats: async function () {
        try {
            const players = await this.getMyPlayers(this.myTeam());

            // Build the list
            let playerIDList = "";
            if (players) {
                players.forEach((player) => {
                    playerIDList += `${player.player_key},`;
                });
            
                // Remove trailing comma
                playerIDList = playerIDList.substring(0, playerIDList.length -1);
            
                const playerStats = `${this.YAHOO}/players;player_keys=${playerIDList};out=stats`;

                return await this.makeAPIrequest(playerStats);
            }
        
        } catch (err) {
            console.error(`Error in getMyPlayersStats(): ${err}`);
        }
    },

    // Get what week it is in the season
    getCurrentWeek: async function() {
        try {
            const results = await this.makeAPIrequest(this.metadata());
            return results.fantasy_content.league.current_week;
        } catch (err) {
            console.error(`Error in getCurrentWeek(): ${err}`);
        }
    },

    // Get the numerical prefix for the league. Was 388 in 2019
    getLeaguePrefix: async function () {
        try {
            const results = await this.makeAPIrequest(this.gameKey());
            return results.fantasy_content.game.game_id;    
        } catch (err) {
            console.error(`Error in getLeaguePrefix(): ${err}`);
        }
    },


    // Get the adds, drops and trades
    getTransactions: async function () {
        try {
            const results = await this.makeAPIrequest(this.transactions());
            return results.fantasy_content.league.transactions;    
        } catch (err) {
            console.error(`Error in getTransactions(): ${err}`);
        }
    },

    // Get user info
    getUserInfo: async function () {
        try {
            const results = await this.makeAPIrequest(this.user());
            return results.fantasy_content.users.user.games;    
        } catch (err) {
            console.error(`Error in getUserInfo(): ${err}`);
        }
    },

    // Get stats IDs
    getStatsIDs: async function () {
        try {
            const results = await this.makeAPIrequest(this.statsID());
            return results.fantasy_content.game.stat_categories.stats;    
        } catch (err) {
            console.error(`Error in getStatsIDs(): ${err}`);
        }
    },

    // See who's starting on your team
    getCurrentRoster: async function () {
        try {
            const results = await this.makeAPIrequest(this.roster());
            return results.fantasy_content.team.roster.players;    
        } catch (err) {
            console.error(`Error in getCurrentRoster(): ${err}`);
        }
    }    
};