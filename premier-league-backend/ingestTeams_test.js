require('dotenv').config(); // Ensure this is at the very top if using environment variables
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// openfootball/football.json API configuration for teams (source for historical teams)
const FOOTBALL_JSON_BASE_URL = process.env.FOOTBALL_JSON_BASE_URL;

// Define the range of seasons to extract teams from
const START_SEASON_YEAR = 2010;
const END_SEASON_YEAR = 2025;

async function ingestTeams() {
    console.log(`Starting historical team ingestion from football.json for seasons ${START_SEASON_YEAR}-${String((START_SEASON_YEAR % 100) + 1).padStart(2, '0')} to ${END_SEASON_YEAR}-${String((END_SEASON_YEAR % 100) + 1).padStart(2, '0')}`);
    let client;
    const uniqueTeamNames = new Set();

    try {
        client = await pool.connect();
        console.log('Database connection established.');

        for (let year = START_SEASON_YEAR; year <= END_SEASON_YEAR; year++) {
            const nextYearLastTwoDigits = String((year % 100) + 1).padStart(2, '0');
            const seasonString = `${year}-${nextYearLastTwoDigits}`;
            const apiUrl = `${FOOTBALL_JSON_BASE_URL}/${seasonString}/en.1.json`;
            console.log(`\n--- Fetching fixture data for season ${seasonString} to extract team names from: ${apiUrl} ---`);

            try {
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    if (response.status === 404) {
                        console.warn(`No fixture data file found for season ${seasonString} at ${apiUrl}. Skipping this season for team extraction.`);
                        continue;
                    }
                    const errorText = await response.text();
                    throw new Error(`API request failed for season ${seasonString}: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json();
                console.log(`JSON data received for ${seasonString} (first 200 chars):`);
                console.log(JSON.stringify(data).substring(0, 200) + '...');

                if (!data.matches || data.matches.length === 0) {
                    console.warn(`No matches found in the file for season '${seasonString}'. Skipping this season for team extraction.`);
                    continue;
                }

                for (const matchData of data.matches) {
                    if (matchData.team1) {
                        uniqueTeamNames.add(matchData.team1);
                    }
                    if (matchData.team2) {
                        uniqueTeamNames.add(matchData.team2);
                    }
                }

                console.log(`Extracted team names from season ${seasonString}. Total unique teams found so far: ${uniqueTeamNames.size}`);

            } catch (apiError) {
                console.error(`Error fetching or processing season ${seasonString} from API for team extraction:`, apiError.message);
                if (apiError.response && typeof apiError.response.text === 'function') {
                    console.error('Full API Response Text:', await apiError.response.text());
                } else if (apiError.body) {
                    console.error('Full API Response Body:', apiError.body);
                }
            }
        }

        console.log(`\nFinished gathering all unique team names. Total unique teams to ingest: ${uniqueTeamNames.size}`);
        console.log('Proceeding to insert/update teams in the database.');

        for (const teamName of uniqueTeamNames) {
            // *** CHANGE 1: Querying 'test_teams' ***
            const checkRes = await client.query('SELECT team_id FROM test_teams WHERE name = $1', [teamName]);

            if (checkRes.rows.length === 0) {
                const insertQuery = `
                    -- *** CHANGE 2: Inserting into 'test_teams' ***
                    INSERT INTO test_teams (name, short_code, city, stadium, logo_url)
                    VALUES ($1, NULL, NULL, NULL, NULL)
                    RETURNING team_id;
                `;
                const res = await client.query(insertQuery, [teamName]);
                console.log(`Inserted team: ${teamName} with ID: ${res.rows[0].team_id} into test_teams.`); // Added console output for clarity
            } else {
                console.log(`Team '${teamName}' already exists in test_teams. Skipping insertion.`); // Added console output for clarity
            }
        }

        console.log('Historical team ingestion into test_teams completed successfully!'); // Added console output for clarity

    } catch (dbError) {
        console.error('Error during historical team ingestion (DB connection or initial data load):', dbError.message);
    } finally {
        if (client) {
            client.release();
        }
        pool.end();
    }
}

// Call the main ingestion function
ingestTeams();