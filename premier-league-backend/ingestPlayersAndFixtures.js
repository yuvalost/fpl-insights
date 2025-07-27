require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// FPL API Endpoints
const FPL_STATIC_API_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FPL_FIXTURES_API_URL = 'https://fantasy.premierleague.com/api/fixtures/';
// New API endpoint for individual player history
const FPL_ELEMENT_SUMMARY_API_URL = 'https://fantasy.premierleague.com/api/element-summary/';

// Utility function to add a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ingestPlayersAndFixtures() {
    console.log('Starting player and fixture ingestion from FPL API.');
    let client;

    try {
        client = await pool.connect();
        console.log('Database connection established.');

        // 1. Get our local team_id to FPL team name mapping from our database
        const localTeamsRes = await client.query('SELECT team_id, name FROM teams;');
        const localTeamNamesMap = new Map(localTeamsRes.rows.map(row => [row.name, row.team_id]));
        console.log(`Loaded ${localTeamNamesMap.size} teams from local database.`);

        // 2. Fetch FPL Static Data (contains players and FPL team IDs/names)
        console.log('\n--- Fetching FPL Static Data (Players & Team Mappings) ---');
        const staticResponse = await fetch(FPL_STATIC_API_URL);
        if (!staticResponse.ok) {
            throw new Error(`FPL Static API request failed: ${staticResponse.status} ${staticResponse.statusText}`);
        }
        const staticData = await staticResponse.json();
        console.log('FPL Static data received.');

        // Build FPL Team ID to Local Team ID mapping
        const fplIdToLocalTeamIdMap = new Map();
        // Also build a map from FPL team ID to FPL team name for opponent mapping
        const fplIdToFplTeamNameMap = new Map();

        staticData.teams.forEach(fplTeam => {
            const localTeamId = localTeamNamesMap.get(fplTeam.name);
            fplIdToFplTeamNameMap.set(fplTeam.id, fplTeam.name); // Store FPL ID to FPL name
            if (localTeamId) {
                fplIdToLocalTeamIdMap.set(fplTeam.id, localTeamId);
            } else {
                console.warn(`Warning: Could not find local team_id for FPL team name '${fplTeam.name}' (FPL ID: ${fplTeam.id}). This team's players/fixtures might not be linked correctly.`);
            }
        });
        console.log(`Built mapping for ${fplIdToLocalTeamIdMap.size} FPL Team IDs to Local Team IDs.`);

        // Build FPL Element Type ID to Position name mapping
        const positionMap = new Map(staticData.element_types.map(type => [type.id, type.singular_name]));
        console.log(`Built mapping for ${positionMap.size} player positions.`);

        // --- Ingest Players ---
        console.log('\n--- Ingesting Player Data ---');
        let playersInserted = 0;
        let playersUpdated = 0;

        for (const player of staticData.elements) {
            const teamId = fplIdToLocalTeamIdMap.get(player.team);
            const position = positionMap.get(player.element_type);

            if (!teamId) {
                console.warn(`Skipping player ${player.web_name} (FPL ID: ${player.id}) as team_id not found for FPL Team ID: ${player.team}`);
                continue;
            }

            const upsertPlayerQuery = `
                INSERT INTO players (
                    fpl_id, team_id, first_name, last_name, web_name, position,
                    goals_scored, assists, total_points, minutes, yellow_cards, red_cards,
                    now_cost, form, chance_of_playing_next_round, status, news,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (fpl_id) DO UPDATE SET
                    team_id = EXCLUDED.team_id,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    web_name = EXCLUDED.web_name,
                    position = EXCLUDED.position,
                    goals_scored = EXCLUDED.goals_scored,
                    assists = EXCLUDED.assists,
                    total_points = EXCLUDED.total_points,
                    minutes = EXCLUDED.minutes,
                    yellow_cards = EXCLUDED.yellow_cards,
                    red_cards = EXCLUDED.red_cards,
                    now_cost = EXCLUDED.now_cost,
                    form = EXCLUDED.form,
                    chance_of_playing_next_round = EXCLUDED.chance_of_playing_next_round,
                    status = EXCLUDED.status,
                    news = EXCLUDED.news,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING player_id, xmax;
            `;

            const values = [
                player.id,
                teamId,
                player.first_name,
                player.second_name, // 'last_name' in FPL API is second_name
                player.web_name,
                position,
                player.goals_scored,
                player.assists,
                player.total_points,
                player.minutes,
                player.yellow_cards,
                player.red_cards,
                player.now_cost / 10.0, // FPL cost is in tenths (e.g., 55 for 5.5m), convert to decimal
                parseFloat(player.form),
                player.chance_of_playing_next_round,
                player.status,
                player.news
            ];

            try {
                const res = await client.query(upsertPlayerQuery, values);
                if (res.rows[0].xmax === '0') {
                    playersInserted++;
                } else {
                    playersUpdated++;
                }
            } catch (err) {
                console.error(`Error upserting player ${player.web_name} (FPL ID: ${player.id}):`, err.message);
            }
        }
        console.log(`Player ingestion complete. Inserted: ${playersInserted}, Updated: ${playersUpdated}`);

        // --- Ingest Player Gameweek History ---
        console.log('\n--- Ingesting Player Gameweek History Data ---');
        let gameweekStatsInserted = 0;
        let gameweekStatsUpdated = 0;

        for (const player of staticData.elements) { // Loop through all players again
            const player_fpl_id = player.id;
            const player_web_name = player.web_name;
            const local_player_id_res = await client.query('SELECT player_id FROM players WHERE fpl_id = $1;', [player_fpl_id]);
            
            if (local_player_id_res.rows.length === 0) {
                console.warn(`Skipping gameweek history for ${player_web_name} (FPL ID: ${player_fpl_id}) as local player_id not found.`);
                continue;
            }
            const local_player_id = local_player_id_res.rows[0].player_id;

            await delay(50); // Be kind to the API, wait 50ms between player requests

            try {
                const summaryResponse = await fetch(`${FPL_ELEMENT_SUMMARY_API_URL}${player_fpl_id}/`);
                if (!summaryResponse.ok) {
                    console.error(`Failed to fetch summary for player ${player_web_name} (FPL ID: ${player_fpl_id}): ${summaryResponse.status} ${summaryResponse.statusText}`);
                    continue;
                }
                const summaryData = await summaryResponse.json();

                if (summaryData.history && summaryData.history.length > 0) {
                    for (const historyEntry of summaryData.history) {
                        const opponent_fpl_id = historyEntry.opponent_team;
                        const opponent_team_name = fplIdToFplTeamNameMap.get(opponent_fpl_id); // Get FPL name for opponent
                        const opponent_local_team_id = localTeamNamesMap.get(opponent_team_name); // Map to local ID

                        if (!opponent_local_team_id) {
                            console.warn(`Warning: Could not find local team_id for opponent FPL ID: ${opponent_fpl_id} (Team: ${opponent_team_name}) for player ${player_web_name} in GW${historyEntry.round}. Skipping this history entry.`);
                            continue;
                        }

                        const upsertGameweekStatsQuery = `
                            INSERT INTO player_gameweek_stats (
                                player_id, gameweek, kickoff_time, opponent_team_id, was_home,
                                minutes, goals_scored, assists, clean_sheets, goals_conceded,
                                own_goals, penalties_saved, penalties_missed, yellow_cards, red_cards,
                                saves, bonus, bps, total_points, value, transfers_in, transfers_out,
                                selected_by_percent, influence, creativity, threat, ict_index,
                                created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                            ON CONFLICT (player_id, gameweek) DO UPDATE SET
                                kickoff_time = EXCLUDED.kickoff_time,
                                opponent_team_id = EXCLUDED.opponent_team_id,
                                was_home = EXCLUDED.was_home,
                                minutes = EXCLUDED.minutes,
                                goals_scored = EXCLUDED.goals_scored,
                                assists = EXCLUDED.assists,
                                clean_sheets = EXCLUDED.clean_sheets,
                                goals_conceded = EXCLUDED.goals_conceded,
                                own_goals = EXCLUDED.own_goals,
                                penalties_saved = EXCLUDED.penalties_saved,
                                penalties_missed = EXCLUDED.penalties_missed,
                                yellow_cards = EXCLUDED.yellow_cards,
                                red_cards = EXCLUDED.red_cards,
                                saves = EXCLUDED.saves,
                                bonus = EXCLUDED.bonus,
                                bps = EXCLUDED.bps,
                                total_points = EXCLUDED.total_points,
                                value = EXCLUDED.value,
                                transfers_in = EXCLUDED.transfers_in,
                                transfers_out = EXCLUDED.transfers_out,
                                selected_by_percent = EXCLUDED.selected_by_percent,
                                influence = EXCLUDED.influence,
                                creativity = EXCLUDED.creativity,
                                threat = EXCLUDED.threat,
                                ict_index = EXCLUDED.ict_index,
                                updated_at = CURRENT_TIMESTAMP
                            RETURNING player_gameweek_stat_id, xmax;
                        `;

                        const values = [
                            local_player_id,
                            historyEntry.round, // gameweek
                            historyEntry.kickoff_time,
                            opponent_local_team_id,
                            historyEntry.was_home,
                            historyEntry.minutes,
                            historyEntry.goals_scored,
                            historyEntry.assists,
                            historyEntry.clean_sheets,
                            historyEntry.goals_conceded,
                            historyEntry.own_goals,
                            historyEntry.penalties_saved,
                            historyEntry.penalties_missed,
                            historyEntry.yellow_cards,
                            historyEntry.red_cards,
                            historyEntry.saves,
                            historyEntry.bonus,
                            historyEntry.bps,
                            historyEntry.total_points,
                            historyEntry.value / 10.0, // Convert cost to decimal
                            historyEntry.transfers_in,
                            historyEntry.transfers_out,
                            parseFloat(historyEntry.selected_by_percent),
                            parseFloat(historyEntry.influence),
                            parseFloat(historyEntry.creativity),
                            parseFloat(historyEntry.threat),
                            parseFloat(historyEntry.ict_index)
                        ];

                        try {
                            const res = await client.query(upsertGameweekStatsQuery, values);
                            if (res.rows[0].xmax === '0') {
                                gameweekStatsInserted++;
                            } else {
                                gameweekStatsUpdated++;
                            }
                        } catch (err) {
                            console.error(`Error upserting gameweek stats for player ${player_web_name} (FPL ID: ${player_fpl_id}, GW${historyEntry.round}):`, err.message);
                        }
                    }
                } else {
                    console.log(`No gameweek history found for player ${player_web_name} (FPL ID: ${player_fpl_id}).`);
                }
            } catch (apiError) {
                console.error(`API error fetching summary for player ${player_web_name} (FPL ID: ${player_fpl_id}):`, apiError.message);
            }
        }
        console.log(`Gameweek stats ingestion complete. Inserted: ${gameweekStatsInserted}, Updated: ${gameweekStatsUpdated}`);


        // --- Ingest Fixtures ---
        console.log('\n--- Ingesting Fixture Data ---');
        const fixturesResponse = await fetch(FPL_FIXTURES_API_URL);
        if (!fixturesResponse.ok) {
            throw new Error(`FPL Fixtures API request failed: ${fixturesResponse.status} ${fixturesResponse.statusText}`);
        }
        const fixturesData = await fixturesResponse.json();
        console.log(`Fetched ${fixturesData.length} fixtures.`);

        let fixturesInserted = 0;
        let fixturesUpdated = 0;

        for (const fixture of fixturesData) {
            // FPL API provides team_h and team_a as FPL team IDs, map them to local team_ids
            const homeTeamLocalId = fplIdToLocalTeamIdMap.get(fixture.team_h);
            const awayTeamLocalId = fplIdToLocalTeamIdMap.get(fixture.team_a);

            if (!homeTeamLocalId) {
                console.warn(`Skipping fixture (FPL ID: ${fixture.id}): Home team FPL ID ${fixture.team_h} not mapped to a local team_id.`);
                continue;
            }
            if (!awayTeamLocalId) {
                console.warn(`Skipping fixture (FPL ID: ${fixture.id}): Away team FPL ID ${fixture.team_a} not mapped to a local team_id.`);
                continue;
            }


            const upsertFixtureQuery = `
                INSERT INTO fixtures (
                    fpl_fixture_id, gameweek, kickoff_time, home_team_id, away_team_id,
                    home_score, away_score, finished, started, difficulty,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (fpl_fixture_id) DO UPDATE SET
                    gameweek = EXCLUDED.gameweek,
                    kickoff_time = EXCLUDED.kickoff_time,
                    home_team_id = EXCLUDED.home_team_id,
                    away_team_id = EXCLUDED.away_team_id,
                    home_score = EXCLUDED.home_score,
                    away_score = EXCLUDED.away_score,
                    finished = EXCLUDED.finished,
                    started = EXCLUDED.started,
                    difficulty = EXCLUDED.difficulty,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING fixture_id, xmax;
            `;

            const values = [
                fixture.id,
                fixture.event, // gameweek
                fixture.kickoff_time,
                homeTeamLocalId,
                awayTeamLocalId,
                fixture.team_h_score,
                fixture.team_a_score,
                fixture.finished,
                fixture.started,
                fixture.team_h_difficulty, // Using home team's difficulty as a general fixture difficulty
            ];

            try {
                const res = await client.query(upsertFixtureQuery, values);
                if (res.rows[0].xmax === '0') {
                    fixturesInserted++;
                } else {
                    fixturesUpdated++;
                }
            } catch (err) {
                console.error(`Error upserting fixture (FPL ID: ${fixture.id}):`, err.message);
            }
        }
        console.log(`Fixture ingestion complete. Inserted: ${fixturesInserted}, Updated: ${fixturesUpdated}`);

        console.log('\nAll data ingestion completed successfully!');

    } catch (dbError) {
        console.error('Error during data ingestion:', dbError.message);
    } finally {
        if (client) {
            client.release();
        }
        pool.end();
    }
}

// Call the main ingestion function
ingestPlayersAndFixtures();