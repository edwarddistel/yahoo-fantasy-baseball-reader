<?php

// League ID for Yahoo API requests
$league_key = "388.l.xxxxxxxxxx";
$consumer_key = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
$consumer_secret = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
$auth_header = base64_encode($consumer_key . ":" . $consumer_secret);
$auth_endpoint = "https://api.login.yahoo.com/oauth2/get_token";
$inital_auth_code = "xxxxxxx";
$team = "1";

function writeToFile($auth_data) {
	$fp = fopen('yahoo.json', 'w');
	fwrite($fp, $auth_data);
	fclose($fp);
}

function getInitialAuthorizationToken() {

	$ch = curl_init();

	$post_values = [
		"client_id" => $GLOBALS['consumer_key'],
		"client_secret" => $GLOBALS['consumer_secret'],
		"redirect_uri" => "oob",
		"code" => $GLOBALS['initial_auth_code'],
		"grant_type" => "authorization_code"
	];

	curl_setopt_array($ch, array(
	    CURLOPT_RETURNTRANSFER => 1,
	    CURLOPT_URL => $GLOBALS['auth_endpoint'],
	    CURLOPT_POST => 1,
	    CURLOPT_HTTPHEADER => array(
	    'Authorization: Basic ' . $GLOBALS['auth_header'],
	    'Content-Type: application/x-www-form-urlencoded',
	    'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36'),
	    CURLOPT_POSTFIELDS => http_build_query($post_values)
	));

	$answer = curl_exec($ch);
	if (isset($answer)) writeToFile($answer);

	if (!isset($access_token)) {
		// ERROR LOGGING

	}
	else {
		return $token;
	}

}

function refreshAuthorizationToken($token) {

	$ch = curl_init();

	$post_values = [
		"redirect_uri" => "oob",
		"grant_type" => "refresh_token",
		"refresh_token" => $token
	];

	curl_setopt_array($ch, array(
	    CURLOPT_RETURNTRANSFER => 1,
	    CURLOPT_URL => $GLOBALS['auth_endpoint'],
	    CURLOPT_POST => 1,
	    CURLOPT_HTTPHEADER => array(
	    'Authorization: Basic ' . $GLOBALS['auth_header'],
	    'Content-Type: application/x-www-form-urlencoded',
	    'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36'),
	    CURLOPT_POSTFIELDS => http_build_query($post_values)
	));

	$answer = curl_exec($ch);
	if (isset($answer)) writeToFile($answer);
	$token = json_decode($answer);

	if (!isset($access_token)) {
		// ERROR LOGGING

	}
	else {
		return $token;
	}
}


function makeAPIrequest($url, $access_token, $refresh_token) {
	$curl = curl_init();

	curl_setopt_array($curl, array(
	    CURLOPT_RETURNTRANSFER => 1,
	    CURLOPT_URL => $url,
	    CURLOPT_HTTPHEADER => array('authorization: Bearer ' . $access_token,
	    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	    'Accept-Language: en-US,en;q=0.5',
	    'Cache-Control: no-cache',
	    'Content-Type: application/x-www-form-urlencoded; charset=utf-8',
	    'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:28.0) Gecko/20100101 Firefox/28.0'),
	));

	$resp = curl_exec($curl);

	if (strpos($resp, "token_expired")) {
		$new_token = refreshAuthorizationToken($refresh_token);
		if (isset($new_token)) makeAPIrequest($url, $new_token->access_token, $new_token->refresh_token);		
	} else {
		$xml = simplexml_load_string($resp, "SimpleXMLElement", LIBXML_NOCDATA);
		$json = json_encode($xml);
		$items = json_decode($json,TRUE);
		curl_close($curl);
		return $items;
	}

}

// Get Yahoo API credentials
$credentials = json_decode(file_get_contents("yahoo.json"));
$access_token = $credentials->access_token;
$refresh_token = $credentials->refresh_token;


// Use game_key to find the prefix for which to hit the API
$game_key = "https://fantasysports.yahooapis.com/fantasy/v2/game/mlb";

// Get current week - $results["league"]["current_week"]
$metadata = "https://fantasysports.yahooapis.com/fantasy/v2/league/". $league_key ."/metadata";
$week_raw = makeAPIrequest($metadata, $access_token, $refresh_token);
$week = $week_raw["league"]["current_week"];
echo $week;

// List of available players in the league; need to cycle through batches of 25
$players = "https://fantasysports.yahooapis.com/fantasy/v2/league/". $league_key ."/players;status=FA;start=0;sort=OR";

// Get the players on my team
$my_team = "https://fantasysports.yahooapis.com/fantasy/v2/team/". $league_key . ".t.". $team ."/roster";

// Get my team's weekly stats
$my_stats = "https://fantasysports.yahooapis.com/fantasy/v2/team/". $league_key . ".t.". $team ."/stats";

// Get scoreboard
$scoreboard = "http://fantasysports.yahooapis.com/fantasy/v2/league/". $league_key . "/scoreboard;week=" . $week; 

// Get available ploayers
$player = "https://fantasysports.yahooapis.com/fantasy/v2/league/". $league_key ."/players;player_keys=388.p.8861/stats";

$results = makeAPIrequest($players, $access_token, $refresh_token);

writeToFile(json_encode($results));


?>