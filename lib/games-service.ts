// lib/games-service.ts
import { supabase } from './supabase'

export const COURSE_IDS: Record<number, string> = {
  1: '63b946ab-11ac-4a43-a7bd-603a22ca936a', // Ritz Carlton GC
  2: '5df9d871-7ed6-4a5a-a31e-f50246764754', // Southern Dunes
  3: '5a1d2146-09f2-4e39-97f2-0fa26fc020d3', // Champions Gate
}

export interface HoleData {
  par: number
  handicap: number // stroke index — 1 = hardest
}

export type ParData = Record<string, HoleData> // "hole_1" → { par, handicap }

export interface HandicapGamePlayer {
  playerId: string
  name: string
  displayName: string
  playingHandicap: number
  targetPoints: number
  holePoints: number[]      // points earned per hole (index 0 = hole 1)
  holeGross: number[]       // gross score per hole
  totalPoints: number
  surplus: number
  eligible: boolean
  birdies: number
  pars: number
  holesPlayed: number
}

export interface HandicapGameResult {
  players: HandicapGamePlayer[]
  parData: ParData | null
  dayComplete: boolean       // true when all matches for this day are locked
  scoresEntered: boolean     // true when any scores exist at all
}

// ─── Opt-in ───────────────────────────────────────────────────────────────────

export interface GameParticipant {
  id: string
  game_id: string
  day: number
  player_id: string
  opted_in_at: string
}

export async function getGameParticipants(gameId: string, day: number): Promise<GameParticipant[]> {
  const { data } = await supabase
    .from('game_participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('day', day)
  return (data ?? []) as GameParticipant[]
}

export async function getPlayerGameParticipation(playerId: string): Promise<GameParticipant[]> {
  const { data } = await supabase
    .from('game_participants')
    .select('*')
    .eq('player_id', playerId)
    .order('day')
  return (data ?? []) as GameParticipant[]
}

export async function optInToGame(gameId: string, day: number, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('game_participants')
    .insert({ game_id: gameId, day, player_id: playerId })
  if (error && !error.message.includes('duplicate')) throw error
}

export async function optOutOfGame(gameId: string, day: number, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('game_participants')
    .delete()
    .eq('game_id', gameId)
    .eq('day', day)
    .eq('player_id', playerId)
  if (error) throw error
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Points for a hole based on score vs par */
export function holePoints(scoreVsPar: number): number {
  if (scoreVsPar <= -3) return 16 // Double eagle
  if (scoreVsPar === -2)  return 8  // Eagle
  if (scoreVsPar === -1)  return 4  // Birdie
  if (scoreVsPar === 0)   return 2  // Par
  if (scoreVsPar === 1)   return 1  // Bogey
  return 0                           // Double bogey+
}

export function holePointsLabel(scoreVsPar: number): string {
  if (scoreVsPar <= -3) return 'Double Eagle'
  if (scoreVsPar === -2)  return 'Eagle'
  if (scoreVsPar === -1)  return 'Birdie'
  if (scoreVsPar === 0)   return 'Par'
  if (scoreVsPar === 1)   return 'Bogey'
  return 'Double Bogey+'
}

/**
 * Check whether all matches for a given day are locked.
 * Used to determine if the NEXT day's game is unlocked.
 */
export async function isDayComplete(day: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('matches')
    .select('scores_locked')
    .eq('day', day)
  if (error || !data || data.length === 0) return false
  return data.every(m => m.scores_locked === true)
}

/** Fetch handicap game results for a given day */
export async function getHandicapGameResults(day: number): Promise<HandicapGameResult> {
  const courseId = COURSE_IDS[day]

  // Fetch matches + course + players + scores in parallel
  const [matchesRes, courseRes, playersRes] = await Promise.all([
    supabase.from('matches').select('id, day, scores_locked, team1_players, team2_players').eq('day', day),
    supabase.from('courses').select('par_data').eq('id', courseId).single(),
    supabase.from('players').select('id, name, first_name, last_name, playing_handicap').order('name'),
  ])

  const matches = matchesRes.data ?? []
  const parData: ParData | null = (courseRes.data?.par_data as ParData) ?? null
  const allPlayers = playersRes.data ?? []

  const dayComplete = matches.length > 0 && matches.every(m => m.scores_locked)
  const matchIds = matches.map(m => m.id)

  // Collect all player IDs for this day
  const playerIdSet = new Set<string>()
  matches.forEach(m => {
    ;(m.team1_players ?? []).forEach((id: string) => playerIdSet.add(id))
    ;(m.team2_players ?? []).forEach((id: string) => playerIdSet.add(id))
  })
  const playerIds = Array.from(playerIdSet)

  // Fetch all scores for this day
  let scores: { player_id: string; hole_number: number; gross_score: number }[] = []
  if (matchIds.length > 0) {
    const { data } = await supabase
      .from('scores')
      .select('player_id, hole_number, gross_score')
      .in('match_id', matchIds)
    scores = data ?? []
  }

  const scoresEntered = scores.length > 0

  // Group scores by player
  const scoresByPlayer: Record<string, Record<number, number>> = {}
  scores.forEach(s => {
    if (!scoresByPlayer[s.player_id]) scoresByPlayer[s.player_id] = {}
    scoresByPlayer[s.player_id][s.hole_number] = s.gross_score
  })

  // Build player results
  const players: HandicapGamePlayer[] = playerIds.map(pid => {
    const p = allPlayers.find(pl => pl.id === pid)
    if (!p) return null
    const hcp = p.playing_handicap ?? 0
    const target = 36 - hcp
    const pScores = scoresByPlayer[pid] ?? {}
    const holePointsArr: number[] = []
    const holeGrossArr: number[] = []
    let birdies = 0, pars = 0, holesPlayed = 0

    for (let h = 1; h <= 18; h++) {
      const gross = pScores[h]
      if (gross == null) {
        holePointsArr.push(0)
        holeGrossArr.push(0)
        continue
      }
      holesPlayed++
      const par = parData ? (parData[`hole_${h}`]?.par ?? 4) : 4
      const svp = gross - par
      const pts = holePoints(svp)
      holePointsArr.push(pts)
      holeGrossArr.push(gross)
      if (svp === -1) birdies++
      if (svp === 0) pars++
    }

    const totalPoints = holePointsArr.reduce((s, v) => s + v, 0)
    const surplus = totalPoints - target
    const eligible = totalPoints >= target
    const displayName = p.first_name && p.last_name
      ? `${p.first_name} ${p.last_name}`
      : p.name

    return {
      playerId: pid, name: p.name, displayName,
      playingHandicap: hcp, targetPoints: target,
      holePoints: holePointsArr, holeGross: holeGrossArr,
      totalPoints, surplus, eligible, birdies, pars, holesPlayed,
    }
  }).filter(Boolean) as HandicapGamePlayer[]

  // Sort: eligible first (by surplus desc), then non-eligible (by totalPoints desc)
  // Tiebreaker: low gross on hardest handicap hole (stroke_index 1 → 2 → ...)
  const holesByDifficulty: number[] = parData
    ? Array.from({ length: 18 }, (_, i) => i + 1)
        .sort((a, b) => (parData[`hole_${a}`]?.handicap ?? 99) - (parData[`hole_${b}`]?.handicap ?? 99))
    : Array.from({ length: 18 }, (_, i) => i + 1)

  players.sort((a, b) => {
    // Eligible beats non-eligible
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    // Both eligible: sort by surplus desc
    if (a.eligible && b.eligible) {
      if (b.surplus !== a.surplus) return b.surplus - a.surplus
      // Tiebreak: low gross on hardest hole
      for (const hole of holesByDifficulty) {
        const gA = a.holeGross[hole - 1]
        const gB = b.holeGross[hole - 1]
        if (gA !== gB) return gA - gB // lower gross wins
      }
      // Still tied: most birdies
      if (a.birdies !== b.birdies) return b.birdies - a.birdies
      // Then most pars
      return b.pars - a.pars
    }
    // Both ineligible: sort by totalPoints desc
    return b.totalPoints - a.totalPoints
  })

  return { players, parData, dayComplete, scoresEntered }
}
