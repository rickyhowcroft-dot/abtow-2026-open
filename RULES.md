# RULES.md — ABTOW 2026 Open

> **Review this file before brainstorming, planning, or implementing anything in this project.**

---

## 🔍 Pre-Work Checklist

Before touching any code:
- [ ] Read this file top to bottom
- [ ] Check `SCHEMA.md` if touching DB or scoring logic
- [ ] Check `DEVELOPER.md` for stack and deployment notes
- [ ] Confirm env vars are set in Vercel before deploying anything that needs them

---

## 🐛 Issues Log

### Resolved

| # | Issue | Root Cause | Fix | Commit |
|---|-------|-----------|-----|--------|
| 1 | Stats not updating after score entry | `PostRoundProcessor` was blocking the response | Made call non-blocking with `.catch()` | — |
| 2 | Yurus playing handicap wrong | DB had wrong value | Updated to 12 | — |
| 3 | Day 2 Stableford settlement using wrong aggregation | Used `min()` instead of `sum()` for combined team score | Rewrote to sum both players' points | — |
| 4 | Bet acceptance visible to all users | Missing `isMe` guard on accept banner | Gated acceptance UI behind `isMe` check | — |
| 5 | Admin login returning "wrong password" | `ADMIN_PASSWORD` env var never set in Vercel | Added via `vercel env add`, redeployed | — |
| 6 | Score entry player order didn't match scorecard | `.filter()` returns DB order, not match array order | Added `.sort()` by `match.team1_players.indexOf()` | `2c7afa2` |
| 7 | Settlement RPC had scoring logic in SQL | Violation of "no scoring in SQL" rule | Moved all math to `calculateSettlementSegments()` in TypeScript | `59190d7` |
| 8 | Supabase hardcoded fallback keys in API routes | Keys were in code as fallback strings | Removed all fallbacks; pure `process.env` only | `75bb92d` |
| 9 | `/api/notify-player` was publicly callable | No auth check | Gated behind `abtow_admin_session` cookie | `75bb92d` |
| 10 | Match numbers out of order on Day pages | Cards sorted by tee time but labeled with `group_number` | Display sequential `idx + 1` from sorted array | `eb4b5ba` |
| 11 | Tied holes scored as 0 instead of 0.5 each | Wrong assumption in test cases | Fixed settlement + test suite | — |
| 12 | Winter sim league env vars lost on project recreate | Vercel project was recreated; runtime env vars not re-added | Added `UPLOAD_PASSWORD` + `GITHUB_TOKEN` manually | — |
| 13 | Format string case mismatch | DB stores `'Best Ball'`/`'Stableford'`/`'Individual'` (capitalized) | All code now uses exact capitalized strings | — |
| 14 | Vercel alias drift after GH Actions deploy | `vercel deploy --prod` creates new URL but doesn't re-alias domain | Run `vercel alias set <new-url> abtow.golf` after each GH Actions deploy | — |
| 15 | TextBelt URL whitelist never approved | Provider limitation | Migrated fully to Twilio | — |
| 16 | Twilio toll-free delivery blocked (error 30032) | Toll-free verification pending | Awaiting carrier approval; fallback: email/Resend or skip SMS | — |

---

## 🔒 Security Rules

1. **No scoring logic in SQL** — all calculations in TypeScript (`lib/scoring.ts`, `lib/games-service.ts`). SQL is a thin writer only.
2. **No secrets in code or git** — all credentials via `process.env`. No hardcoded fallbacks.
3. **Admin routes require `abtow_admin_session` HTTP-only cookie** — check with `/api/admin/verify` before any sensitive action.
4. **`/api/bets/notify` is public but constrained** — validates betId in DB, only notifies involved players, message built server-side. Never accepts arbitrary messages from client.
5. **`ADMIN_PASSWORD` server-side only** — never in client JS, never logged, never returned in API responses.
6. **Supabase anon key is client-safe** but never use it for DDL — use management API with CLI token for schema changes.
7. **RLS on all tables** — `game_participants`, `game_day_locks`, `presale_signups` have RLS enabled. Writes that need to bypass RLS use `SECURITY DEFINER` RPCs.
8. **Twilio credentials never logged or committed** — `TWILIO_AUTH_TOKEN` is server-only, never referenced in client code.
9. **SMS test messages go to Ricky only** (`+17047944613`) — never to other players during testing.
10. **Attestation flow is silent** — no SMS ever sent for attestation events.

---

## ⚠️ Known Gotchas

- **`select('*')` picks up new columns automatically** — no need to redeploy after adding a DB column, but DO update TypeScript interfaces.
- **Format strings are capitalized** — `'Best Ball'`, `'Stableford'`, `'Individual'`. Any other casing breaks scoring and settlement.
- **Playing handicap is stored in DB** — do NOT recalculate from `raw_handicap` at runtime. Use `player.playing_handicap` directly.
- **Day 3 skins use full playing handicap** — NOT the match-play delta. The delta only applies to head-to-head scoring.
- **Bet moneylines are locked at creation** — never recalculated at settlement.
- **`BetSlotPanel` must be called as a function** — `{BetSlotPanel({...})}` not `<BetSlotPanel />` to prevent remount-on-state-update.
- **Supabase DDL requires management API** — anon key cannot run `CREATE TABLE` / `ALTER TABLE`.
- **`write_bet_settlements()` is a thin SQL writer** — it accepts pre-computed results only. Zero scoring logic inside.
- **GH Actions deploys don't re-alias custom domain** — always run `vercel alias set` after a GitHub Actions deploy.
- **`game_day_locks` admin override takes priority** over automatic date/completion logic.
- **Nightly cron writes daily memory file** — do not manually write duplicate cron entries.
- **`parseTeeTime()` + `group_number` secondary sort** — match cards on homepage and day pages sort by tee time first, then group number to break ties. Always maintain both sort keys.

---

## 🏗️ Architecture Reminders

- **Stack**: Next.js 14 (App Router) + Supabase + Vercel
- **Deploy**: push `master` → GitHub Actions → `vercel deploy --prod` → ~75s
- **After deploy via GH Actions**: run `vercel alias set <new-url> abtow.golf`
- **DB project**: `fnxyorriiytdskxpedir`
- **Scoring engine**: `lib/scoring.ts` — pure functions, no side effects
- **Post-round stats**: `lib/post-round-processor.ts` → `lib/stats-service.ts` (non-blocking)
- **Tests**: `lib/__tests__/` — run `npx jest` before merging scoring changes (185 tests)
- **Admin**: `/admin` page + HTTP-only cookie session; routes at `/api/admin/*`
