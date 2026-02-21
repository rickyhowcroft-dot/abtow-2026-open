-- Player Statistics Tables for ABTOW Tournament

-- Main player statistics table
CREATE TABLE player_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    tournament_year INTEGER NOT NULL DEFAULT 2026,
    
    -- Match Records
    team_matches_played INTEGER DEFAULT 0,
    team_matches_won INTEGER DEFAULT 0,
    team_matches_lost INTEGER DEFAULT 0,
    team_matches_tied INTEGER DEFAULT 0,
    individual_matches_played INTEGER DEFAULT 0,
    individual_matches_won INTEGER DEFAULT 0,
    individual_matches_lost INTEGER DEFAULT 0,
    individual_matches_tied INTEGER DEFAULT 0,
    
    -- Scoring Summary
    total_rounds_played INTEGER DEFAULT 0,
    total_gross_strokes INTEGER DEFAULT 0,
    total_net_strokes INTEGER DEFAULT 0,
    total_holes_played INTEGER DEFAULT 0,
    
    -- Score Distribution
    eagles INTEGER DEFAULT 0,
    birdies INTEGER DEFAULT 0,
    pars INTEGER DEFAULT 0,
    bogeys INTEGER DEFAULT 0,
    double_bogeys INTEGER DEFAULT 0,
    triple_bogeys_plus INTEGER DEFAULT 0,
    
    -- Performance vs Handicap
    rounds_under_handicap INTEGER DEFAULT 0,
    rounds_at_handicap INTEGER DEFAULT 0,
    rounds_over_handicap INTEGER DEFAULT 0,
    total_strokes_to_handicap INTEGER DEFAULT 0, -- Can be negative
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    UNIQUE(player_id, tournament_year)
);

-- Daily/Course statistics
CREATE TABLE player_daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    
    -- Daily Performance
    gross_score INTEGER,
    net_score INTEGER,
    playing_handicap INTEGER,
    strokes_to_handicap INTEGER, -- positive = over handicap, negative = under
    
    -- Daily Score Distribution  
    eagles INTEGER DEFAULT 0,
    birdies INTEGER DEFAULT 0,
    pars INTEGER DEFAULT 0,
    bogeys INTEGER DEFAULT 0,
    double_bogeys INTEGER DEFAULT 0,
    triple_bogeys_plus INTEGER DEFAULT 0,
    
    -- Best/Worst holes for the day (hole numbers, not scores)
    best_holes INTEGER[],
    worst_holes INTEGER[],
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    UNIQUE(player_id, course_id, day)
);

-- Hole-by-hole performance tracking
CREATE TABLE player_hole_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
    
    -- Aggregated hole performance across all rounds
    times_played INTEGER DEFAULT 0,
    total_gross_strokes INTEGER DEFAULT 0,
    eagles INTEGER DEFAULT 0,
    birdies INTEGER DEFAULT 0,  
    pars INTEGER DEFAULT 0,
    bogeys INTEGER DEFAULT 0,
    double_bogeys INTEGER DEFAULT 0,
    triple_bogeys_plus INTEGER DEFAULT 0,
    
    -- Best and worst scores on this hole
    best_score INTEGER,
    worst_score INTEGER,
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    UNIQUE(player_id, hole_number)
);

-- Indexes for performance
CREATE INDEX idx_player_stats_player_id ON player_stats(player_id);
CREATE INDEX idx_player_daily_stats_player_id ON player_daily_stats(player_id);
CREATE INDEX idx_player_daily_stats_day ON player_daily_stats(day);
CREATE INDEX idx_player_hole_stats_player_id ON player_hole_stats(player_id);
CREATE INDEX idx_player_hole_stats_hole_number ON player_hole_stats(hole_number);

-- Update trigger for player_stats updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON player_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_player_daily_stats_updated_at BEFORE UPDATE ON player_daily_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_player_hole_stats_updated_at BEFORE UPDATE ON player_hole_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Upsert function for player overall stats (increments existing values)
CREATE OR REPLACE FUNCTION upsert_player_stats(
    p_player_id UUID,
    p_rounds_played INTEGER DEFAULT 0,
    p_gross_strokes INTEGER DEFAULT 0,
    p_net_strokes INTEGER DEFAULT 0,
    p_holes_played INTEGER DEFAULT 0,
    p_eagles INTEGER DEFAULT 0,
    p_birdies INTEGER DEFAULT 0,
    p_pars INTEGER DEFAULT 0,
    p_bogeys INTEGER DEFAULT 0,
    p_double_bogeys INTEGER DEFAULT 0,
    p_triple_plus INTEGER DEFAULT 0,
    p_rounds_under INTEGER DEFAULT 0,
    p_rounds_at INTEGER DEFAULT 0,
    p_rounds_over INTEGER DEFAULT 0,
    p_strokes_to_hcp INTEGER DEFAULT 0
) RETURNS void AS $$
BEGIN
    INSERT INTO player_stats (
        player_id, tournament_year, 
        total_rounds_played, total_gross_strokes, total_net_strokes, total_holes_played,
        eagles, birdies, pars, bogeys, double_bogeys, triple_bogeys_plus,
        rounds_under_handicap, rounds_at_handicap, rounds_over_handicap, total_strokes_to_handicap
    ) VALUES (
        p_player_id, 2026,
        p_rounds_played, p_gross_strokes, p_net_strokes, p_holes_played,
        p_eagles, p_birdies, p_pars, p_bogeys, p_double_bogeys, p_triple_plus,
        p_rounds_under, p_rounds_at, p_rounds_over, p_strokes_to_hcp
    )
    ON CONFLICT (player_id, tournament_year) 
    DO UPDATE SET
        total_rounds_played = player_stats.total_rounds_played + p_rounds_played,
        total_gross_strokes = player_stats.total_gross_strokes + p_gross_strokes,
        total_net_strokes = player_stats.total_net_strokes + p_net_strokes,
        total_holes_played = player_stats.total_holes_played + p_holes_played,
        eagles = player_stats.eagles + p_eagles,
        birdies = player_stats.birdies + p_birdies,
        pars = player_stats.pars + p_pars,
        bogeys = player_stats.bogeys + p_bogeys,
        double_bogeys = player_stats.double_bogeys + p_double_bogeys,
        triple_bogeys_plus = player_stats.triple_bogeys_plus + p_triple_plus,
        rounds_under_handicap = player_stats.rounds_under_handicap + p_rounds_under,
        rounds_at_handicap = player_stats.rounds_at_handicap + p_rounds_at,
        rounds_over_handicap = player_stats.rounds_over_handicap + p_rounds_over,
        total_strokes_to_handicap = player_stats.total_strokes_to_handicap + p_strokes_to_hcp,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Upsert function for hole stats (increments and updates best/worst)
CREATE OR REPLACE FUNCTION upsert_hole_stats(
    p_player_id UUID,
    p_hole_number INTEGER,
    p_gross_score INTEGER,
    p_eagles INTEGER DEFAULT 0,
    p_birdies INTEGER DEFAULT 0,
    p_pars INTEGER DEFAULT 0,
    p_bogeys INTEGER DEFAULT 0,
    p_double_bogeys INTEGER DEFAULT 0,
    p_triple_plus INTEGER DEFAULT 0
) RETURNS void AS $$
BEGIN
    INSERT INTO player_hole_stats (
        player_id, hole_number, times_played, total_gross_strokes,
        eagles, birdies, pars, bogeys, double_bogeys, triple_bogeys_plus,
        best_score, worst_score
    ) VALUES (
        p_player_id, p_hole_number, 1, p_gross_score,
        p_eagles, p_birdies, p_pars, p_bogeys, p_double_bogeys, p_triple_plus,
        p_gross_score, p_gross_score
    )
    ON CONFLICT (player_id, hole_number)
    DO UPDATE SET
        times_played = player_hole_stats.times_played + 1,
        total_gross_strokes = player_hole_stats.total_gross_strokes + p_gross_score,
        eagles = player_hole_stats.eagles + p_eagles,
        birdies = player_hole_stats.birdies + p_birdies,
        pars = player_hole_stats.pars + p_pars,
        bogeys = player_hole_stats.bogeys + p_bogeys,
        double_bogeys = player_hole_stats.double_bogeys + p_double_bogeys,
        triple_bogeys_plus = player_hole_stats.triple_bogeys_plus + p_triple_plus,
        best_score = LEAST(player_hole_stats.best_score, p_gross_score),
        worst_score = GREATEST(player_hole_stats.worst_score, p_gross_score),
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Update match record for a player (by name)
CREATE OR REPLACE FUNCTION update_match_record(
    p_player_name TEXT,
    p_format TEXT,
    p_won BOOLEAN DEFAULT FALSE,
    p_lost BOOLEAN DEFAULT FALSE,
    p_tied BOOLEAN DEFAULT FALSE
) RETURNS void AS $$
DECLARE
    player_id_var UUID;
BEGIN
    -- Get player ID from name
    SELECT id INTO player_id_var
    FROM players 
    WHERE name = p_player_name;
    
    IF player_id_var IS NULL THEN
        RAISE EXCEPTION 'Player not found: %', p_player_name;
    END IF;
    
    -- Update or insert player stats
    INSERT INTO player_stats (
        player_id, tournament_year,
        team_matches_played, team_matches_won, team_matches_lost, team_matches_tied,
        individual_matches_played, individual_matches_won, individual_matches_lost, individual_matches_tied
    ) VALUES (
        player_id_var, 2026,
        CASE WHEN p_format = 'team' THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'team' AND p_won THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'team' AND p_lost THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'team' AND p_tied THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'individual' THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'individual' AND p_won THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'individual' AND p_lost THEN 1 ELSE 0 END,
        CASE WHEN p_format = 'individual' AND p_tied THEN 1 ELSE 0 END
    )
    ON CONFLICT (player_id, tournament_year) 
    DO UPDATE SET
        team_matches_played = player_stats.team_matches_played + CASE WHEN p_format = 'team' THEN 1 ELSE 0 END,
        team_matches_won = player_stats.team_matches_won + CASE WHEN p_format = 'team' AND p_won THEN 1 ELSE 0 END,
        team_matches_lost = player_stats.team_matches_lost + CASE WHEN p_format = 'team' AND p_lost THEN 1 ELSE 0 END,
        team_matches_tied = player_stats.team_matches_tied + CASE WHEN p_format = 'team' AND p_tied THEN 1 ELSE 0 END,
        individual_matches_played = player_stats.individual_matches_played + CASE WHEN p_format = 'individual' THEN 1 ELSE 0 END,
        individual_matches_won = player_stats.individual_matches_won + CASE WHEN p_format = 'individual' AND p_won THEN 1 ELSE 0 END,
        individual_matches_lost = player_stats.individual_matches_lost + CASE WHEN p_format = 'individual' AND p_lost THEN 1 ELSE 0 END,
        individual_matches_tied = player_stats.individual_matches_tied + CASE WHEN p_format = 'individual' AND p_tied THEN 1 ELSE 0 END,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;