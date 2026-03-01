// lib/mvp-service.ts
// Computes Tournament MVP standings:
//   Primary:    Total match points (Win=2, Draw=1, Loss=0 · max 6)
//   Secondary:  Net aggregate (sum of net scores across all days · lower = better)
//   Tiebreaker: Total birdies (higher = better)

import { supabase } from './supabase'

const COURSE_IDS: Record<number, string> = {
  1: '63b946ab-11ac-4a43-a7bd-603a22ca936a', // Ritz Carlton GC
  2: '5df9d871-7ed6-4a5a-a31e-f50246764754', // Southern Dunes
  3: '5a1d2146-09f2-4e39-97f2-0fa26fc020d3', // Champions Gate
}

type ParData = Record<string, { par: number; handicap: number }>

export interface MvpPlayer {
  playerId: string
  displayName: string
  team: string
  matchPoints: number     // 0–6
  netAggregate: number | null   // null until all 3 days scored
  birdies: number
  daysPlayed: number
  matchResults: Array<{ day: number; points: number; opponent: string }>
}

/** Net score for a single hole */
function netHoleScore(gross: number, hcp: number, strokeIndex: number): number {
  return gross - Math.floor(hcp / 18) - (strokeIndex <= (hcp % 18) ? 1 : 0)
}

/** Stableford points for a hole */
function stablefordPts(gross: number, par: number, hcp: number, strokeIndex: number): number {
  const net = netHoleScore(gross, hcp, strokeIndex)
  return Math.max(0, 2 + par - net)
}

export async function getMvpStandings(): Promise<MvpPlayer[]> {
  // 1. Fetch all data in parallel
  const [matchesRes, playersRes, scoresRes] = await Promise.all([
    supabase
      .from('matches')
      .select('id, day, format, team1_players, team2_players, scores_locked')
      .order('day'),
    supabase
      .from('players')
      .select('id, name, first_name, last_name, playing_handicap, team'),
    supabase
      .from('scores')
      .select('match_id, player_id, hole_number, gross_score'),
  ])

  const matches = matchesRes.data ?? []
  const players = playersRes.data ?? []
  const allScores = scoresRes.data ?? []

  if (players.length === 0) return []

  // Fetch par data for each day in parallel
  const parDataMap: Record<number, ParData> = {}
  await Promise.all([1, 2, 3].map(async day => {
    const { data } = await supabase
      .from('courses')
      .select('par_data')
      .eq('id', COURSE_IDS[day])
      .single()
    if (data?.par_data) parDataMap[day] = data.par_data as ParData
  }))

  // Build player map
  const playerMap = new Map(players.map(p => [p.id, p]))

  // Group scores by match then player
  const scoresByMatch: Record<string, Record<string, Record<number, number>>> = {}
  allScores.forEach(s => {
    if (!scoresByMatch[s.match_id]) scoresByMatch[s.match_id] = {}
    if (!scoresByMatch[s.match_id][s.player_id]) scoresByMatch[s.match_id][s.player_id] = {}
    scoresByMatch[s.match_id][s.player_id][s.hole_number] = s.gross_score
  })

  // Initialise player results
  const results: Record<string, MvpPlayer> = {}
  players.forEach(p => {
    const displayName = p.first_name && p.last_name
      ? `${p.first_name} ${p.last_name}`
      : p.name
    results[p.id] = {
      playerId: p.id, displayName, team: p.team ?? '',
      matchPoints: 0, netAggregate: null, birdies: 0,
      daysPlayed: 0, matchResults: [],
    }
  })

  // Process each match
  matches.forEach(match => {
    const parData = parDataMap[match.day]
    if (!parData) return
    const matchScores = scoresByMatch[match.id] ?? {}
    const isStableford = match.format === 'stableford'
    const t1: string[] = match.team1_players ?? []
    const t2: string[] = match.team2_players ?? []
    const allIds = [...t1, ...t2]

    // Check enough scores exist (need all 18 holes for every player)
    const hasFullScores = allIds.every(pid => {
      const holes = matchScores[pid] ?? {}
      return Object.keys(holes).length === 18
    })
    if (!hasFullScores) return

    const isMatchPlay = match.format === 'individual'

    // Compute match result per format
    let t1Pts: number, t2Pts: number

    if (isStableford) {
      // Day 2: Combined Stableford — sum both players' points per hole
      let s1Total = 0, s2Total = 0
      for (let h = 1; h <= 18; h++) {
        const par = parData[`hole_${h}`]?.par ?? 4
        const si  = parData[`hole_${h}`]?.handicap ?? h
        s1Total += t1.reduce((sum, pid) => {
          const g = matchScores[pid]?.[h]; if (g == null) return sum
          return sum + stablefordPts(g, par, playerMap.get(pid)?.playing_handicap ?? 0, si)
        }, 0)
        s2Total += t2.reduce((sum, pid) => {
          const g = matchScores[pid]?.[h]; if (g == null) return sum
          return sum + stablefordPts(g, par, playerMap.get(pid)?.playing_handicap ?? 0, si)
        }, 0)
      }
      t1Pts = s1Total > s2Total ? 2 : s1Total === s2Total ? 1 : 0
      t2Pts = s2Total > s1Total ? 2 : s1Total === s2Total ? 1 : 0

    } else if (isMatchPlay) {
      // Day 3: Individual match play — delta strokes on lowest SI holes, hole-by-hole
      const pid1 = t1[0], pid2 = t2[0]
      const hcp1 = playerMap.get(pid1)?.playing_handicap ?? 0
      const hcp2 = playerMap.get(pid2)?.playing_handicap ?? 0
      const delta = Math.abs(hcp1 - hcp2)
      let s1Holes = 0, s2Holes = 0

      for (let h = 1; h <= 18; h++) {
        const si = parData[`hole_${h}`]?.handicap ?? h
        const g1 = matchScores[pid1]?.[h], g2 = matchScores[pid2]?.[h]
        if (g1 == null || g2 == null) continue
        // Only the higher hcp player gets strokes (delta only, not full hcp)
        const extra1 = hcp1 >= hcp2 ? Math.floor(delta / 18) + (si <= (delta % 18) ? 1 : 0) : 0
        const extra2 = hcp2 >  hcp1 ? Math.floor(delta / 18) + (si <= (delta % 18) ? 1 : 0) : 0
        const net1 = g1 - extra1, net2 = g2 - extra2
        if (net1 < net2)      { s1Holes += 1 }
        else if (net2 < net1) { s2Holes += 1 }
        else                  { s1Holes += 0.5; s2Holes += 0.5 }
      }
      t1Pts = s1Holes > s2Holes ? 2 : s1Holes === s2Holes ? 1 : 0
      t2Pts = s2Holes > s1Holes ? 2 : s1Holes === s2Holes ? 1 : 0

    } else {
      // Day 1: Best Ball — full handicap net, min net per hole per team
      let s1Total = 0, s2Total = 0
      for (let h = 1; h <= 18; h++) {
        const si = parData[`hole_${h}`]?.handicap ?? h
        const t1Nets = t1.map(pid => { const g = matchScores[pid]?.[h]; return g == null ? Infinity : netHoleScore(g, playerMap.get(pid)?.playing_handicap ?? 0, si) })
        const t2Nets = t2.map(pid => { const g = matchScores[pid]?.[h]; return g == null ? Infinity : netHoleScore(g, playerMap.get(pid)?.playing_handicap ?? 0, si) })
        s1Total += Math.min(...t1Nets)
        s2Total += Math.min(...t2Nets)
      }
      t1Pts = s1Total < s2Total ? 2 : s1Total === s2Total ? 1 : 0
      t2Pts = s2Total < s1Total ? 2 : s1Total === s2Total ? 1 : 0
    }

    // Opponent name labels
    const t1Label = t1.map(id => playerMap.get(id)?.first_name ?? playerMap.get(id)?.name.split(' ')[0] ?? '?').join(' & ')
    const t2Label = t2.map(id => playerMap.get(id)?.first_name ?? playerMap.get(id)?.name.split(' ')[0] ?? '?').join(' & ')

    // Assign match points + net aggregate per player
    t1.forEach(pid => {
      if (!results[pid]) return
      results[pid].matchPoints += t1Pts
      results[pid].daysPlayed += 1
      results[pid].matchResults.push({ day: match.day, points: t1Pts, opponent: t2Label })

      // Net aggregate (individual net score for this day)
      const gross = Object.values(matchScores[pid] ?? {})
      if (gross.length === 18) {
        const hcp = playerMap.get(pid)?.playing_handicap ?? 0
        const netTotal = Array.from({ length: 18 }, (_, i) => {
          const h = i + 1
          const g = matchScores[pid]?.[h] ?? 0
          const si = parData[`hole_${h}`]?.handicap ?? h
          return netHoleScore(g, hcp, si)
        }).reduce((a, b) => a + b, 0)
        results[pid].netAggregate = (results[pid].netAggregate ?? 0) + netTotal
      }

      // Birdies
      Array.from({ length: 18 }, (_, i) => i + 1).forEach(h => {
        const g = matchScores[pid]?.[h]
        if (g == null) return
        const par = parData[`hole_${h}`]?.par ?? 4
        if (g - par <= -1) results[pid].birdies++
      })
    })

    t2.forEach(pid => {
      if (!results[pid]) return
      results[pid].matchPoints += t2Pts
      results[pid].daysPlayed += 1
      results[pid].matchResults.push({ day: match.day, points: t2Pts, opponent: t1Label })

      const gross = Object.values(matchScores[pid] ?? {})
      if (gross.length === 18) {
        const hcp = playerMap.get(pid)?.playing_handicap ?? 0
        const netTotal = Array.from({ length: 18 }, (_, i) => {
          const h = i + 1
          const g = matchScores[pid]?.[h] ?? 0
          const si = parData[`hole_${h}`]?.handicap ?? h
          return netHoleScore(g, hcp, si)
        }).reduce((a, b) => a + b, 0)
        results[pid].netAggregate = (results[pid].netAggregate ?? 0) + netTotal
      }

      Array.from({ length: 18 }, (_, i) => i + 1).forEach(h => {
        const g = matchScores[pid]?.[h]
        if (g == null) return
        const par = parData[`hole_${h}`]?.par ?? 4
        if (g - par <= -1) results[pid].birdies++
      })
    })
  })

  // Sort: match pts DESC → net agg ASC (lower = better) → birdies DESC
  return Object.values(results).sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints
    // Net aggregate — null (no scores yet) sorts to the bottom
    if (a.netAggregate === null && b.netAggregate === null) return 0
    if (a.netAggregate === null) return 1
    if (b.netAggregate === null) return -1
    if (a.netAggregate !== b.netAggregate) return a.netAggregate - b.netAggregate
    return b.birdies - a.birdies
  })
}
