import { supabase } from './supabase'
import StatsService, { type PlayerScoreCard } from './stats-service'
import type { Database } from './supabase'

type Score = Database['public']['Tables']['scores']['Row']
type Player = Database['public']['Tables']['players']['Row']
type Course = Database['public']['Tables']['courses']['Row']
type Match = Database['public']['Tables']['matches']['Row']

export class PostRoundProcessor {
  
  /**
   * Process stats for a completed round (all 18 holes)
   * This should be called when a player's round is complete
   */
  static async processPlayerRound(playerId: string, matchId: string): Promise<void> {
    try {
      // Get match details
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select(`
          *,
          courses!inner(*)
        `)
        .eq('id', matchId)
        .single()
      
      if (matchError || !match) {
        throw new Error(`Match not found: ${matchId}`)
      }
      
      // Get player details
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single()
      
      if (playerError || !player) {
        throw new Error(`Player not found: ${playerId}`)
      }
      
      // Get all scores for this player in this match
      const { data: scores, error: scoresError } = await supabase
        .from('scores')
        .select('*')
        .eq('match_id', matchId)
        .eq('player_id', playerId)
        .order('hole_number')
      
      if (scoresError || !scores) {
        throw new Error(`Failed to fetch scores for player ${playerId} in match ${matchId}`)
      }
      
      // Check if all 18 holes are complete (have non-null gross scores)
      const completedScores = scores.filter(s => s.gross_score !== null && s.gross_score > 0)
      if (completedScores.length !== 18) {
        console.log(`Player ${playerId} round not complete yet: ${completedScores.length}/18 holes`)
        return
      }
      
      const course = match.courses as Course
      const parData = course.par_data as Record<string, { par: number; handicap: number }>
      const hcp = player.playing_handicap ?? 0

      // Build scorecard data
      const scoreCardScores = completedScores.map(score => {
        const holeNumber = score.hole_number
        const holeKey = `hole_${holeNumber}`
        const holeData = parData[holeKey] ?? { par: 4, handicap: holeNumber }
        const par = holeData.par
        const strokeIndex = holeData.handicap   // stroke index (1 = hardest)
        const grossScore = score.gross_score!

        // Correct net score: strokes given based on stroke index
        const strokesGiven = Math.floor(hcp / 18) + (strokeIndex <= (hcp % 18) ? 1 : 0)
        const netScore = grossScore - strokesGiven

        // Stableford points: max(0, 2 + par - net)
        const stablefordPoints = Math.max(0, 2 + par - netScore)

        return {
          holeNumber,
          grossScore,
          par,
          netScore,
          stablefordPoints,
        }
      })
      
      const scoreCard: PlayerScoreCard = {
        playerId,
        matchId,
        day: match.day,
        courseId: match.course_id,
        playingHandicap: player.playing_handicap,
        scores: scoreCardScores
      }
      
      // Update player stats
      await StatsService.updatePlayerStats(scoreCard)
      
      console.log(`Successfully processed stats for ${player.name} on Day ${match.day}`)
      
    } catch (error) {
      console.error('Error processing player round:', error)
      throw error
    }
  }
  
  /**
   * Process stats for all players in a completed match
   */
  static async processMatchCompletion(matchId: string): Promise<void> {
    try {
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single()
      
      if (matchError || !match) {
        throw new Error(`Match not found: ${matchId}`)
      }
      
      const allPlayers = [...match.team1_players, ...match.team2_players]
      
      // Process each player's stats
      for (const playerName of allPlayers) {
        try {
          // Get player ID from name
          const { data: player } = await supabase
            .from('players')
            .select('id')
            .eq('name', playerName)
            .single()
          
          if (player) {
            await this.processPlayerRound(player.id, matchId)
          }
        } catch (error) {
          console.error(`Failed to process stats for ${playerName}:`, error)
        }
      }
      
      console.log(`Match processing complete for match ${matchId}`)
      
    } catch (error) {
      console.error('Error processing match completion:', error)
      throw error
    }
  }
  
  /**
   * Check if a player's round is complete and process if so
   * This is meant to be called after each score entry
   */
  static async checkAndProcessRound(playerId: string, matchId: string): Promise<boolean> {
    try {
      const { data: scores, error } = await supabase
        .from('scores')
        .select('gross_score')
        .eq('match_id', matchId)
        .eq('player_id', playerId)
      
      if (error || !scores) return false
      
      const completedHoles = scores.filter(s => s.gross_score !== null && s.gross_score > 0)
      
      // If round is complete (18 holes), process the stats
      if (completedHoles.length === 18) {
        await this.processPlayerRound(playerId, matchId)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error checking round completion:', error)
      return false
    }
  }
  
  /**
   * Update match records for team/individual performance
   * This should be called when match results are finalized
   */
  static async updateMatchRecords(matchId: string, results: {
    team1Score: number,
    team2Score: number,
    winners: string[],
    format: 'team' | 'individual'
  }): Promise<void> {
    try {
      const { data: match } = await supabase
        .from('matches')
        .select('team1_players, team2_players')
        .eq('id', matchId)
        .single()
      
      if (!match) return
      
      const isTeamWin = results.team1Score !== results.team2Score
      const team1Won = results.team1Score > results.team2Score
      const isIndividualFormat = results.format === 'individual'
      
      // Update win/loss records for each player
      const updates = []
      
      for (const playerName of match.team1_players) {
        const won = isIndividualFormat ? results.winners.includes(playerName) : team1Won
        const tied = !isIndividualFormat && !isTeamWin
        
        updates.push(
          supabase.rpc('update_match_record', {
            p_player_name: playerName,
            p_format: results.format,
            p_won: won,
            p_lost: !won && !tied,
            p_tied: tied
          })
        )
      }
      
      for (const playerName of match.team2_players) {
        const won = isIndividualFormat ? results.winners.includes(playerName) : !team1Won
        const tied = !isIndividualFormat && !isTeamWin
        
        updates.push(
          supabase.rpc('update_match_record', {
            p_player_name: playerName,
            p_format: results.format,
            p_won: won,
            p_lost: !won && !tied,
            p_tied: tied
          })
        )
      }
      
      await Promise.all(updates)
      
    } catch (error) {
      console.error('Error updating match records:', error)
    }
  }
}

export default PostRoundProcessor