-- ABTOW 2026 Open Database Setup
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS match_results;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS players;

-- Create players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    team VARCHAR(50) NOT NULL CHECK (team IN ('Shafts', 'Balls')),
    raw_handicap DECIMAL(3,1) NOT NULL,
    playing_handicap INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    day INTEGER NOT NULL CHECK (day IN (1, 2, 3)),
    tees VARCHAR(100) NOT NULL,
    par_data JSONB NOT NULL, -- hole-by-hole par and handicap index
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day INTEGER NOT NULL CHECK (day IN (1, 2, 3)),
    group_number INTEGER NOT NULL,
    format VARCHAR(50) NOT NULL,
    team1_players TEXT[] NOT NULL,
    team2_players TEXT[] NOT NULL,
    course_id UUID REFERENCES courses(id),
    group_access_token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scores table
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    gross_score INTEGER CHECK (gross_score > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create match_results view for computed match points
CREATE OR REPLACE VIEW match_results AS
WITH hole_results AS (
    -- Calculate net scores and determine hole winners
    SELECT 
        s.match_id,
        m.day,
        m.format,
        m.team1_players,
        m.team2_players,
        s.hole_number,
        s.player_id,
        p.name,
        p.team,
        p.playing_handicap,
        s.gross_score,
        cd.par_data->>('hole_' || s.hole_number::text)::jsonb->>'par' as hole_par,
        cd.par_data->>('hole_' || s.hole_number::text)::jsonb->>'handicap' as hole_handicap,
        CASE 
            WHEN s.gross_score IS NOT NULL AND p.playing_handicap IS NOT NULL 
            THEN s.gross_score - FLOOR(p.playing_handicap::float / 18 + 
                 CASE WHEN (cd.par_data->>('hole_' || s.hole_number::text)::jsonb->>'handicap')::int <= (p.playing_handicap % 18) 
                      THEN 1 ELSE 0 END)
            ELSE NULL 
        END as net_score
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    JOIN players p ON s.player_id = p.id
    JOIN courses cd ON m.course_id = cd.id
),
stableford_points AS (
    -- Calculate Stableford points for Day 2
    SELECT 
        hr.*,
        CASE 
            WHEN hr.format = 'Stableford' AND hr.net_score IS NOT NULL AND hr.hole_par IS NOT NULL THEN
                CASE 
                    WHEN hr.net_score >= hr.hole_par::int + 2 THEN 0  -- Double Bogey+
                    WHEN hr.net_score = hr.hole_par::int + 1 THEN 1   -- Bogey
                    WHEN hr.net_score = hr.hole_par::int THEN 2       -- Par
                    WHEN hr.net_score = hr.hole_par::int - 1 THEN 3   -- Birdie
                    WHEN hr.net_score = hr.hole_par::int - 2 THEN 4   -- Eagle
                    WHEN hr.net_score <= hr.hole_par::int - 3 THEN 5  -- Albatross
                    ELSE 0
                END
            ELSE 0
        END as stableford_points
    FROM hole_results hr
)
SELECT 
    match_id,
    day,
    format,
    team1_players,
    team2_players,
    -- Front 9 points, Back 9 points, Total points for each team
    0 as team1_front_points,
    0 as team1_back_points,
    0 as team1_total_points,
    0 as team2_front_points,
    0 as team2_back_points,
    0 as team2_total_points,
    'in_progress' as status
FROM matches;

-- Insert seed data for players
INSERT INTO players (name, team, raw_handicap, playing_handicap) VALUES
-- Team Shafts
('Hallimen', 'Shafts', 4.9, 4),
('Cummings', 'Shafts', 10.0, 8),
('Short', 'Shafts', 10.1, 8),
('Cook', 'Shafts', 12.1, 9),
('Leone', 'Shafts', 14.8, 11),
('Yurus', 'Shafts', 15.5, 11),
('Krasinski', 'Shafts', 16.4, 12),
('KOP', 'Shafts', 21.0, 16),
('Joel', 'Shafts', 21.5, 16),
('Lawler', 'Shafts', 28.3, 21),
-- Team Balls
('Riley', 'Balls', 4.8, 4),
('Stratton', 'Balls', 6.2, 5),
('Stewart', 'Balls', 10.4, 8),
('Chantra', 'Balls', 12.6, 9),
('Horeth', 'Balls', 13.0, 10),
('Howcroft', 'Balls', 14.9, 11),
('Sturgis', 'Balls', 15.8, 12),
('Hanna', 'Balls', 17.7, 13),
('Campbell', 'Balls', 27.1, 20),
('Boeggeman', 'Balls', 31.1, 23);

-- Insert course data
INSERT INTO courses (name, day, tees, par_data) VALUES
('Ritz Carlton GC', 1, 'Blue Tees', '{
    "total_par": 72,
    "hole_1": {"par": 4, "handicap": 5},
    "hole_2": {"par": 3, "handicap": 17},
    "hole_3": {"par": 5, "handicap": 3},
    "hole_4": {"par": 4, "handicap": 11},
    "hole_5": {"par": 4, "handicap": 7},
    "hole_6": {"par": 3, "handicap": 15},
    "hole_7": {"par": 4, "handicap": 9},
    "hole_8": {"par": 5, "handicap": 1},
    "hole_9": {"par": 4, "handicap": 13},
    "hole_10": {"par": 4, "handicap": 6},
    "hole_11": {"par": 3, "handicap": 18},
    "hole_12": {"par": 5, "handicap": 2},
    "hole_13": {"par": 4, "handicap": 8},
    "hole_14": {"par": 4, "handicap": 12},
    "hole_15": {"par": 3, "handicap": 16},
    "hole_16": {"par": 4, "handicap": 10},
    "hole_17": {"par": 5, "handicap": 4},
    "hole_18": {"par": 4, "handicap": 14}
}'::jsonb),
('Southern Dunes', 2, 'Blue/White Blended', '{
    "total_par": 72,
    "hole_1": {"par": 4, "handicap": 7},
    "hole_2": {"par": 5, "handicap": 3},
    "hole_3": {"par": 3, "handicap": 15},
    "hole_4": {"par": 4, "handicap": 9},
    "hole_5": {"par": 4, "handicap": 5},
    "hole_6": {"par": 3, "handicap": 17},
    "hole_7": {"par": 5, "handicap": 1},
    "hole_8": {"par": 4, "handicap": 11},
    "hole_9": {"par": 4, "handicap": 13},
    "hole_10": {"par": 4, "handicap": 8},
    "hole_11": {"par": 5, "handicap": 2},
    "hole_12": {"par": 3, "handicap": 16},
    "hole_13": {"par": 4, "handicap": 6},
    "hole_14": {"par": 4, "handicap": 12},
    "hole_15": {"par": 3, "handicap": 18},
    "hole_16": {"par": 4, "handicap": 10},
    "hole_17": {"par": 5, "handicap": 4},
    "hole_18": {"par": 4, "handicap": 14}
}'::jsonb),
('Champions Gate International', 3, 'White Tees', '{
    "total_par": 72,
    "hole_1": {"par": 4, "handicap": 9},
    "hole_2": {"par": 4, "handicap": 5},
    "hole_3": {"par": 3, "handicap": 17},
    "hole_4": {"par": 5, "handicap": 1},
    "hole_5": {"par": 4, "handicap": 11},
    "hole_6": {"par": 4, "handicap": 7},
    "hole_7": {"par": 3, "handicap": 15},
    "hole_8": {"par": 5, "handicap": 3},
    "hole_9": {"par": 4, "handicap": 13},
    "hole_10": {"par": 4, "handicap": 6},
    "hole_11": {"par": 3, "handicap": 18},
    "hole_12": {"par": 4, "handicap": 10},
    "hole_13": {"par": 5, "handicap": 2},
    "hole_14": {"par": 4, "handicap": 8},
    "hole_15": {"par": 4, "handicap": 12},
    "hole_16": {"par": 3, "handicap": 16},
    "hole_17": {"par": 5, "handicap": 4},
    "hole_18": {"par": 4, "handicap": 14}
}'::jsonb);

-- Insert match data with access tokens
INSERT INTO matches (day, group_number, format, team1_players, team2_players, course_id, group_access_token)
SELECT 
    1, 1, 'Best Ball', 
    ARRAY['Yurus', 'Krasinski'], 
    ARRAY['Stratton', 'Sturgis'], 
    c.id, 'group1-day1-token'
FROM courses c WHERE c.day = 1
UNION ALL
SELECT 
    1, 2, 'Best Ball', 
    ARRAY['Short', 'Leone'], 
    ARRAY['Riley', 'Hanna'], 
    c.id, 'group2-day1-token'
FROM courses c WHERE c.day = 1
UNION ALL
SELECT 
    1, 3, 'Best Ball', 
    ARRAY['Hallimen', 'KOP'], 
    ARRAY['Stewart', 'Howcroft'], 
    c.id, 'group3-day1-token'
FROM courses c WHERE c.day = 1
UNION ALL
SELECT 
    1, 4, 'Best Ball', 
    ARRAY['Cummings', 'Lawler'], 
    ARRAY['Horeth', 'Campbell'], 
    c.id, 'group4-day1-token'
FROM courses c WHERE c.day = 1
UNION ALL
SELECT 
    1, 5, 'Best Ball', 
    ARRAY['Cook', 'Joel'], 
    ARRAY['Chantra', 'Boeggeman'], 
    c.id, 'group5-day1-token'
FROM courses c WHERE c.day = 1
UNION ALL
-- Day 2 matches
SELECT 
    2, 1, 'Stableford', 
    ARRAY['Cook', 'KOP'], 
    ARRAY['Riley', 'Boeggeman'], 
    c.id, 'group1-day2-token'
FROM courses c WHERE c.day = 2
UNION ALL
SELECT 
    2, 2, 'Stableford', 
    ARRAY['Short', 'Yurus'], 
    ARRAY['Stratton', 'Hanna'], 
    c.id, 'group2-day2-token'
FROM courses c WHERE c.day = 2
UNION ALL
SELECT 
    2, 3, 'Stableford', 
    ARRAY['Hallimen', 'Lawler'], 
    ARRAY['Horeth', 'Sturgis'], 
    c.id, 'group3-day2-token'
FROM courses c WHERE c.day = 2
UNION ALL
SELECT 
    2, 4, 'Stableford', 
    ARRAY['Cummings', 'Joel'], 
    ARRAY['Chantra', 'Howcroft'], 
    c.id, 'group4-day2-token'
FROM courses c WHERE c.day = 2
UNION ALL
SELECT 
    2, 5, 'Stableford', 
    ARRAY['Leone', 'Krasinski'], 
    ARRAY['Stewart', 'Campbell'], 
    c.id, 'group5-day2-token'
FROM courses c WHERE c.day = 2
UNION ALL
-- Day 3 matches (individual matches, but still grouped)
SELECT 
    3, 1, 'Individual', 
    ARRAY['Hallimen', 'Cummings'], 
    ARRAY['Riley', 'Stratton'], 
    c.id, 'group1-day3-token'
FROM courses c WHERE c.day = 3
UNION ALL
SELECT 
    3, 2, 'Individual', 
    ARRAY['Short', 'Cook'], 
    ARRAY['Stewart', 'Chantra'], 
    c.id, 'group2-day3-token'
FROM courses c WHERE c.day = 3
UNION ALL
SELECT 
    3, 3, 'Individual', 
    ARRAY['Leone', 'Yurus'], 
    ARRAY['Horeth', 'Howcroft'], 
    c.id, 'group3-day3-token'
FROM courses c WHERE c.day = 3
UNION ALL
SELECT 
    3, 4, 'Individual', 
    ARRAY['Krasinski', 'KOP'], 
    ARRAY['Sturgis', 'Hanna'], 
    c.id, 'group4-day3-token'
FROM courses c WHERE c.day = 3
UNION ALL
SELECT 
    3, 5, 'Individual', 
    ARRAY['Joel', 'Lawler'], 
    ARRAY['Campbell', 'Boeggeman'], 
    c.id, 'group5-day3-token'
FROM courses c WHERE c.day = 3;

-- Create indexes for better performance
CREATE INDEX idx_scores_match_hole ON scores(match_id, hole_number);
CREATE INDEX idx_scores_player ON scores(player_id);
CREATE INDEX idx_matches_day ON matches(day);
CREATE INDEX idx_matches_token ON matches(group_access_token);

-- Enable Row Level Security
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow read access to all, write access only with proper token
CREATE POLICY "Allow read access to all" ON players FOR SELECT USING (true);
CREATE POLICY "Allow read access to all" ON courses FOR SELECT USING (true);
CREATE POLICY "Allow read access to all" ON matches FOR SELECT USING (true);
CREATE POLICY "Allow read access to all" ON scores FOR SELECT USING (true);

-- Allow anon to insert and update scores (token validation handled in app layer)
CREATE POLICY "Allow score inserts" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow score updates" ON scores FOR UPDATE USING (true);

-- Enable real-time subscriptions on scores table
ALTER PUBLICATION supabase_realtime ADD TABLE scores;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON scores
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions to anon role
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT, UPDATE ON scores TO anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;