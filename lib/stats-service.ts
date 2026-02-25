import { supabase } from './supabase'
import type { Database } from './supabase'

type Player = Database['public']['Tables']['players']['Row']
type Course = Database['public']['Tables']['courses']['Row']
type Match = Database['public']['Tables']['matches']['Row']
type Score = Database['public']['Tables']['scores']['Row']
type PlayerStats = Database['public']['Tables']['player_stats']['Row']
export type PlayerDailyStats = Database['public']['Tables']['player_daily_stats']['Row']
export type PlayerHoleStats = Database['public']['Tables']['player_hole_stats']['Row']

export interface PlayerScoreCard {
  playerId: string
  matchId: string
  day: number
  courseId: string
  playingHandicap: number
  scores: Array<{
    holeNumber: number
    grossScore: number
    par: number
    netScore: number
  }>
}

export interface PlayerStatsOverview extends PlayerStats {
  playerName: string
  team: string
  scoringAverage: number
  netScoringAverage: number
  handicapPerformance: number
  bestRound: { day: number; grossScore: number; course: string } | null
  worstRound: { day: number; grossScore: number; course: string } | null
}

export class StatsService {
  
  /**
   * Calculate stats for a player's completed round
   */
  static async calculateRoundStats(scoreCard: PlayerScoreCard): Promise<{
    dailyStats: Partial<PlayerDailyStats>
    holeStats: Array<Partial<PlayerHoleStats>>
    overallStats: Partial<PlayerStats>
  }> {
    const { scores, playingHandicap } = scoreCard
    
    // Calculate score distribution
    const scoreDistribution = {
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      double_bogeys: 0,
      triple_bogeys_plus: 0
    }
    
    const holeStatsUpdates: Array<Partial<PlayerHoleStats>> = []
    const bestHoles: number[] = []
    const worstHoles: number[] = []
    
    let totalGrossStrokes = 0
    let totalNetStrokes = 0
    
    scores.forEach(({ holeNumber, grossScore, par, netScore }) => {
      totalGrossStrokes += grossScore
      totalNetStrokes += netScore
      
      const strokesToPar = grossScore - par
      
      // Categorize the score
      if (strokesToPar <= -2) {
        scoreDistribution.eagles++
      } else if (strokesToPar === -1) {
        scoreDistribution.birdies++
      } else if (strokesToPar === 0) {
        scoreDistribution.pars++
      } else if (strokesToPar === 1) {
        scoreDistribution.bogeys++
      } else if (strokesToPar === 2) {
        scoreDistribution.double_bogeys++
      } else {
        scoreDistribution.triple_bogeys_plus++
      }
      
      // Track best/worst holes (birdie or better = best, double bogey or worse = worst)
      if (strokesToPar <= -1) {
        bestHoles.push(holeNumber)
      } else if (strokesToPar >= 2) {
        worstHoles.push(holeNumber)
      }
      
      // Prepare hole-specific stats update
      holeStatsUpdates.push({
        player_id: scoreCard.playerId,
        hole_number: holeNumber,
        times_played: 1, // Will be incremented in upsert
        total_gross_strokes: grossScore,
        eagles: strokesToPar <= -2 ? 1 : 0,
        birdies: strokesToPar === -1 ? 1 : 0,
        pars: strokesToPar === 0 ? 1 : 0,
        bogeys: strokesToPar === 1 ? 1 : 0,
        double_bogeys: strokesToPar === 2 ? 1 : 0,
        triple_bogeys_plus: strokesToPar >= 3 ? 1 : 0,
        best_score: grossScore,
        worst_score: grossScore
      })
    })
    
    const strokesToHandicap = totalGrossStrokes - (72 + playingHandicap)
    
    // Daily stats
    const dailyStats: Partial<PlayerDailyStats> = {
      player_id: scoreCard.playerId,
      course_id: scoreCard.courseId,
      day: scoreCard.day,
      gross_score: totalGrossStrokes,
      net_score: totalNetStrokes,
      playing_handicap: playingHandicap,
      strokes_to_handicap: strokesToHandicap,
      best_holes: bestHoles.length > 0 ? bestHoles : null,
      worst_holes: worstHoles.length > 0 ? worstHoles : null,
      ...scoreDistribution
    }
    
    // Overall stats increments
    const overallStats: Partial<PlayerStats> = {
      player_id: scoreCard.playerId,
      total_rounds_played: 1,
      total_gross_strokes: totalGrossStrokes,
      total_net_strokes: totalNetStrokes,
      total_holes_played: scores.length,
      rounds_under_handicap: strokesToHandicap < 0 ? 1 : 0,
      rounds_at_handicap: strokesToHandicap === 0 ? 1 : 0,
      rounds_over_handicap: strokesToHandicap > 0 ? 1 : 0,
      total_strokes_to_handicap: strokesToHandicap,
      ...scoreDistribution
    }
    
    return { dailyStats, holeStats: holeStatsUpdates, overallStats }
  }
  
  /**
   * Update player stats after a completed round
   */
  static async updatePlayerStats(scoreCard: PlayerScoreCard): Promise<void> {
    const { dailyStats, holeStats, overallStats } = await this.calculateRoundStats(scoreCard)
    
    try {
      // Upsert daily stats
      await supabase
        .from('player_daily_stats')
        .upsert(dailyStats, { 
          onConflict: 'player_id,course_id,day'
        })
      
      // Update hole stats (increment existing values)
      for (const holeStat of holeStats) {
        await supabase.rpc('upsert_hole_stats', {
          p_player_id: holeStat.player_id,
          p_hole_number: holeStat.hole_number,
          p_gross_score: holeStat.total_gross_strokes,
          p_eagles: holeStat.eagles,
          p_birdies: holeStat.birdies,
          p_pars: holeStat.pars,
          p_bogeys: holeStat.bogeys,
          p_double_bogeys: holeStat.double_bogeys,
          p_triple_plus: holeStat.triple_bogeys_plus
        })
      }
      
      // Update overall stats (increment existing values)
      await supabase.rpc('upsert_player_stats', {
        p_player_id: overallStats.player_id,
        p_rounds_played: overallStats.total_rounds_played,
        p_gross_strokes: overallStats.total_gross_strokes,
        p_net_strokes: overallStats.total_net_strokes,
        p_holes_played: overallStats.total_holes_played,
        p_eagles: overallStats.eagles,
        p_birdies: overallStats.birdies,
        p_pars: overallStats.pars,
        p_bogeys: overallStats.bogeys,
        p_double_bogeys: overallStats.double_bogeys,
        p_triple_plus: overallStats.triple_bogeys_plus,
        p_rounds_under: overallStats.rounds_under_handicap,
        p_rounds_at: overallStats.rounds_at_handicap,
        p_rounds_over: overallStats.rounds_over_handicap,
        p_strokes_to_hcp: overallStats.total_strokes_to_handicap
      })
      
    } catch (error) {
      console.error('Error updating player stats:', error)
      throw error
    }
  }
  
  /**
   * Get comprehensive stats for a player
   */
  static async getPlayerStats(playerId: string): Promise<PlayerStatsOverview | null> {
    const { data: stats, error } = await supabase
      .from('player_stats')
      .select(`
        *,
        players!inner(name, team)
      `)
      .eq('player_id', playerId)
      .eq('tournament_year', 2026)
      .single()
    
    if (error || !stats) return null
    
    // Get daily stats for best/worst rounds
    const { data: dailyStats } = await supabase
      .from('player_daily_stats')
      .select(`
        *,
        courses!inner(name)
      `)
      .eq('player_id', playerId)
      .order('gross_score', { ascending: true })
    
    const player = stats.players as any
    
    const bestRound = (dailyStats && dailyStats.length > 0 && dailyStats[0]) ? {
      day: dailyStats[0].day,
      grossScore: dailyStats[0].gross_score!,
      course: (dailyStats[0].courses as any).name
    } : null
    
    const worstRound = (dailyStats && dailyStats.length > 0) ? {
      day: dailyStats[dailyStats.length - 1].day,
      grossScore: dailyStats[dailyStats.length - 1].gross_score!,
      course: (dailyStats[dailyStats.length - 1].courses as any).name
    } : null
    
    return {
      ...stats,
      playerName: player.name,
      team: player.team,
      scoringAverage: stats.total_rounds_played > 0 
        ? stats.total_gross_strokes / stats.total_rounds_played 
        : 0,
      netScoringAverage: stats.total_rounds_played > 0
        ? stats.total_net_strokes / stats.total_rounds_played
        : 0,
      handicapPerformance: stats.total_rounds_played > 0
        ? stats.total_strokes_to_handicap / stats.total_rounds_played
        : 0,
      bestRound,
      worstRound
    }
  }
  
  /**
   * Get all players' stats for overview page — always returns all 20 players,
   * defaulting to zeros for players who haven't completed a round yet.
   */
  static async getAllPlayersStats(): Promise<PlayerStatsOverview[]> {
    // Fetch all players
    const { data: allPlayers, error: playersError } = await supabase
      .from('players')
      .select('id, name, team')
      .order('name', { ascending: true })

    if (playersError || !allPlayers) return []

    // Fetch all stats rows for 2026
    const { data: allStatsRows } = await supabase
      .from('player_stats')
      .select('*')
      .eq('tournament_year', 2026)

    // Build a lookup map: player_id → stats row
    const statsMap = new Map<string, PlayerStats>()
    for (const row of allStatsRows || []) {
      statsMap.set(row.player_id, row)
    }

    const results: PlayerStatsOverview[] = []

    for (const player of allPlayers) {
      const stats = statsMap.get(player.id)

      if (stats) {
        results.push({
          ...stats,
          playerName: player.name,
          team: player.team,
          scoringAverage: stats.total_rounds_played > 0
            ? stats.total_gross_strokes / stats.total_rounds_played
            : 0,
          netScoringAverage: stats.total_rounds_played > 0
            ? stats.total_net_strokes / stats.total_rounds_played
            : 0,
          handicapPerformance: stats.total_rounds_played > 0
            ? stats.total_strokes_to_handicap / stats.total_rounds_played
            : 0,
          bestRound: null,
          worstRound: null
        })
      } else {
        // Player hasn't played yet — show with zero stats
        results.push({
          id: '',
          player_id: player.id,
          tournament_year: 2026,
          team_matches_played: 0,
          team_matches_won: 0,
          team_matches_lost: 0,
          team_matches_tied: 0,
          individual_matches_played: 0,
          individual_matches_won: 0,
          individual_matches_lost: 0,
          individual_matches_tied: 0,
          total_rounds_played: 0,
          total_gross_strokes: 0,
          total_net_strokes: 0,
          total_holes_played: 0,
          eagles: 0,
          birdies: 0,
          pars: 0,
          bogeys: 0,
          double_bogeys: 0,
          triple_bogeys_plus: 0,
          rounds_under_handicap: 0,
          rounds_at_handicap: 0,
          rounds_over_handicap: 0,
          total_strokes_to_handicap: 0,
          created_at: '',
          updated_at: '',
          playerName: player.name,
          team: player.team,
          scoringAverage: 0,
          netScoringAverage: 0,
          handicapPerformance: 0,
          bestRound: null,
          worstRound: null
        })
      }
    }

    // Sort by scoring average (players with rounds first, then unplayed)
    results.sort((a, b) => {
      if (a.total_rounds_played === 0 && b.total_rounds_played === 0) return a.playerName.localeCompare(b.playerName)
      if (a.total_rounds_played === 0) return 1
      if (b.total_rounds_played === 0) return -1
      return a.scoringAverage - b.scoringAverage
    })

    return results
  }
  
  /**
   * Get hole-by-hole statistics for a player
   */
  static async getPlayerHoleStats(playerId: string): Promise<PlayerHoleStats[]> {
    const { data, error } = await supabase
      .from('player_hole_stats')
      .select('*')
      .eq('player_id', playerId)
      .order('hole_number')
    
    if (error) {
      console.error('Error fetching hole stats:', error)
      return []
    }
    
    return data || []
  }
  
  /**
   * Get daily performance for a player
   */
  /**
   * Fetch per-hole scorecard data for a player across all days played.
   */
  static async getPlayerScorecardData(playerId: string): Promise<Array<{
    day: number
    courseName: string
    playingHandicap: number
    holes: Array<{ holeNumber: number; par: number; holeHandicap: number; grossScore: number | null; netScore: number | null; strokesGiven: number }>
    frontGross: number; frontNet: number; frontPar: number
    backGross: number; backNet: number; backPar: number
    totalGross: number; totalNet: number; totalPar: number
  }>> {
    // Fetch all scores for this player
    const { data: scores, error: scoresErr } = await supabase
      .from('scores')
      .select('match_id, hole_number, gross_score')
      .eq('player_id', playerId)
      .not('gross_score', 'is', null)
      .order('hole_number')
    if (scoresErr || !scores) return []

    // Fetch player (need playing_handicap)
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('playing_handicap')
      .eq('id', playerId)
      .single()
    if (playerErr || !player) return []

    // Fetch matches the player has scores in (with day + course)
    const matchIds = Array.from(new Set(scores.map(s => s.match_id)))
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('id, day, course_id')
      .in('id', matchIds)
    if (matchesErr || !matches) return []

    // Fetch courses
    const courseIds = Array.from(new Set(matches.map(m => m.course_id)))
    const { data: courses, error: coursesErr } = await supabase
      .from('courses')
      .select('id, name, par_data')
      .in('id', courseIds)
    if (coursesErr || !courses) return []

    const courseMap = new Map(courses.map(c => [c.id, c]))
    const playerHandicap = player.playing_handicap ?? 0

    function strokesGiven(handicap: number, holeHandicap: number): number {
      return Math.floor(handicap / 18) + (holeHandicap <= (handicap % 18) ? 1 : 0)
    }

    return matches
      .sort((a, b) => a.day - b.day)
      .map(match => {
        const course = courseMap.get(match.course_id)!
        const parData = course.par_data as Record<string, { par: number; handicap: number }>
        const matchScores = scores.filter(s => s.match_id === match.id)
        const scoreMap = new Map(matchScores.map(s => [s.hole_number, s.gross_score]))

        const holes = Array.from({ length: 18 }, (_, i) => {
          const h = i + 1
          const holeData = parData[`hole_${h}`]
          const gross = scoreMap.get(h) ?? null
          const strokes = strokesGiven(playerHandicap, holeData.handicap)
          const net = gross !== null ? gross - strokes : null
          return { holeNumber: h, par: holeData.par, holeHandicap: holeData.handicap, grossScore: gross, netScore: net, strokesGiven: strokes }
        })

        const front = holes.slice(0, 9)
        const back = holes.slice(9, 18)
        const sumGross = (arr: typeof holes) => arr.reduce((s, h) => s + (h.grossScore ?? 0), 0)
        const sumNet = (arr: typeof holes) => arr.reduce((s, h) => s + (h.netScore ?? 0), 0)
        const sumPar = (arr: typeof holes) => arr.reduce((s, h) => s + h.par, 0)

        return {
          day: match.day,
          courseName: course.name,
          playingHandicap: playerHandicap,
          holes,
          frontGross: sumGross(front), frontNet: sumNet(front), frontPar: sumPar(front),
          backGross: sumGross(back), backNet: sumNet(back), backPar: sumPar(back),
          totalGross: sumGross(holes), totalNet: sumNet(holes), totalPar: sumPar(holes),
        }
      })
  }

  static async getPlayerDailyStats(playerId: string): Promise<Array<PlayerDailyStats & { courseName: string }>> {
    const { data, error } = await supabase
      .from('player_daily_stats')
      .select(`
        *,
        courses!inner(name)
      `)
      .eq('player_id', playerId)
      .order('day')
    
    if (error || !data) return []
    
    return data.map(stat => ({
      ...stat,
      courseName: (stat.courses as any).name
    }))
  }

  /**
   * Dream Round — the best gross and net score achieved on each hole
   * across all players and all tournament days, summed across 18 holes.
   * Includes per-hole player attribution and top contributor.
   */
  static async getDreamRound(): Promise<{
    gross: number
    net: number
    topGrossContributor: string
    topNetContributor: string
    holeBreakdown: Array<{ hole: number; gross: number; grossPlayer: string; net: number; netPlayer: string }>
    playerDreamRounds: Array<{ playerId: string; playerName: string; dreamGross: number; dreamNet: number }>
  } | null> {
    // Fetch all non-null scores
    const { data: scores, error: scoresErr } = await supabase
      .from('scores')
      .select('player_id, match_id, hole_number, gross_score')
      .not('gross_score', 'is', null)
    if (scoresErr || !scores || scores.length === 0) return null

    // Fetch players (need playing_handicap + display name)
    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('id, name, nickname, playing_handicap')
    if (playersErr || !players) return null

    // Fetch matches (need course_id)
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('id, course_id')
    if (matchesErr || !matches) return null

    // Fetch courses (need par_data for hole handicap ratings)
    const { data: courses, error: coursesErr } = await supabase
      .from('courses')
      .select('id, par_data')
    if (coursesErr || !courses) return null

    // Build lookup maps
    const playerHandicapMap = new Map(players.map(p => [p.id, p.playing_handicap ?? 0]))
    const playerNameMap = new Map(players.map(p => [p.id, (p.nickname || p.name || '').split(' ')[0]]))
    const matchCourseMap = new Map(matches.map(m => [m.id, m.course_id]))
    const courseParMap = new Map(courses.map(c => [c.id, c.par_data as Record<string, { handicap: number; par: number }>]))

    // Net score calculation (mirrors scoring.ts calculateNetScore)
    function calcNet(gross: number, handicap: number, holeHandicap: number): number {
      const strokes = Math.floor(handicap / 18) + (holeHandicap <= (handicap % 18) ? 1 : 0)
      return gross - strokes
    }

    // For each hole (1-18): track best gross/net across all players and per-player
    const bestGross: Record<number, { score: number; playerId: string }> = {}
    const bestNet: Record<number, { score: number; playerId: string }> = {}
    // Per-player personal dream round: best score per hole per player
    const perPlayerBestGross: Record<string, Record<number, number>> = {}
    const perPlayerBestNet: Record<string, Record<number, number>> = {}

    for (const score of scores) {
      if (!score.gross_score || !score.hole_number) continue
      const courseId = matchCourseMap.get(score.match_id)
      if (!courseId) continue
      const parData = courseParMap.get(courseId)
      if (!parData) continue
      const holeKey = `hole_${score.hole_number}`
      const holeData = parData[holeKey]
      if (!holeData) continue
      const handicap = playerHandicapMap.get(score.player_id) ?? 0
      const gross = score.gross_score
      const net = calcNet(gross, handicap, holeData.handicap)
      const h = score.hole_number
      const pid = score.player_id
      // Composite dream round
      if (bestGross[h] === undefined || gross < bestGross[h].score) bestGross[h] = { score: gross, playerId: pid }
      if (bestNet[h] === undefined || net < bestNet[h].score) bestNet[h] = { score: net, playerId: pid }
      // Per-player personal dream round
      if (!perPlayerBestGross[pid]) perPlayerBestGross[pid] = {}
      if (!perPlayerBestNet[pid]) perPlayerBestNet[pid] = {}
      if (perPlayerBestGross[pid][h] === undefined || gross < perPlayerBestGross[pid][h]) perPlayerBestGross[pid][h] = gross
      if (perPlayerBestNet[pid][h] === undefined || net < perPlayerBestNet[pid][h]) perPlayerBestNet[pid][h] = net
    }

    // Need all 18 holes to have at least one score
    const holes = Array.from({ length: 18 }, (_, i) => i + 1)
    if (holes.some(h => bestGross[h] === undefined)) return null

    const dreamGross = holes.reduce((sum, h) => sum + bestGross[h].score, 0)
    const dreamNet = holes.reduce((sum, h) => sum + bestNet[h].score, 0)

    // Top contributor = player who owns the most holes in the dream round
    const grossCounts: Record<string, number> = {}
    const netCounts: Record<string, number> = {}
    holes.forEach(h => {
      const gp = bestGross[h].playerId
      const np = bestNet[h].playerId
      grossCounts[gp] = (grossCounts[gp] ?? 0) + 1
      netCounts[np] = (netCounts[np] ?? 0) + 1
    })
    const topGrossId = Object.entries(grossCounts).sort((a, b) => b[1] - a[1])[0][0]
    const topNetId = Object.entries(netCounts).sort((a, b) => b[1] - a[1])[0][0]

    // Per-player personal dream rounds (only for players who have all 18 holes)
    const playerDreamRounds = Object.entries(perPlayerBestGross)
      .filter(([pid]) => Object.keys(perPlayerBestGross[pid]).length === 18)
      .map(([pid]) => {
        const dreamGross = holes.reduce((sum, h) => sum + (perPlayerBestGross[pid][h] ?? 0), 0)
        const dreamNet = holes.reduce((sum, h) => sum + (perPlayerBestNet[pid]?.[h] ?? 0), 0)
        return { playerId: pid, playerName: playerNameMap.get(pid) ?? '', dreamGross, dreamNet }
      })
      .sort((a, b) => a.dreamGross - b.dreamGross)

    return {
      gross: dreamGross,
      net: dreamNet,
      topGrossContributor: playerNameMap.get(topGrossId) ?? '',
      topNetContributor: playerNameMap.get(topNetId) ?? '',
      holeBreakdown: holes.map(h => ({
        hole: h,
        gross: bestGross[h].score,
        grossPlayer: playerNameMap.get(bestGross[h].playerId) ?? '',
        net: bestNet[h].score,
        netPlayer: playerNameMap.get(bestNet[h].playerId) ?? '',
      })),
      playerDreamRounds
    }
  }
}

export default StatsService