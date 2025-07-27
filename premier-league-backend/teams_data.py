import psycopg2

# Database connection parameters - Make sure these are correct for your setup
DB_NAME = "premier_league_db"
DB_USER = "postgres"
DB_PASSWORD = "1q2w3e4r!"
DB_HOST = "localhost"
DB_PORT = "5432"

conn = None
cursor = None

try:
    # Connect to your PostgreSQL database
    conn = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )
    cursor = conn.cursor()

    # --- Step 1: Clear the table (and associated data via CASCADE) ---
    print("Step 1: Truncating table 'teams'...")
    cursor.execute("TRUNCATE TABLE teams RESTART IDENTITY CASCADE;")
    print("Table 'teams' truncated and identity restarted.")

    # --- Step 2: Add the 'last_premier_league_year' column if it doesn't exist ---
    # This uses the IF NOT EXISTS clause, so it's safe to run multiple times.
    print("Step 2: Adding 'last_premier_league_year' column if it doesn't exist...")
    cursor.execute("""
        ALTER TABLE teams
        ADD COLUMN IF NOT EXISTS last_premier_league_year INTEGER;
    """)
    print("Column 'last_premier_league_year' checked/added.")

    # --- Step 3: Insert new data with 'name' and 'last_premier_league_year' values ---
    print("Step 3: Inserting new team data...")
    teams_to_insert = [
        ('Tottenham Hotspur', 'TOT', 'London', 'Tottenham Hotspur Stadium', 'Ange Postecoglou', 1882, 'https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg', '4-3-3', 2025),
        ('Manchester City', 'MCI', 'Manchester', 'Etihad Stadium', 'Pep Guardiola', 1880, 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg', '4-3-3', 2025),
        ('Wigan Athletic', 'WIG', 'Wigan', 'DW Stadium', '', 1932, 'https://upload.wikimedia.org/wikipedia/en/3/30/Wigan_Athletic_FC_logo.svg', '', 2013),
        ('Blackpool', 'BLP', 'Blackpool', 'Bloomfield Road', '', 1887, 'https://upload.wikimedia.org/wikipedia/en/3/3a/Blackpool_FC_logo.svg', '', 2011),
        ('Bolton Wanderers', 'BOL', 'Bolton', 'University of Bolton Stadium', '', 1874, 'https://upload.wikimedia.org/wikipedia/en/5/5e/Bolton_Wanderers_FC.svg', '', 2012),
        ('Fulham', 'FUL', 'London', 'Craven Cottage', 'Marco Silva', 1879, 'https://upload.wikimedia.org/wikipedia/en/e/e6/Fulham_FC.svg', '4-2-3-1', 2025),
        ('Wolverhampton Wanderers', 'WOL', 'Wolverhampton', 'Molineux Stadium', 'Gary O''Neil', 1877, 'https://upload.wikimedia.org/wikipedia/en/f/fc/Wolverhampton_Wanderers.svg', '4-3-3', 2025),
        ('Stoke City', 'STO', 'Stoke-on-Trent', 'Bet365 Stadium', '', 1863, 'https://upload.wikimedia.org/wikipedia/en/2/29/Stoke_City_FC_logo.svg', '', 2018),
        ('Aston Villa', 'AVL', 'Birmingham', 'Villa Park', 'Unai Emery', 1874, 'https://upload.wikimedia.org/wikipedia/en/f/f9/Aston_Villa_FC_crest_%282016%29.svg', '4-2-3-1', 2025),
        ('West Ham United', 'WHU', 'London', 'London Stadium', 'Julen Lopetegui', 1895, 'https://upload.wikimedia.org/wikipedia/en/c/c2/West_Ham_United_FC_logo.svg', '4-2-3-1', 2025),
        ('Blackburn Rovers', 'BLB', 'Blackburn', 'Ewood Park', '', 1875, 'https://upload.wikimedia.org/wikipedia/en/0/0f/Blackburn_Rovers_FC_crest.png', '', 2012),
        ('Everton', 'EVE', 'Liverpool', 'Goodison Park', 'Sean Dyche', 1878, 'https://upload.wikimedia.org/wikipedia/en/7/7c/Everton_FC_logo.svg', '4-4-2', 2025),
        ('Sunderland', 'SUN', 'Sunderland', 'Stadium of Light', 'Michael Beale', 1879, 'https://upload.wikimedia.org/wikipedia/en/6/6e/Sunderland_AFC_logo.svg', '', 2025),
        ('Birmingham City', 'BIR', 'Birmingham', 'St Andrew''s', '', 1875, 'https://upload.wikimedia.org/wikipedia/en/f/fd/Birmingham_City_FC_logo.svg', '', 2011),
        ('Chelsea', 'CHE', 'London', 'Stamford Bridge', 'Enzo Maresca', 1905, 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg', '4-2-3-1', 2025),
        ('West Bromwich Albion', 'WBA', 'West Bromwich', 'The Hawthorns', '', 1878, 'https://upload.wikimedia.org/wikipedia/en/f/f0/West_Bromwich_Albion.svg', '', 2021),
        ('Liverpool', 'LIV', 'Liverpool', 'Anfield', 'Arne Slot', 1892, 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg', '4-3-3', 2025),
        ('Arsenal', 'ARS', 'London', 'Emirates Stadium', 'Mikel Arteta', 1886, 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg', '4-3-3', 2025),
        ('Manchester United', 'MUN', 'Manchester', 'Old Trafford', 'Erik ten Hag', 1878, 'https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg', '4-2-3-1', 2025),
        ('Newcastle United', 'NEW', 'Newcastle', 'St James'' Park', 'Eddie Howe', 1892, 'https://upload.wikimedia.org/wikipedia/en/5/56/Newcastle_United_Logo.svg', '4-3-3', 2025),
        ('Queens Park Rangers', 'QPR', 'London', 'Loftus Road', '', 1882, 'https://upload.wikimedia.org/wikipedia/en/7/73/QPRcrest.svg', '', 2015),
        ('Norwich City', 'NOR', 'Norwich', 'Carrow Road', 'Johannes Hoff Thorup', 1902, 'https://upload.wikimedia.org/wikipedia/en/8/8c/Norwich_City.svg', '4-2-3-1', 2022),
        ('Swansea City', 'SWA', 'Swansea', 'Liberty Stadium', '', 1912, 'https://upload.wikimedia.org/wikipedia/en/f/f2/Swansea_City_AFC_logo.svg', '', 2018),
        ('Reading', 'REA', 'Reading', 'Madejski Stadium', '', 1871, 'https://upload.wikimedia.org/wikipedia/en/4/4e/Reading_FC_logo.svg', '', 2013),
        ('Southampton', 'SOU', 'Southampton', 'St Mary''s Stadium', 'Russell Martin', 1885, 'https://upload.wikimedia.org/wikipedia/en/c/c9/FC_Southampton.svg', '4-4-2', 2025),
        ('Cardiff City', 'CAR', 'Cardiff', 'Cardiff City Stadium', '', 1899, 'https://upload.wikimedia.org/wikipedia/en/3/3e/Cardiff_City_FC_logo.svg', '', 2019),
        ('Hull City', 'HUL', 'Hull', 'KC Stadium', '', 1904, 'https://upload.wikimedia.org/wikipedia/en/7/7a/Hull_City_AFC_logo.svg', '', 2017),
        ('Crystal Palace', 'CRY', 'London', 'Selhurst Park', 'Oliver Glasner', 1905, 'https://upload.wikimedia.org/wikipedia/en/e/e0/Crystal_Palace_FC_logo.svg', '4-3-3', 2025),
        ('Leicester City', 'LEI', 'Leicester', 'King Power Stadium', 'Graham Potter', 1884, 'https://upload.wikimedia.org/wikipedia/en/6/63/Leicester_City_crest.svg', '4-1-4-1', 2025),
        ('Burnley', 'BUR', 'Burnley', 'Turf Moor', 'Craig Bellamy (interim)', 1882, 'https://upload.wikimedia.org/wikipedia/en/0/01/Burnley_FC_badge.png', '', 2024),
        ('AFC Bournemouth', 'BOU', 'Bournemouth', 'Vitality Stadium', 'Andoni Iraola', 1899, 'https://upload.wikimedia.org/wikipedia/en/3/3c/AFC_Bournemouth_logo.svg', '4-3-3', 2025),
        ('Watford', 'WAT', 'Watford', 'Vicarage Road', 'Tom Cleverley', 1881, 'https://upload.wikimedia.org/wikipedia/en/e/e2/Watford_FC.svg', '4-3-3', 2022),
        ('Middlesbrough', 'MID', 'Middlesbrough', 'Riverside Stadium', 'Michael Carrick', 1876, 'https://upload.wikimedia.org/wikipedia/en/e/e2/Middlesbrough_FC_logo.svg', '', 2017),
        ('Huddersfield Town', 'HUD', 'Huddersfield', 'John Smith''s Stadium', 'Michael Duff', 1908, 'https://upload.wikimedia.org/wikipedia/en/8/8b/Huddersfield_Town_AFC_logo.svg', '', 2019),
        ('Brighton & Hove Albion', 'BHA', 'Brighton', 'Falmer Stadium', 'Fabian Hürzeler', 1901, 'https://upload.wikimedia.org/wikipedia/en/f/fd/Brighton_%26_Hove_Albion_logo.svg', '4-3-3', 2025),
        ('Sheffield United', 'SHU', 'Sheffield', 'Bramall Lane', 'Chris Wilder', 1889, 'https://upload.wikimedia.org/wikipedia/en/8/8c/Sheffield_United_FC_logo.svg', '', 2024),
        ('Nottingham Forest', 'NFO', 'Nottingham', 'City Ground', 'Nuno Espírito Santo', 1865, 'https://upload.wikimedia.org/wikipedia/en/e/e5/Nottingham_Forest_F.C._logo.svg', '4-3-3', 2025),
        ('Leeds United', 'LEE', 'Leeds', 'Elland Road', 'Daniel Farke', 1919, 'https://upload.wikimedia.org/wikipedia/en/0/0e/Leeds_United_FC_logo.svg', '4-1-4-1', 2025),
        ('Brentford', 'BRE', 'London', 'Gtech Community Stadium', 'Thomas Frank', 1889, 'https://upload.wikimedia.org/wikipedia/en/2/2a/Brentford_FC_crest.svg', '4-3-3', 2025)
    ]

    insert_sql = """
        INSERT INTO teams (name, short_code, city, stadium, manager_name, founding_year, logo_url, usual_formation, last_premier_league_year)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
    """
    cursor.executemany(insert_sql, teams_to_insert)
    print(f"Successfully inserted {cursor.rowcount} records into 'teams'.")

    # Commit the changes to the database
    conn.commit()
    print("All operations completed and changes committed successfully.")

except psycopg2.Error as e:
    print(f"Database error: {e}")
    if conn:
        conn.rollback() # Rollback in case of error
except Exception as e:
    print(f"An unexpected error occurred: {e}")
finally:
    # Close the cursor and connection
    if cursor:
        cursor.close()
    if conn:
        conn.close()
    print("Database connection closed.")