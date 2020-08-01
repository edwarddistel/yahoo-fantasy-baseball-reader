const yahoo = require("./yahooFantasyBaseball");

const getData = async () => {
  try {
    // Read credentials file or get new authorization token
    await yahoo.yfbb.readCredentials();

    // If crededentials exist
    if (yahoo.yfbb.CREDENTIALS) {
      // Output the league prefix
      console.log(await yahoo.yfbb.getLeaguePrefix());
    }
  } catch (err) {
    console.error(`Error in getData(): ${err}`);
  }
};

getData();
