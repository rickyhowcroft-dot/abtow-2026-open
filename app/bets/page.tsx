'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getOdds, getNineHoleOdds, teamEffectiveHcp, applyTease,
  formatMoneyline, liveWinProb, PLAYER_HCPS,
} from '@/lib/monte-carlo'
import {
  createBet, cancelBet, getAllBets,
  playerDisplayName, betTypeLabel, betStatusLabel,
  type BetWithPlayers, type Bet,
} from '@/lib/bets-service'
import type { Player, Match } from '@/lib/scoring'

// ─── Static match config ────────────────────────────────────────────────────

const DAY1_CONFIG = [
  { group: 1, team1Names: ['Yurus', 'Krasinski'], team2Names: ['Stratton', 'Sturgis'] },
  { group: 2, team1Names: ['Short', 'Leone'], team2Names: ['Riley', 'Hanna'] },
  { group: 3, team1Names: ['Hallimen', 'KOP'], team2Names: ['Stewart', 'Howcroft'] },
  { group: 4, team1Names: ['Cummings', 'Lawler'], team2Names: ['Horeth', 'Campbell'] },
  { group: 5, team1Names: ['Cook', 'Joel'], team2Names: ['Chantra', 'Boeggeman'] },
]

const DAY2_CONFIG = [
  { group: 1, team1Names: ['Cook', 'KOP'], team2Names: ['Riley', 'Boeggeman'] },
  { group: 2, team1Names: ['Short', 'Yurus'], team2Names: ['Stratton', 'Hanna'] },
  { group: 3, team1Names: ['Hallimen', 'Lawler'], team2Names: ['Horeth', 'Sturgis'] },
  { group: 4, team1Names: ['Cummings', 'Joel'], team2Names: ['Chantra', 'Howcroft'] },
  { group: 5, team1Names: ['Leone', 'Krasinski'], team2Names: ['Stewart', 'Campbell'] },
]

const DAY3_CONFIG = [
  { group: 1, p1Name: 'Hallimen', p2Name: 'Riley' },
  { group: 2, p1Name: 'Cummings', p2Name: 'Stratton' },
  { group: 3, p1Name: 'Short', p2Name: 'Stewart' },
  { group: 4, p1Name: 'Cook', p2Name: 'Chantra' },
  { group: 5, p1Name: 'Leone', p2Name: 'Horeth' },
  { group: 6, p1Name: 'Yurus', p2Name: 'Howcroft' },
  { group: 7, p1Name: 'Krasinski', p2Name: 'Sturgis' },
  { group: 8, p1Name: 'KOP', p2Name: 'Hanna' },
  { group: 9, p1Name: 'Joel', p2Name: 'Campbell' },
  { group: 10, p1Name: 'Lawler', p2Name: 'Boeggeman' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function teamHcp(names: string[]): number {
  const hcps = names.map(n => PLAYER_HCPS[n] ?? 10)
  return teamEffectiveHcp(hcps)
}

function getTeamOdds(betType: 'front' | 'back' | 'overall', hcp1: number, hcp2: number) {
  return betType === 'overall' ? getOdds(hcp1, hcp2) : getNineHoleOdds(hcp1, hcp2)
}

function mlColor(ml: number): string {
  if (Math.abs(ml) <= 110) return 'text-gray-600'
  return ml < 0 ? 'text-emerald-600' : 'text-amber-500'
}

function mlBg(ml: number): string {
  if (Math.abs(ml) <= 110) return 'bg-gray-500'
  return ml < 0 ? 'bg-emerald-600' : 'bg-amber-500'
}

function StatusBadge({ status, s1, s2 }: { status: Bet['status']; s1: string; s2: string }) {
  const colors: Record<Bet['status'], string> = {
    active: 'bg-gray-100 text-gray-600',
    side1_won: 'bg-emerald-100 text-emerald-700',
    side2_won: 'bg-emerald-100 text-emerald-700',
    push: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-500 line-through',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status]}`}>
      {betStatusLabel(status, s1, s2)}
    </span>
  )
}

// ─── Bet Detail Modal ────────────────────────────────────────────────────────

function BetDetailModal({ bet, onClose }: { bet: BetWithPlayers; onClose: () => void }) {
  const s1 = playerDisplayName(bet.side1_player)
  const s2 = playerDisplayName(bet.side2_player)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#f5f0e8] rounded-2xl w-full max-w-md shadow-2xl p-5" style={{ fontFamily: 'Georgia, serif' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-bold text-[#2a6b7c]">Bet Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="bg-white rounded-xl p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Type</span>
            <span className="font-semibold">{betTypeLabel(bet.bet_type)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tease</span>
            <span className="font-semibold">{bet.tease_adjustment > 0 ? `+${bet.tease_adjustment}` : bet.tease_adjustment === 0 ? 'None' : bet.tease_adjustment}</span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{s1}</div>
                <div className="text-gray-400 text-xs">Side 1 · {formatMoneyline(bet.side1_ml)}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">${bet.side1_amount.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div className="text-center text-gray-300 text-xs">vs</div>
          <div className="flex justify-between items-start">
            <div>
              <div className="font-semibold">{s2}</div>
              <div className="text-gray-400 text-xs">Side 2 · {formatMoneyline(bet.side2_ml)}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">${bet.side2_amount.toLocaleString()}</div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="text-gray-500">Status</span>
            <StatusBadge status={bet.status} s1={s1} s2={s2} />
          </div>
          {bet.settled_at && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Settled</span>
              <span>{new Date(bet.settled_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 bg-[#2a6b7c] text-white rounded-xl font-semibold text-sm"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Add Bet Modal ───────────────────────────────────────────────────────────

interface AddBetModalProps {
  matchId: string
  day: number
  group: number
  side1Names: string[]
  side2Names: string[]
  players: Player[]
  onClose: () => void
  onCreated: () => void
}

function AddBetModal({ matchId, day, group, side1Names, side2Names, players, onClose, onCreated }: AddBetModalProps) {
  const [betType, setBetType] = useState<'front' | 'back' | 'overall'>('overall')
  const [tease, setTease] = useState(0)
  const [side1PlayerId, setSide1PlayerId] = useState('')
  const [side2PlayerId, setSide2PlayerId] = useState('')
  const [side1Amount, setSide1Amount] = useState('')
  const [side2Amount, setSide2Amount] = useState('')
  const [side1Error, setSide1Error] = useState('')
  const [side2Error, setSide2Error] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const isTeamMatch = side1Names.length > 1
  const hcp1 = isTeamMatch ? teamHcp(side1Names) : (PLAYER_HCPS[side1Names[0]] ?? 10)
  const hcp2 = isTeamMatch ? teamHcp(side2Names) : (PLAYER_HCPS[side2Names[0]] ?? 10)
  const baseOdds = getTeamOdds(betType, hcp1, hcp2)
  const [side1Ml, side2Ml] = applyTease(baseOdds.aMoneyline, baseOdds.bMoneyline, tease)

  const side1Players = players.filter(p => side1Names.includes(p.name))
  const side2Players = players.filter(p => side2Names.includes(p.name))

  function validateAmount(val: string, setSide: (v: string) => void, setErr: (v: string) => void) {
    const cleaned = val.replace(/[^0-9]/g, '')
    setSide(cleaned)
    if (val !== cleaned || (cleaned.length > 0 && !/^\d+$/.test(val))) {
      setErr('Numbers only')
    } else if (cleaned.length > 5) {
      setErr('Max $99,999')
    } else {
      setErr('')
    }
  }

  async function handleSubmit() {
    let valid = true
    if (!side1PlayerId) { setSide1Error('Select a player'); valid = false }
    if (!side2PlayerId) { setSide2Error('Select a player'); valid = false }
    const amt1 = parseInt(side1Amount)
    const amt2 = parseInt(side2Amount)
    if (!side1Amount || isNaN(amt1) || amt1 < 1) { setSide1Error('Enter amount'); valid = false }
    if (!side2Amount || isNaN(amt2) || amt2 < 1) { setSide2Error('Enter amount'); valid = false }
    if (!valid) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await createBet({
        matchId,
        betType,
        side1PlayerId,
        side1Amount: amt1,
        side2PlayerId,
        side2Amount: amt2,
        side1Ml,
        side2Ml,
        teaseAdjustment: tease,
      })
      onCreated()
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create bet')
    } finally {
      setSubmitting(false)
    }
  }

  const formatLabel = isTeamMatch ? (day === 1 ? 'Best Ball' : 'Stableford') : 'Individual'
  const side1Label = isTeamMatch ? side1Names.join(' & ') : side1Names[0]
  const side2Label = isTeamMatch ? side2Names.join(' & ') : side2Names[0]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#f5f0e8] rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ fontFamily: 'Georgia, serif' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#f5f0e8] border-b border-gray-200 px-5 pt-5 pb-3 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-[#2a6b7c]">Add Bet</h2>
              <p className="text-xs text-gray-500">Day {day} · Group {group} · {formatLabel}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">✕</button>
          </div>

          {/* Bet type tabs */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 mt-3">
            {(['front', 'back', 'overall'] as const).map(t => (
              <button
                key={t}
                onClick={() => setBetType(t)}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${betType === t ? 'bg-[#2a6b7c] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                {betTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Lines display */}
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-3 text-center">Pre-match lines · tease to adjust</p>
            <div className="flex justify-around">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1 truncate max-w-[110px]">{side1Label}</div>
                <div className={`text-xl font-bold ${mlColor(side1Ml)}`}>{formatMoneyline(side1Ml)}</div>
                {isTeamMatch && <div className="text-[10px] text-gray-400">eff. hcp {hcp1}</div>}
              </div>
              <div className="text-gray-300 text-lg self-center">vs</div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1 truncate max-w-[110px]">{side2Label}</div>
                <div className={`text-xl font-bold ${mlColor(side2Ml)}`}>{formatMoneyline(side2Ml)}</div>
                {isTeamMatch && <div className="text-[10px] text-gray-400">eff. hcp {hcp2}</div>}
              </div>
            </div>

            {/* Tease slider */}
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>← Favor {side2Label.split(' ')[0]}</span>
                <span className="font-semibold text-gray-600">
                  {tease === 0 ? 'Baseline' : tease > 0 ? `+${tease} pts → ${side1Label.split(' ')[0]}` : `${tease} pts → ${side2Label.split(' ')[0]}`}
                </span>
                <span>Favor {side1Label.split(' ')[0]} →</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={5}
                value={tease}
                onChange={e => setTease(Number(e.target.value))}
                className="w-full accent-[#2a6b7c]"
              />
            </div>
          </div>

          {/* Side 1 */}
          <div className="bg-white rounded-xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Side 1 — backing {side1Label}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Player placing bet</label>
                <select
                  value={side1PlayerId}
                  onChange={e => { setSide1PlayerId(e.target.value); setSide1Error('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2a6b7c]/30"
                >
                  <option value="">Select player...</option>
                  {side1Players.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bet amount ($)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 500"
                  maxLength={5}
                  value={side1Amount}
                  onChange={e => validateAmount(e.target.value, setSide1Amount, setSide1Error)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2a6b7c]/30"
                />
                {side1Error && <p className="text-red-500 text-xs mt-1">{side1Error}</p>}
              </div>
            </div>
          </div>

          {/* Side 2 */}
          <div className="bg-white rounded-xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Side 2 — backing {side2Label}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Player placing bet</label>
                <select
                  value={side2PlayerId}
                  onChange={e => { setSide2PlayerId(e.target.value); setSide2Error('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2a6b7c]/30"
                >
                  <option value="">Select player...</option>
                  {side2Players.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bet amount ($)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 500"
                  maxLength={5}
                  value={side2Amount}
                  onChange={e => validateAmount(e.target.value, setSide2Amount, setSide2Error)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2a6b7c]/30"
                />
                {side2Error && <p className="text-red-500 text-xs mt-1">{side2Error}</p>}
              </div>
            </div>
          </div>

          {submitError && (
            <p className="text-red-500 text-sm text-center">{submitError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-[#2a6b7c] text-white rounded-xl font-bold text-sm hover:bg-[#235a68] disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Locking In...' : '🔒 Lock In Bet'}
          </button>

          <p className="text-center text-xs text-gray-400 pb-2">For entertainment. Sampson doesn&apos;t take bets.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Match Card ──────────────────────────────────────────────────────────────

interface MatchCardProps {
  matchId: string
  day: number
  group: number
  side1Names: string[]
  side2Names: string[]
  matchBets: BetWithPlayers[]
  players: Player[]
  onAddBet: () => void
  onViewBet: (bet: BetWithPlayers) => void
}

function MatchCard({ matchId, day, group, side1Names, side2Names, matchBets, players, onAddBet, onViewBet }: MatchCardProps) {
  const isTeam = side1Names.length > 1
  const hcp1 = isTeam ? teamHcp(side1Names) : (PLAYER_HCPS[side1Names[0]] ?? 10)
  const hcp2 = isTeam ? teamHcp(side2Names) : (PLAYER_HCPS[side2Names[0]] ?? 10)
  const odds = getOdds(hcp1, hcp2)
  const activeBets = matchBets.filter(b => b.status === 'active')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#2a6b7c]/5">
        <span className="text-xs font-bold text-[#2a6b7c] uppercase tracking-wide">Group {group}</span>
        {activeBets.length > 0 && (
          <span className="text-xs bg-[#2a6b7c] text-white rounded-full px-2 py-0.5">
            {activeBets.length} bet{activeBets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        {/* Pre-match odds */}
        <div className="flex justify-between items-center mb-3">
          <div className="text-center flex-1">
            <div className="text-sm font-semibold text-gray-800 truncate">{side1Names.join(' & ')}</div>
            {isTeam && <div className="text-[10px] text-gray-400">eff. hcp {hcp1}</div>}
            <div className={`text-base font-bold mt-1 ${mlColor(odds.aMoneyline)}`}>{formatMoneyline(odds.aMoneyline)}</div>
          </div>
          <div className="text-gray-300 text-sm px-2">vs</div>
          <div className="text-center flex-1">
            <div className="text-sm font-semibold text-gray-800 truncate">{side2Names.join(' & ')}</div>
            {isTeam && <div className="text-[10px] text-gray-400">eff. hcp {hcp2}</div>}
            <div className={`text-base font-bold mt-1 ${mlColor(odds.bMoneyline)}`}>{formatMoneyline(odds.bMoneyline)}</div>
          </div>
        </div>

        {/* Existing bets */}
        {matchBets.length > 0 && (
          <div className="border-t border-gray-100 pt-2 mt-2 space-y-1.5">
            {matchBets.map(bet => {
              const s1 = playerDisplayName(bet.side1_player)
              const s2 = playerDisplayName(bet.side2_player)
              return (
                <button
                  key={bet.id}
                  onClick={() => onViewBet(bet)}
                  className="w-full text-left flex items-center justify-between rounded-lg hover:bg-gray-50 px-2 py-1.5 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 shrink-0">{betTypeLabel(bet.bet_type)}</span>
                    <span className="text-xs text-gray-700 truncate">
                      {s1.split(' ')[0]} ${bet.side1_amount.toLocaleString()} vs {s2.split(' ')[0]} ${bet.side2_amount.toLocaleString()}
                    </span>
                  </div>
                  <StatusBadge status={bet.status} s1={s1} s2={s2} />
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={onAddBet}
          className="w-full mt-3 py-2 border-2 border-dashed border-[#2a6b7c]/30 text-[#2a6b7c] text-sm rounded-xl hover:bg-[#2a6b7c]/5 transition-colors font-semibold"
        >
          + Add Bet
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

interface MatchWithConfig {
  dbMatch: Match
  side1Names: string[]
  side2Names: string[]
}

export default function BetsPage() {
  const [activeDay, setActiveDay] = useState(1)
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [bets, setBets] = useState<BetWithPlayers[]>([])
  const [loading, setLoading] = useState(true)
  const [addBetTarget, setAddBetTarget] = useState<MatchWithConfig | null>(null)
  const [viewBet, setViewBet] = useState<BetWithPlayers | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [pRes, mRes, bData] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('matches').select('*').order('day').order('group_number'),
        getAllBets(),
      ])
      if (pRes.data) setPlayers(pRes.data)
      if (mRes.data) setMatches(mRes.data)
      setBets(bData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function getMatchConfig(day: number): MatchWithConfig[] {
    const dayMatches = matches.filter(m => m.day === day)
    const config = day === 1 ? DAY1_CONFIG : day === 2 ? DAY2_CONFIG : DAY3_CONFIG

    return config.map((c: { group: number; team1Names?: string[]; team2Names?: string[]; p1Name?: string; p2Name?: string }) => {
      const dbMatch = dayMatches.find(m => m.group_number === c.group)
      const side1Names = 'team1Names' in c ? (c.team1Names ?? []) : [c.p1Name ?? '']
      const side2Names = 'team2Names' in c ? (c.team2Names ?? []) : [c.p2Name ?? '']
      return { dbMatch: dbMatch as Match, side1Names, side2Names }
    }).filter(m => m.dbMatch)
  }

  const dayConfig = getMatchConfig(activeDay)
  const dayBetCount = bets.filter(b => {
    const dayMatchIds = new Set(matches.filter(m => m.day === activeDay).map(m => m.id))
    return dayMatchIds.has(b.match_id) && b.status === 'active'
  }).length

  const totalActive = bets.filter(b => b.status === 'active').length
  const totalStake = bets
    .filter(b => b.status === 'active')
    .reduce((sum, b) => sum + Number(b.side1_amount) + Number(b.side2_amount), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96" style={{ fontFamily: 'Georgia, serif' }}>
        <div className="text-gray-500">Loading bets...</div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6" style={{ fontFamily: 'Georgia, serif', backgroundColor: '#f5f0e8', minHeight: '100vh' }}>
      {/* Header */}
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-[#2a6b7c]">🎲 Bets</h1>
        {totalActive > 0 && (
          <p className="text-sm text-gray-500 mt-1">
            {totalActive} active bet{totalActive !== 1 ? 's' : ''} · ${totalStake.toLocaleString()} total at stake
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> Fav</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Dog</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Pick</span>
        <span className="text-gray-400">· Tap match to bet</span>
      </div>

      {/* Day tabs */}
      <div className="flex rounded-xl overflow-hidden border border-gray-300 mb-6">
        {[1, 2, 3].map(d => (
          <button
            key={d}
            onClick={() => setActiveDay(d)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${activeDay === d ? 'bg-[#2a6b7c] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Day {d}
          </button>
        ))}
      </div>

      {/* Day subtitle */}
      <p className="text-xs text-center text-gray-400 -mt-4 mb-4">
        {activeDay === 1 ? 'Best Ball · Ritz Carlton GC · Mar 16' : activeDay === 2 ? 'Stableford · Southern Dunes · Mar 17' : 'Individual · Champions Gate · Mar 18'}
        {dayBetCount > 0 ? ` · ${dayBetCount} active bet${dayBetCount !== 1 ? 's' : ''}` : ''}
      </p>

      {/* Match cards */}
      <div className="space-y-4">
        {dayConfig.map(({ dbMatch, side1Names, side2Names }) => (
          <MatchCard
            key={dbMatch.id}
            matchId={dbMatch.id}
            day={activeDay}
            group={dbMatch.group_number}
            side1Names={side1Names}
            side2Names={side2Names}
            matchBets={bets.filter(b => b.match_id === dbMatch.id)}
            players={players}
            onAddBet={() => setAddBetTarget({ dbMatch, side1Names, side2Names })}
            onViewBet={setViewBet}
          />
        ))}
      </div>

      {/* Add Bet Modal */}
      {addBetTarget && (
        <AddBetModal
          matchId={addBetTarget.dbMatch.id}
          day={activeDay}
          group={addBetTarget.dbMatch.group_number}
          side1Names={addBetTarget.side1Names}
          side2Names={addBetTarget.side2Names}
          players={players}
          onClose={() => setAddBetTarget(null)}
          onCreated={() => { setAddBetTarget(null); loadAll() }}
        />
      )}

      {/* View Bet Modal */}
      {viewBet && (
        <BetDetailModal bet={viewBet} onClose={() => setViewBet(null)} />
      )}
    </div>
  )
}
