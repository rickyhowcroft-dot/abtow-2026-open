# Future Design — Multi-Tournament Architecture

> **Status:** Planned post-ABTOW 2026 (target: 3/21/2026+)
> **Domain:** `puttitout.golf` — registered and reserved for the full multi-tournament platform
> **Context:** Current schema is purpose-built for a single 3-day tournament. These changes would allow the app to support multiple events, leagues, and seasons without rebuilding from scratch. ABTOW and the winter sim league would both live under puttitout.golf once the architecture is in place.

---

## 1. Schema Evolution

### New tables

```sql
-- Top-level grouping for recurring events (e.g. "ABTOW Annual")
CREATE TABLE leagues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,  -- e.g. 'abtow'
  created_at  timestamptz DEFAULT now()
);

-- One row per tournament / event
CREATE TABLE tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid REFERENCES leagues(id),
  name        text NOT NULL,         -- e.g. 'ABTOW 2026 Open'
  year        int NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Replaces the hardcoded "day" integer on matches
-- One row per day of play within a tournament
CREATE TABLE rounds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id),
  round_number  int NOT NULL,        -- 1, 2, 3...
  course_id     uuid REFERENCES courses(id),
  date          date NOT NULL,
  format        text NOT NULL,       -- 'Best Ball' | 'Stableford' | 'Individual'
  created_at    timestamptz DEFAULT now(),
  UNIQUE (tournament_id, round_number)
);

-- Replaces hardcoded team column on players + per-tournament handicaps
-- One row per player per tournament
CREATE TABLE tournament_players (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    uuid REFERENCES tournaments(id),
  player_id        uuid REFERENCES players(id),
  team_name        text,             -- e.g. 'Shafts', 'Balls'
  raw_handicap     numeric,
  playing_handicap int,
  ghin_number      text,             -- see section 2
  created_at       timestamptz DEFAULT now(),
  UNIQUE (tournament_id, player_id)
);

-- The missing "scorecard" entity — ties together player, round, course, handicap
-- One row per player per round (or per team per round for team formats)
CREATE TABLE scorecards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    uuid REFERENCES tournaments(id),
  round_id         uuid REFERENCES rounds(id),
  player_id        uuid REFERENCES players(id),
  course_id        uuid REFERENCES courses(id),
  playing_handicap int,              -- snapshot of hcp for that specific round
  submitted_at     timestamptz,
  attested_by      uuid REFERENCES players(id),
  attested_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);
```

### Changes to existing tables

```sql
-- matches: add tournament + round scope, drop hardcoded day
ALTER TABLE matches ADD COLUMN tournament_id uuid REFERENCES tournaments(id);
ALTER TABLE matches ADD COLUMN round_id uuid REFERENCES rounds(id);
-- matches.day can be derived from rounds.round_number — eventually drop

-- bets: scope to tournament
ALTER TABLE bets ADD COLUMN tournament_id uuid REFERENCES tournaments(id);

-- player_stats / player_daily_stats: replace tournament_year with tournament_id
ALTER TABLE player_stats ADD COLUMN tournament_id uuid REFERENCES tournaments(id);
ALTER TABLE player_daily_stats ADD COLUMN tournament_id uuid REFERENCES tournaments(id);

-- game_participants / game_day_locks: scope to tournament
ALTER TABLE game_participants ADD COLUMN tournament_id uuid REFERENCES tournaments(id);
ALTER TABLE game_day_locks ADD COLUMN tournament_id uuid REFERENCES tournaments(id);
```

---

## 2. GHIN Numbers

Add `ghin_number` to the `players` table (or to `tournament_players` if handicaps are per-season):

```sql
-- Option A: global (player always has same GHIN)
ALTER TABLE players ADD COLUMN ghin_number text;

-- Option B: per-tournament (if player changes GHIN or needs per-event tracking)
-- Already included in tournament_players above
```

**Why it matters:**
- Allows handicap lookup/verification via GHIN API or USGA before each tournament
- Enables player identity matching across seasons without relying on name strings
- Foundation for automated handicap updates rather than manual admin entry

**Admin panel:** Add a GHIN field alongside Venmo handle and phone number in the player management section.

---

## 3. Scorecard Entity — Why It Matters

Right now attestation lives on `matches` (one attestation per group). The proper golf model is a **scorecard** — each player submits and signs their own card.

With a `scorecards` table:
- Each player has their own scorecard per round
- Attestation is player-to-player (opponent signs your card, you sign theirs)
- Playing handicap is snapshotted at round time (important if handicaps change mid-tournament)
- Scorecard submission becomes an explicit event, not just "all holes entered"

---

## 4. App Code Impact

| Area | Change needed |
|---|---|
| `lib/scoring.ts` | No change — pure functions, already format-agnostic |
| `lib/games-service.ts` | Pass `tournamentId` instead of hardcoded game constants |
| `app/day/[day]` routing | Replace with `app/round/[roundId]` or parameterize |
| `lib/bets-service.ts` | Scope queries by `tournament_id` |
| `lib/post-round-processor.ts` | Pass `tournamentId` to stats writes |
| Admin panel | Tournament selector at top; all data-entry scoped to active tournament |
| Score entry URLs | Include `tournamentId` in token generation |

---

## 5. Migration Path (ABTOW 2026 → v2)

1. Create `leagues` + `tournaments` rows for ABTOW 2026 (backfill)
2. Create `rounds` rows for Day 1/2/3 (backfill from current matches)
3. Populate `tournament_players` from current `players.team` + handicap data
4. Add `tournament_id` + `round_id` FKs to matches (nullable at first, backfill, then NOT NULL)
5. Migrate stats tables to use `tournament_id` instead of `tournament_year = 2026`
6. Update app queries to join through new tables
7. Drop deprecated columns (`matches.day`, `players.team`, `player_stats.tournament_year`)

**Backfill is non-destructive** — old columns can remain nullable during transition.

---

## 6. What Stays the Same

- `scores` table — raw hole-by-hole data, already clean
- `courses` + `par_data` — already reusable across tournaments
- `lib/scoring.ts` — pure calculation functions, no schema dependency
- `players` base table — universal player identity
- Venmo handles, phone numbers — player-level, not tournament-level
