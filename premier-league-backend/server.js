// backend/server.js
require('dotenv').config({ path: '../.env' }); // Load .env from parent directory

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration (allow requests from your frontend)
app.use(cors({
    origin: 'http://localhost:3000' // React app will run on port 3000 by default
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// Database connection configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Test DB connection
pool.connect()
    .then(client => {
        console.log('Backend connected to PostgreSQL database!');
        client.release();
    })
    .catch(err => {
        console.error('Error connecting to PostgreSQL database:', err.message);
        console.error('Check your .env file and database credentials.');
    });

// API Routes
app.get('/', (req, res) => {
    res.send('Welcome to the FPL Data API!');
});

// New API endpoint: Get all teams
app.get('/api/teams', async (req, res) => {
    try {
        const result = await pool.query('SELECT team_id, name FROM teams ORDER BY name ASC;');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching teams:', err.message);
        res.status(500).json({ error: 'Internal server error fetching teams' });
    }
});


// Enhanced API endpoint: Get players with filters and sorting
app.get('/api/players', async (req, res) => {
    try {
        const { position, team_id, status, sort_by, order } = req.query; // Extract query parameters

        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

        // Add filters based on query parameters
        if (position) {
            whereClauses.push(`position = $${paramIndex++}`);
            queryParams.push(position);
        }
        if (team_id) {
            whereClauses.push(`team_id = $${paramIndex++}`);
            queryParams.push(parseInt(team_id)); // Ensure it's an integer
        }
        if (status) { // FPL statuses: 'a' (available), 'i' (injured), 'd' (doubtful), 's' (suspended)
            whereClauses.push(`status = $${paramIndex++}`);
            queryParams.push(status);
        }

        let query = `
            SELECT
                p.player_id,
                p.fpl_id,
                p.web_name,
                p.first_name,
                p.last_name,
                p.position,
                p.now_cost,
                p.total_points,
                p.goals_scored,
                p.assists,
                p.minutes,
                p.yellow_cards,
                p.red_cards,
                p.form,
                p.chance_of_playing_next_round,
                p.status,
                p.news,
                t.name AS team_name -- Join to get team name
            FROM
                players p
            JOIN
                teams t ON p.team_id = t.team_id
        `;

        // Add WHERE clause if filters exist
        if (whereClauses.length > 0) {
            query += ` WHERE ` + whereClauses.join(' AND ');
        }

        // Add ORDER BY clause
        let orderByField = 'total_points'; // Default sort
        let orderDirection = 'DESC';       // Default order

        if (sort_by) {
            // Validate sort_by field to prevent SQL injection
            const validSortFields = [
                'total_points', 'now_cost', 'goals_scored', 'assists',
                'minutes', 'form', 'web_name', 'position', 'news'
            ];
            if (validSortFields.includes(sort_by)) {
                orderByField = sort_by;
            } else {
                console.warn(`Invalid sort_by field received: ${sort_by}. Defaulting to total_points.`);
            }
        }

        if (order && (order.toUpperCase() === 'ASC' || order.toUpperCase() === 'DESC')) {
            orderDirection = order.toUpperCase();
        }

        query += ` ORDER BY ${orderByField} ${orderDirection}, p.web_name ASC`; // Add secondary sort for consistency

        query += ` LIMIT 100;`; // Limit for testing, remove/adjust for production

        console.log("Executing query:", query, "with params:", queryParams); // For debugging
        const result = await pool.query(query, queryParams);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching players with filters:', err.message);
        res.status(500).json({ error: 'Internal server error fetching players' });
    }
});


app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
});