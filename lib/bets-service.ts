// lib/bets-service.ts
import { supabase } from './supabase'

export interface Bet {
  id: string
  match_id: string
  bet_type: 'front' | 'back' | 'overall'
  side1_player_id: string
  side1_amount: number
  side2_player_id: string
  side2_amount: number
  side1_ml: number
  side2_ml: number
  tease_adjustment: number
  proposer_side: 'side1' | 'side2'
  status: 'pending' | 'active' | 'side1_won' | 'side2_won' | 'push' | 'cancelled'
  settled_at: string | null
  created_at: string
  updated_at: string
}

export interface PlayerRef {
  id: string
  name: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export interface BetWithPlayers extends Bet {
  side1_player: PlayerRef
  side2_player: PlayerRef
}

const BET_SELECT = `
  *,
  side1_player:side1_player_id(id, name, first_name, last_name, avatar_url),
  side2_player:side2_player_id(id, name, first_name, last_name, avatar_url)
`

export async function getBetsForMatch(matchId: string): Promise<BetWithPlayers[]> {
  const { data, error } = await supabase
    .from('bets')
    .select(BET_SELECT)
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as BetWithPlayers[]
}

export async function getBetsForPlayer(playerId: string): Promise<BetWithPlayers[]> {
  const { data, error } = await supabase
    .from('bets')
    .select(BET_SELECT)
    .or(`side1_player_id.eq.${playerId},side2_player_id.eq.${playerId}`)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as BetWithPlayers[]
}

export async function getAllBets(): Promise<BetWithPlayers[]> {
  const { data, error } = await supabase
    .from('bets')
    .select(BET_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as BetWithPlayers[]
}

export async function createBet(params: {
  matchId: string
  betType: 'front' | 'back' | 'overall'
  side1PlayerId: string
  side1Amount: number
  side2PlayerId: string
  side2Amount: number
  side1Ml: number
  side2Ml: number
  teaseAdjustment?: number
  proposerSide?: 'side1' | 'side2'
}): Promise<Bet> {
  const { data, error } = await supabase.rpc('create_bet', {
    p_match_id: params.matchId,
    p_bet_type: params.betType,
    p_side1_player_id: params.side1PlayerId,
    p_side1_amount: params.side1Amount,
    p_side2_player_id: params.side2PlayerId,
    p_side2_amount: params.side2Amount,
    p_side1_ml: params.side1Ml,
    p_side2_ml: params.side2Ml,
    p_tease_adjustment: params.teaseAdjustment ?? 0,
    p_proposer_side: params.proposerSide ?? 'side1',
  })
  if (error) throw error
  return data as Bet
}

export async function acceptBet(betId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_bet', { p_bet_id: betId })
  if (error) throw error
}

export async function cancelBet(betId: string): Promise<void> {
  const { error } = await supabase.rpc('update_bet_status', {
    p_bet_id: betId,
    p_status: 'cancelled',
  })
  if (error) throw error
}

export async function settleBetsForMatch(
  matchId: string,
  frontWinner: 'side1' | 'side2' | 'push',
  backWinner: 'side1' | 'side2' | 'push',
  overallWinner: 'side1' | 'side2' | 'push'
): Promise<void> {
  const { error } = await supabase.rpc('settle_bets_for_match', {
    p_match_id: matchId,
    p_front_winner: frontWinner,
    p_back_winner: backWinner,
    p_overall_winner: overallWinner,
  })
  if (error) throw error
}

export function playerDisplayName(player: PlayerRef): string {
  if (player.first_name && player.last_name) return `${player.first_name} ${player.last_name}`
  return player.name
}

export function betTypeLabel(type: 'front' | 'back' | 'overall'): string {
  return type === 'front' ? 'Front 9' : type === 'back' ? 'Back 9' : 'Overall'
}

export function betStatusLabel(status: Bet['status'], side1Name: string, side2Name: string): string {
  switch (status) {
    case 'pending': return 'Pending'
    case 'active': return 'Active'
    case 'side1_won': return `${side1Name} Wins`
    case 'side2_won': return `${side2Name} Wins`
    case 'push': return 'Push'
    case 'cancelled': return 'Cancelled'
  }
}
