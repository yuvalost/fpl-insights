require('dotenv').config();
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

// FPL API configuration
const FPL_API_BASE_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

async function ingestTeams() {
    console.log('Starting team ingestion from FPL API.');
    let client;
    const teamsToIngest = []; // Will store { name: '...', short_code: '...' }

    try {
        client = await pool.connect();
        console.log('Database connection established.');

        const apiUrl = FPL_API_BASE_URL;
        console.log(`\n--- Fetching team data from: ${apiUrl} ---`);

        try {
            const response = await fetch(apiUrl);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`JSON data received (first 200 chars):`);
            console.log(JSON.stringify(data).substring(0, 200) + '...');

            if (!data.teams || data.teams.length === 0) {
                console.warn('No teams found in the FPL API response. Exiting team ingestion.');
                return;
            }

            // Extract team names and short codes from the FPL API response
            for (const teamData of data.teams) {
                if (teamData.name && teamData.short_name) {
                    teamsToIngest.push({
                        name: teamData.name,
                        short_code: teamData.short_name
                    });
                }
            }

            console.log(`Extracted team names and short codes from FPL API. Total unique teams found: ${teamsToIngest.length}`);

        } catch (apiError) {
            console.error('Error fetching or processing data from FPL API for team extraction:', apiError.message);
            if (apiError.response && typeof apiError.response.text === 'function') {
                console.error('Full API Response Text:', await apiError.response.text());
            } else if (apiError.body) {
                console.error('Full API Response Body:', apiError.body);
            }
        }

        console.log(`\nFinished gathering all unique team names and short codes. Total teams to ingest/update: ${teamsToIngest.length}`);
        console.log('Proceeding to insert/update teams in the database.');

        let insertedCount = 0;
        let updatedCount = 0;

        for (const team of teamsToIngest) {
            // Using UPSERT (ON CONFLICT) to update existing rows or insert new ones
            const upsertQuery = `
                INSERT INTO teams (name, short_code, city, stadium, logo_url, created_at, updated_at)
                VALUES ($1, $2, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (name) DO UPDATE SET
                    short_code = EXCLUDED.short_code,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING team_id, xmax; -- xmax is 0 for insert, >0 for update
            `;
            try {
                const res = await client.query(upsertQuery, [team.name, team.short_code]);
                if (res.rows[0].xmax === '0') { // Check xmax for new insert
                    insertedCount++;
                    console.log(`Inserted team: ${team.name} (Short Code: ${team.short_code}) with ID: ${res.rows[0].team_id}`);
                } else {
                    updatedCount++;
                    console.log(`Updated team: ${team.name} (Short Code: ${team.short_code}) with ID: ${res.rows[0].team_id}`);
                }
            } catch (dbError) {
                console.error(`Error upserting team ${team.name}:`, dbError.message);
            }
        }

        console.log('\nTeam ingestion completed successfully!');
        console.log(`Total teams inserted: ${insertedCount}`);
        console.log(`Total teams updated: ${updatedCount}`);


    } catch (dbError) {
        console.error('Error during team ingestion (DB connection or initial data load):', dbError.message);
    } finally {
        if (client) {
            client.release();
        }
        pool.end();
    }
}

// Call the main ingestion function
ingestTeams();