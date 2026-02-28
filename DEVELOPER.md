# ABTOW 2026 Open — Developer Guide

Welcome to the codebase. This doc gets you up to speed fast.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres + Auth + Storage) |
| Deploy | Vercel (via GitHub Actions) |
| Language | TypeScript throughout |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/rickyhowcroft-dot/abtow-2026-open.git
cd abtow-2026-open

# 2. Install
npm install

# 3. Environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# (ask Ricky for values — do not commit these)

# 4. Run
npm run dev
# → http://localhost:3000
```

---

## Project Structure

```
app/
  page.tsx                  # Home — day tabs, match cards, score links
  layout.tsx                # Root layout + nav
  components/
    Layout.tsx              # Shared nav wrapper (add new nav links here)
    PlayerStatsModal.tsx    # Full player stats modal (scorecard, dream round)
  admin/page.tsx            # Admin panel (password gated)
  bets/page.tsx             # Betting hub
  day/[day]/page.tsx        # Day scorecard view
  games/page.tsx            # Games hub
  games/handicap/page.tsx   # Handicap Game leaderboard + opt-in
  players/[name]/page.tsx   # Individual player profile
  score/[token]/page.tsx    # Score entry (shareable URL per group)
  skins/page.tsx            # Skins results
  statistics/page.tsx       # Tournament statistics + MVP leaderboard

lib/
  supabase.ts               # Supabase client (use this — don't create new instances)
  stats-service.ts          # Player stats queries
  bets-service.ts           # Bet CRUD, formatting helpers
  games-service.ts          # Handicap game logic, day status, opt-in
  monte-carlo.ts            # Pre-computed odds lookup + moneyline helpers
  mvp-service.ts            # Tournament MVP standings computation

public/
  tywin.jpg                 # Used on losing bet cards
  (player avatars served from Supabase Storage)
```

---

## Supabase

**Project ID:** `fnxyorriiytdskxpedir`  
**Dashboard:** https://supabase.com/dashboard/project/fnxyorriiytdskxpedir

### Key Tables

| Table | Purpose |
|---|---|
| `players` | All 20 players — name, playing_handicap, team, venmo_handle |
| `matches` | Matches per day — format, teams, group_access_token, scores_locked |
| `courses` | Course data — par_data jsonb (hole_1 … hole_18 with par + handicap/stroke index) |
| `scores` | Raw hole scores — match_id, player_id, hole_number, gross_score |
| `bets` | All bets — proposer, acceptor, match, type, tease, status |
| `player_stats` | Aggregated stats (auto-populated after scores saved) |
| `player_daily_stats` | Per-day stats |
| `player_hole_stats` | Per-hole stats |
| `game_participants` | Game opt-ins — game_id, day, player_id |
| `game_day_locks` | Admin overrides for game day access |

### Accessing Supabase in code

Always import the shared client:

```ts
import { supabase } from '@/lib/supabase'

// Query
const { data, error } = await supabase.from('players').select('*')

// RPC (stored function)
const { data } = await supabase.rpc('my_function', { param: value })
```

### RLS (Row Level Security)

All tables have RLS enabled. Most allow anon read + write via permissive policies.  
**Exception:** DDL (CREATE TABLE, ALTER TABLE) requires the management API — ask Ricky or Josh (the AI) to handle schema changes.

### Score lock pattern

Matches have `scores_locked: boolean`. When locked via the admin panel:
1. Score entry is blocked (unless `?adminOverride=1` in URL)
2. Bets for that match auto-settle via `settle_bets_for_match(match_id)` RPC

---

## Service Layer

All data logic lives in `lib/`. Components call service functions — they don't query Supabase directly (with a few minor exceptions on complex pages).

```ts
// Example
import { getMvpStandings } from '@/lib/mvp-service'
const standings = await getMvpStandings()
```

When adding a new feature:
1. Add query/logic functions to an existing or new `lib/*.ts` file
2. Import + call from the page/component
3. Keep pages thin — data fetching in services, display in components

---

## Deploy Pipeline

**Push to `master` → GitHub Actions → `vercel deploy --prod` → live at abtow.golf**

- Build takes ~75–105 seconds
- Check CI status: https://github.com/rickyhowcroft-dot/abtow-2026-open/actions
- **Never push broken TypeScript** — run `npx tsc --noEmit` before pushing

### PR workflow

1. Create a branch, make changes
2. Open a PR against `master`
3. Ricky reviews + merges → auto-deploys
4. CI runs on merge — watch the Actions tab

> **Note:** GitHub Actions secrets (Vercel token etc.) are only available on pushes to `master`, not on PRs from forks. So the deploy only fires after merge, not on the PR itself.

---

## Key Conventions

- **Playing handicap** = `round(raw × 0.75)` — already stored in `players.playing_handicap`
- **Net score per hole** = `gross − floor(hcp/18) − (strokeIndex ≤ hcp%18 ? 1 : 0)`
- **Stableford points** = `max(0, 2 + par − net)`
- **Best Ball (Day 1)** = min net per hole per team
- **Stableford (Day 2)** = max stableford pts per hole per team
- **Individual (Day 3)** = net total per player
- **Skins:** birdie+ gross outright → wins gross + net skins; par/bogey gross outright → gross only; payout = $200 ÷ total skins won per day
- **MVP ranking:** match pts DESC → net aggregate ASC → birdies DESC

---

## Tournament Dates

| Day | Date | Course |
|---|---|---|
| Day 1 | March 16, 2026 | Ritz Carlton GC |
| Day 2 | March 17, 2026 | Southern Dunes |
| Day 3 | March 18, 2026 | Champions Gate International |

---

## Admin Panel

URL: `/admin` — password protected (ask Ricky).

From admin you can:
- Copy score entry URLs per group
- Lock/unlock match scoring
- Override game day access (open/lock per day)
- Edit Venmo handles

---

## Questions?

Ask Ricky, or ping Josh (the AI assistant) — he has full context on every decision made in this codebase.
