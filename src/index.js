const fs = require("fs");
const yahoo = require("./yahooFantasyBaseball");

const getData = async () => {
  try {
    // Read credentials file or get new authorization token
    await yahoo.yfbb.readCredentials();

    // If crededentials exist
    if (yahoo.yfbb.CREDENTIALS) {
      yahoo.yfbb.WEEK = await yahoo.yfbb.getCurrentWeek();
      console.log(`Getting current week...`);

      const freeAgents = await yahoo.yfbb.getFreeAgents();
      console.log(`Getting free agents...`);

      const myPlayers = await yahoo.yfbb.getMyPlayers();
      console.log(`Getting a list of my players...`);

      const myPlayersStats = await yahoo.yfbb.getMyPlayersStats();
      console.log(`Getting my players' stats...`);

      const myScoreboard = await yahoo.yfbb.getMyScoreboard();
      console.log(`Getting the scoreboard...`);

      const statsIDs = await yahoo.yfbb.getStatsIDs();
      console.log(`Getting the ID mapping of the stats...`);

      const currentRoster = await yahoo.yfbb.getCurrentRoster();
      console.log(`Getting my current roster...`);

      const transactions = await yahoo.yfbb.getTransactions();
      console.log(`Getting a list of transactions...`);

      const allData = {
        "free agents": freeAgents,
        "my players": myPlayers,
        "my players' stats": myPlayersStats,
        "my scoreboard": myScoreboard,
        "stat IDs": statsIDs,
        "current roster": currentRoster,
        transactions,
      };

      const data = JSON.stringify(allData);

      const outputFile = "./allMyData.json";

      // Writing to file
      fs.writeFile(outputFile, data, { flag: "w" }, (err) => {
        if (err) {
          console.error(`Error in writing to ${outputFile}: ${err}`);
        } else {
          console.error(`Data successfully written to ${outputFile}.`);
        }
      });
    }
  } catch (err) {
    console.error(`Error in getData(): ${err}`);
  }
};

getData();
