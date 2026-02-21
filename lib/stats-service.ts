import { supabase } from './supabase'
import type { Database } from './supabase'

type Player = Database['public']['Tables']['players']['Row']
type Course = Database['public']['Tables']['courses']['Row']
type Match = Database['public']['Tables']['matches']['Row']
type Score = Database['public']['Tables']['scores']['Row']
type PlayerStats = Database['public']['Tables']['player_stats']['Row']
type PlayerDailyStats = Database['public']['Tables']['player_daily_stats']['Row']
type PlayerHoleStats = Database['public']['Tables']['player_hole_stats']['Row']

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
    
    const bestRound = dailyStats?.[0] ? {
      day: dailyStats[0].day,
      grossScore: dailyStats[0].gross_score!,
      course: (dailyStats[0].courses as any).name
    } : null
    
    const worstRound = dailyStats?.length > 0 ? {
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
   * Get all players' stats for overview page
   */
  static async getAllPlayersStats(): Promise<PlayerStatsOverview[]> {
    const { data: allStats, error } = await supabase
      .from('player_stats')
      .select(`
        *,
        players!inner(name, team)
      `)
      .eq('tournament_year', 2026)
      .order('total_gross_strokes', { ascending: true })
    
    if (error || !allStats) return []
    
    const results: PlayerStatsOverview[] = []
    
    for (const stats of allStats) {
      const player = stats.players as any
      
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
        bestRound: null, // We'll add this later if needed for the overview
        worstRound: null
      })
    }
    
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
    
    return data || []
  }
  
  /**
   * Get daily performance for a player
   */
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
}

export default StatsService