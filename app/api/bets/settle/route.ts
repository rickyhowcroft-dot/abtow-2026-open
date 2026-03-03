/**
 * /api/bets/settle
 *
 * Settles bets for a match using app-side scoring logic (lib/scoring.ts).
 * Raw data only lives in the DB; all scoring decisions happen here in TypeScript.
 * Replaces the settle_bets_for_match DB function which duplicated scoring logic in SQL.
 *
 * POST { matchId: string }   — requires admin session cookie
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  calculateSettlementSegments,
  type Match, type Score, type Player, type Course,
} from '@/lib/scoring'

export async function POST(request: NextRequest) {
  // Require admin session
  const adminCookie = request.cookies.get('abtow_admin_session')?.value
  if (!adminCookie || adminCookie !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { matchId } = await request.json() as { matchId: string }
    if (!matchId) return NextResponse.json({ error: 'Missing matchId' }, { status: 400 })

    // ── 1. Fetch raw data from DB ─────────────────────────────────────────────
    const [matchRes, scoresRes, betsRes] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).single(),
      supabase.from('scores').select('*').eq('match_id', matchId),
      supabase.from('bets').select('id, bet_type, tease_adjustment, status, side1_player_id, side2_player_id, proposer_side').eq('match_id', matchId),
    ])

    if (matchRes.error || !matchRes.data) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const match = matchRes.data as Match
    const scores = (scoresRes.data ?? []) as Score[]
    const bets   = (betsRes.data ?? []) as Array<{
      id: string; bet_type: string; tease_adjustment: number; status: string
      side1_player_id: string; side2_player_id: string; proposer_side: string
    }>

    // Fetch course + all players in the match
    const [courseRes, playersRes] = await Promise.all([
      supabase.from('courses').select('*').eq('id', match.course_id).single(),
      supabase.from('players').select('*').in('name', [...match.team1_players, ...match.team2_players]),
    ])

    if (courseRes.error || !courseRes.data) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const course  = courseRes.data as Course
    const players = (playersRes.data ?? []) as Player[]

    // ── 2. Calculate raw segment totals using lib/scoring.ts ─────────────────
    const segs = calculateSettlementSegments(match, scores, players, course)

    // ── 3. Determine winner for each active bet ───────────────────────────────
    const settlements: Array<{ betId: string; status: string }> = []

    for (const bet of bets) {
      if (bet.status !== 'active') continue

      // Map side1/side2 → team1/team2 by checking which team side1's player is in
      const side1InTeam1 = players.some(
        p => p.id === bet.side1_player_id && match.team1_players.includes(p.name)
      )
      const s1Front   = side1InTeam1 ? segs.team1Front   : segs.team2Front
      const s1Back    = side1InTeam1 ? segs.team1Back    : segs.team2Back
      const s1Overall = side1InTeam1 ? segs.team1Overall : segs.team2Overall
      const s2Front   = side1InTeam1 ? segs.team2Front   : segs.team1Front
      const s2Back    = side1InTeam1 ? segs.team2Back    : segs.team1Back
      const s2Overall = side1InTeam1 ? segs.team2Overall : segs.team1Overall

      let raw1: number, raw2: number
      if      (bet.bet_type === 'front') { raw1 = s1Front;   raw2 = s2Front }
      else if (bet.bet_type === 'back')  { raw1 = s1Back;    raw2 = s2Back }
      else                               { raw1 = s1Overall; raw2 = s2Overall }

      // Tease adds to side1's raw count
      const adj1 = raw1 + (bet.tease_adjustment ?? 0)
      const adj2 = raw2

      const status = adj1 > adj2 ? 'side1_won' : adj2 > adj1 ? 'side2_won' : 'push'
      settlements.push({ betId: bet.id, status })
    }

    // ── 4. Write results back via thin DB writer (no scoring logic in SQL) ────
    const { error: writeError } = await supabase.rpc('write_bet_settlements', {
      p_match_id:    matchId,
      p_settlements: settlements,
    })

    if (writeError) {
      console.error('write_bet_settlements error:', writeError)
      return NextResponse.json({ error: 'Failed to write settlements' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, settled: settlements.length, segments: segs })
  } catch (e) {
    console.error('bets/settle error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
