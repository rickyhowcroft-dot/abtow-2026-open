# ABTOW 2026 — Pre-Tournament Reset Checklist

Run this before **March 16th, 2026** to wipe all test data and start clean.

## Tables to clear

| Table | What it holds | SQL |
|---|---|---|
| `scores` | All hole scores for every player | `DELETE FROM scores;` |
| `bets` | All bet records | `DELETE FROM bets;` |
| `game_participants` | Game opt-ins | `DELETE FROM game_participants;` |
| `game_day_locks` | Admin game lock overrides | `DELETE FROM game_day_locks;` |
| `player_daily_stats` | Computed per-day stats | `DELETE FROM player_daily_stats;` |
| `player_hole_stats` | Per-hole stats | `DELETE FROM player_hole_stats;` |
| `player_stats` | Aggregated player stats | `DELETE FROM player_stats;` |

## Flags to reset

| Table | Column | Target value | SQL |
|---|---|---|---|
| `matches` | `scores_locked` | `false` | `UPDATE matches SET scores_locked = false;` |

## Notes

- **Skins** — computed dynamically from `scores`, no separate table. Wiping scores clears skins automatically.
- **Bets** — clearing the bets table also clears all pending/active/settled bets and Venmo prompts.
- **Player stats** — the stats pipeline (`PostRoundProcessor`) re-runs automatically when scores are saved post-lock, so tables just need to be empty before the tournament.
- **Venmo handles** — do NOT wipe. These are set once and carry through to the real tournament.
- **Game opt-ins** — players will re-opt-in on tournament day once games unlock (3/16 for Day 1).

## One-shot reset SQL

```sql
DELETE FROM scores;
DELETE FROM bets;
DELETE FROM game_participants;
DELETE FROM game_day_locks;
DELETE FROM player_daily_stats;
DELETE FROM player_hole_stats;
DELETE FROM player_stats;
UPDATE matches SET scores_locked = false;
```

## How to run

Tell Josh: **"reset for tournament"** — will run the above via the Supabase Management API.
