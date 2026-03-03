# ABTOW 2026 Open — Database Schema

Supabase (PostgreSQL) project: `fnxyorriiytdskxpedir`  
All tables are in the `public` schema with Row Level Security (RLS) enabled.

---

## Tables

### `players`
Core player identity. One row per participant.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `uuid_generate_v4()` |
| name | varchar | Full display name (e.g. "Ricky Howcroft") |
| first_name | varchar | |
| last_name | varchar | |
| nickname | varchar | Optional (e.g. "Bin Bombin") |
| team | varchar | `'Shafts'` or `'Balls'` |
| raw_handicap | numeric | GHIN-style handicap |
| playing_handicap | int | `round(raw × 0.75)` |
| avatar_url | text | Supabase Storage path |
| avatar_position | text | CSS `object-position` for avatar crop |
| avatar_scale | numeric | CSS scale for avatar display |
| venmo_handle | text | Without `@` prefix |
| phone_number | text | For SMS notifications via TextBelt |
| created_at | timestamptz | |

---

### `courses`
One row per day of play.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar | Course name |
| day | int | `1`, `2`, or `3` |
| tees | varchar | e.g. `'White'` |
| par_data | jsonb | `{ hole_1: { par: 4, handicap: 7 }, ... hole_18: {...} }` — `handicap` = stroke index |
| created_at | timestamptz | |

---

### `matches`
One row per group matchup per day.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| day | int | `1`, `2`, or `3` |
| group_number | int | `1`–`5` |
| format | varchar | `'Best Ball'`, `'Stableford'`, or `'Individual'` (case-sensitive) |
| team1_players | text[] | Array of player names |
| team2_players | text[] | Array of player names |
| course_id | uuid → courses | |
| group_access_token | varchar | URL token for score entry (e.g. `/score/[token]`) |
| scores_locked | bool | Admin can lock a match after completion |
| attested_by | uuid → players | Player who attested the scorecard |
| attested_at | timestamptz | |
| created_at | timestamptz | |

---

### `scores`
Raw hole-by-hole gross scores. One row per player per hole per match.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| match_id | uuid → matches | |
| player_id | uuid → players | |
| hole_number | int | `1`–`18` |
| gross_score | int | Raw strokes, no adjustment |
| created_at | timestamptz | |
| updated_at | timestamptz | |

All net scores, stableford points, and match results are **computed in TypeScript** (`lib/scoring.ts`) — not stored here.

---

### `bets`
Player-to-player wagers on match outcomes.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| match_id | uuid → matches | |
| bet_type | text | `'front'`, `'back'`, or `'overall'` |
| side1_player_id | uuid → players | Proposer |
| side2_player_id | uuid → players | Opponent |
| side1_amount | numeric | Dollar amount |
| side2_amount | numeric | Dollar amount |
| side1_ml | int | American moneyline for side1 (e.g. `-130`) |
| side2_ml | int | American moneyline for side2 |
| tease_adjustment | int | Extra holes/pts added to side1's raw segment count |
| proposer_side | text | `'side1'` or `'side2'` |
| status | text | `'pending'` → `'active'` → `'side1_won'` \| `'side2_won'` \| `'push'` \| `'cancelled'` |
| settled_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `player_stats`
Aggregate season stats per player. Written by `post-round-processor.ts` after each match.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| player_id | uuid → players | |
| tournament_year | int | `2026` |
| team_matches_played/won/lost/tied | int | Best Ball + Stableford |
| individual_matches_played/won/lost/tied | int | Day 3 only |
| total_rounds_played | int | |
| total_gross_strokes | int | |
| total_net_strokes | int | |
| total_holes_played | int | |
| eagles / birdies / pars / bogeys / double_bogeys / triple_bogeys_plus | int | |
| rounds_under/at/over_handicap | int | |
| total_strokes_to_handicap | int | Net vs par aggregate |
| created_at / updated_at | timestamp | |

---

### `player_daily_stats`
Per-player per-round stats. One row per player per day.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| player_id | uuid → players | |
| course_id | uuid → courses | |
| day | int | |
| gross_score / net_score | int | Full 18-hole totals |
| playing_handicap | int | Snapshot for that round |
| strokes_to_handicap | int | `net_score - 72` (par) |
| eagles / birdies / pars / bogeys / double_bogeys / triple_bogeys_plus | int | |
| best_holes / worst_holes | int[] | Hole numbers |
| created_at / updated_at | timestamp | |

---

### `player_hole_stats`
Lifetime per-hole stats across all rounds. Used for Dream Round, hole averages.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| player_id | uuid → players | |
| hole_number | int | `1`–`18` |
| times_played | int | |
| total_gross_strokes | int | |
| best_score / worst_score | int | Gross |
| net_score | int | Best net on this hole |
| stableford_points | int | Best stableford on this hole |
| eagles / birdies / pars / bogeys / double_bogeys / triple_bogeys_plus | int | |
| created_at / updated_at | timestamp | |

---

### `game_participants`
Players who opted into side games (e.g. Handicap Game).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| game_id | text | e.g. `'handicap'` |
| day | int | |
| player_id | uuid → players | |
| opted_in_at | timestamptz | |

UNIQUE constraint on `(game_id, day, player_id)`.

---

### `game_day_locks`
Admin override for game day access. Takes priority over automatic date logic.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| game_id | text | |
| day | int | |
| locked | bool | |
| updated_at | timestamptz | |

UNIQUE constraint on `(game_id, day)`.

---

## Key RPC Functions

| Function | Auth | Purpose |
|----------|------|---------|
| `set_match_scores_locked(match_id, locked)` | SECURITY DEFINER | Lock/unlock a match for score entry |
| `set_match_attested(match_id, player_id)` | SECURITY DEFINER | Record scorecard attestation |
| `upsert_hole_stats(...)` | SECURITY DEFINER | Write to `player_hole_stats` |
| `upsert_player_stats(...)` | SECURITY DEFINER | Write to `player_stats` |
| `update_match_record(...)` | SECURITY DEFINER | Write match result to `player_stats` |
| `write_bet_settlements(match_id, settlements jsonb)` | SECURITY DEFINER | Settle bets from pre-computed results |

All RPCs are `SECURITY DEFINER` because the anon key only has `SELECT` on most tables.

---

## API Routes (Next.js)

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/admin/login` | — | Sets `abtow_admin_session` HTTP-only cookie |
| `GET /api/admin/verify` | Cookie | Verifies admin session |
| `POST /api/admin/logout` | Cookie | Clears cookie |
| `POST /api/bets/settle` | Cookie (admin) | Runs settlement via `lib/scoring.ts` |
| `POST /api/bets/notify` | Public (constrained) | SMS for bet proposed/accepted |
| `POST /api/notify-player` | Cookie (admin) | Arbitrary SMS to a player |

---

## Scoring Architecture

All business logic lives in **`lib/scoring.ts`** — not in SQL:

- `calculateBestBallResults()` — Net Best Ball (Day 1)
- `calculateStablefordResults()` — Combined Stableford (Day 2)  
- `calculateIndividualResults()` — Match Play (Day 3)
- `calculateSettlementSegments()` — Raw front/back/overall segment counts for bet settlement

The DB is a raw data store. Fix a scoring bug → deploy code, no migration needed.

---

## RLS Summary

- `scores`, `matches`, `players`, `courses` → public `SELECT`; writes via SECURITY DEFINER RPCs
- `bets` → public `SELECT`; inserts allowed anon; updates via RPC only
- `game_participants` → public `SELECT` + `INSERT` (anon)
- `game_day_locks` → public `SELECT` only; admin writes via API
