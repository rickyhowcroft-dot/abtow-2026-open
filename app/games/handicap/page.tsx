'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  getHandicapGameResults, getDayStatus,
  getGameParticipants, optInToGame, optOutOfGame,
  type HandicapGamePlayer, type DayStatus,
} from '@/lib/games-service'

const GAME_ID = 'handicap'

const DAY_LABELS = ['Ritz Carlton GC', 'Southern Dunes', 'Champions Gate']
const DAY_FORMATS = ['Best Ball', 'Stableford', 'Individual']

function rankLabel(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

function SurplusBar({ surplus, max }: { surplus: number; max: number }) {
  if (max === 0) return null
  const pct = Math.min(100, Math.max(0, ((surplus + max) / (max * 2)) * 100))
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all ${surplus >= 0 ? 'bg-emerald-400' : 'bg-red-300'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function PlayerRow({
  player, rank, maxSurplus, onSelect, isSelected, isOptedIn,
}: {
  player: HandicapGamePlayer
  rank: number
  maxSurplus: number
  onSelect: () => void
  isSelected: boolean
  isOptedIn: boolean
}) {
  const surplusStr = player.surplus >= 0 ? `+${player.surplus}` : `${player.surplus}`
  const firstName = player.displayName.split(' ')[0]

  return (
    <div>
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
          isSelected ? 'bg-[#2a6b7c]/8' : 'hover:bg-gray-50'
        }`}
      >
        {/* Rank */}
        <div className="w-7 text-center text-sm font-bold shrink-0">
          {player.eligible ? rankLabel(rank) : <span className="text-gray-300 text-xs">—</span>}
        </div>

        {/* Name + bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-900 truncate">{firstName}</span>
            {isOptedIn && <span className="text-[10px] bg-[#2a6b7c]/10 text-[#2a6b7c] px-1.5 py-0.5 rounded-full font-semibold shrink-0">In</span>}
            {player.holesPlayed > 0 && player.holesPlayed < 18 && (
              <span className="text-[10px] text-gray-400">({player.holesPlayed} holes)</span>
            )}
          </div>
          <SurplusBar surplus={player.surplus} max={Math.max(Math.abs(maxSurplus), 4)} />
        </div>

        {/* Hcp */}
        <div className="text-center shrink-0 w-8">
          <div className="text-xs text-gray-400">hcp</div>
          <div className="text-sm font-semibold text-gray-600">{player.playingHandicap}</div>
        </div>

        {/* Target */}
        <div className="text-center shrink-0 w-12">
          <div className="text-xs text-gray-400">target</div>
          <div className="text-sm font-semibold text-gray-600">{player.targetPoints}</div>
        </div>

        {/* Total pts */}
        <div className="text-center shrink-0 w-12">
          <div className="text-xs text-gray-400">points</div>
          <div className={`text-sm font-bold ${player.eligible ? 'text-emerald-700' : 'text-gray-500'}`}>
            {player.totalPoints}
          </div>
        </div>

        {/* Surplus */}
        <div className="text-center shrink-0 w-12">
          <div className="text-xs text-gray-400">surplus</div>
          <div className={`text-sm font-bold ${
            player.surplus > 0 ? 'text-emerald-600' :
            player.surplus === 0 ? 'text-amber-600' :
            'text-red-400'
          }`}>
            {player.holesPlayed === 0 ? '—' : surplusStr}
          </div>
        </div>
      </button>

      {/* Expanded scorecard */}
      {isSelected && player.holesPlayed > 0 && (
        <PlayerScorecard player={player} />
      )}
    </div>
  )
}

function PlayerScorecard({ player }: { player: HandicapGamePlayer }) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1)
  const frontPts = player.holePoints.slice(0, 9).reduce((s, v) => s + v, 0)
  const backPts  = player.holePoints.slice(9).reduce((s, v) => s + v, 0)

  const ptColor = (pts: number) => {
    if (pts >= 16) return 'text-purple-700 font-black'
    if (pts >= 8)  return 'text-purple-600 font-bold'
    if (pts >= 4)  return 'text-emerald-700 font-bold'
    if (pts >= 2)  return 'text-gray-700 font-medium'
    if (pts === 1) return 'text-amber-600'
    return 'text-red-300'
  }

  return (
    <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs text-center" style={{ minWidth: 480 }}>
          <thead>
            <tr className="text-gray-400">
              <td className="text-left py-1 font-semibold text-gray-600 w-14">Hole</td>
              {holes.slice(0,9).map(h=><td key={h} className="w-8">{h}</td>)}
              <td className="font-semibold text-gray-600 w-10">F9</td>
              {holes.slice(9).map(h=><td key={h} className="w-8">{h}</td>)}
              <td className="font-semibold text-gray-600 w-10">B9</td>
              <td className="font-semibold text-gray-600 w-10">TOT</td>
            </tr>
          </thead>
          <tbody>
            <tr className="text-gray-700">
              <td className="text-left py-1 font-semibold text-gray-600">Gross</td>
              {holes.slice(0,9).map(h=>(
                <td key={h} className={player.holeGross[h-1]>0?'text-gray-700':'text-gray-200'}>
                  {player.holeGross[h-1]||'·'}
                </td>
              ))}
              <td className="font-bold text-gray-700">
                {player.holeGross.slice(0,9).filter(g=>g>0).reduce((s,v)=>s+v,0)||'—'}
              </td>
              {holes.slice(9).map(h=>(
                <td key={h} className={player.holeGross[h-1]>0?'text-gray-700':'text-gray-200'}>
                  {player.holeGross[h-1]||'·'}
                </td>
              ))}
              <td className="font-bold text-gray-700">
                {player.holeGross.slice(9).filter(g=>g>0).reduce((s,v)=>s+v,0)||'—'}
              </td>
              <td className="font-bold text-gray-900">
                {player.holeGross.filter(g=>g>0).reduce((s,v)=>s+v,0)||'—'}
              </td>
            </tr>
            <tr>
              <td className="text-left py-1 font-semibold text-gray-600">Pts</td>
              {holes.slice(0,9).map(h=>(
                <td key={h} className={ptColor(player.holePoints[h-1])}>
                  {player.holeGross[h-1]>0 ? player.holePoints[h-1] : '·'}
                </td>
              ))}
              <td className={`font-bold ${frontPts>=18?'text-emerald-700':'text-gray-700'}`}>{frontPts}</td>
              {holes.slice(9).map(h=>(
                <td key={h} className={ptColor(player.holePoints[h-1])}>
                  {player.holeGross[h-1]>0 ? player.holePoints[h-1] : '·'}
                </td>
              ))}
              <td className={`font-bold ${backPts>=18?'text-emerald-700':'text-gray-700'}`}>{backPts}</td>
              <td className={`font-bold ${player.eligible?'text-emerald-700':'text-gray-600'}`}>
                {player.totalPoints}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span>Target: <strong className="text-gray-700">{player.targetPoints}</strong></span>
        <span>Surplus: <strong className={player.surplus>=0?'text-emerald-700':'text-red-500'}>
          {player.surplus>=0?`+${player.surplus}`:player.surplus}
        </strong></span>
        <span>Birdies: <strong className="text-emerald-700">{player.birdies}</strong></span>
        <span>Pars: <strong className="text-gray-700">{player.pars}</strong></span>
      </div>
    </div>
  )
}

function HandicapGameContent() {
  const params = useSearchParams()
  const initialDay = Math.min(3, Math.max(1, parseInt(params.get('day') ?? '1')))
  const [activeDay, setActiveDay] = useState(initialDay)
  const [results, setResults] = useState<Awaited<ReturnType<typeof getHandicapGameResults>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [dayStatuses, setDayStatuses] = useState<DayStatus[]>(['locked_date', 'locked_date', 'locked_date'])

  // Identity + opt-in state
  const [viewerPlayerId, setViewerPlayerId] = useState('')
  const [players, setPlayers] = useState<{ id: string; name: string; first_name: string | null }[]>([])
  const [participants, setParticipants] = useState<string[]>([]) // player_ids opted in for activeDay
  const [optingIn, setOptingIn] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('abtow_viewer_id')
    if (saved) setViewerPlayerId(saved)
    supabase.from('players').select('id, name, first_name').order('first_name').then(({ data }) => {
      if (data) setPlayers(data as { id: string; name: string; first_name: string | null }[])
    })
    Promise.all([getDayStatus(1), getDayStatus(2), getDayStatus(3)]).then(statuses => {
      setDayStatuses(statuses)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelectedPlayer(null)
    Promise.all([
      getHandicapGameResults(activeDay),
      getGameParticipants(GAME_ID, activeDay),
    ]).then(([r, parts]) => {
      setResults(r)
      setParticipants(parts.map(p => p.player_id))
      setLoading(false)
    })
  }, [activeDay])

  const viewerOptedIn = viewerPlayerId ? participants.includes(viewerPlayerId) : false

  async function handleOptToggle() {
    if (!viewerPlayerId) return
    setOptingIn(true)
    try {
      if (viewerOptedIn) {
        await optOutOfGame(GAME_ID, activeDay, viewerPlayerId)
        setParticipants(prev => prev.filter(id => id !== viewerPlayerId))
      } else {
        await optInToGame(GAME_ID, activeDay, viewerPlayerId)
        setParticipants(prev => [...prev, viewerPlayerId])
      }
    } finally {
      setOptingIn(false)
    }
  }

  const eligiblePlayers = results?.players.filter(p => p.eligible) ?? []
  const ineligiblePlayers = results?.players.filter(p => !p.eligible) ?? []
  const maxSurplus = results?.players[0]?.surplus ?? 0

  return (
    <div className="max-w-xl mx-auto px-4 py-6" style={{ fontFamily: 'Georgia, serif', backgroundColor: '#f5f0e8', minHeight: '100vh' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/games" className="text-[#2a6b7c] text-sm">← Games</Link>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-[#2a6b7c]">🎯 Handicap Game</h1>
        </div>
      </div>

      {/* Day tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm mb-5">
        {[1, 2, 3].map(d => {
          const s = dayStatuses[d - 1]
          const canView = s === 'open' || s === 'locked_complete'
          const isActive = activeDay === d
          return (
            <button
              key={d}
              onClick={() => canView && setActiveDay(d)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors relative ${
                !canView          ? 'text-gray-300 cursor-not-allowed' :
                isActive          ? 'bg-[#2a6b7c] text-white shadow-sm' :
                                    'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s === 'locked_date' && '🔒 '}
              {s === 'locked_complete' && !isActive && '🔒 '}
              Day {d}
              {s === 'locked_complete' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border-2 border-white" title="Round complete" />
              )}
            </button>
          )
        })}
      </div>

      {/* Day info */}
      <div className="text-center text-xs text-gray-400 mb-4">
        {DAY_LABELS[activeDay - 1]} · {DAY_FORMATS[activeDay - 1]} · Gross scoring
      </div>

      {/* Identity + opt-in */}
      <div className="bg-white rounded-xl p-3 mb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 shrink-0 font-semibold">You are:</span>
          <select
            value={viewerPlayerId}
            onChange={e => {
              const id = e.target.value
              setViewerPlayerId(id)
              if (id) localStorage.setItem('abtow_viewer_id', id)
              else localStorage.removeItem('abtow_viewer_id')
            }}
            className="flex-1 text-sm border-0 bg-transparent focus:outline-none text-gray-700 font-semibold"
          >
            <option value="">— select to opt in —</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>
                {p.first_name || p.name.split(' ')[0]} {p.name.split(' ').slice(1).join(' ')}
              </option>
            ))}
          </select>
          {viewerPlayerId && dayStatuses[activeDay - 1] !== 'locked_complete' && (
            <button
              onClick={handleOptToggle}
              disabled={optingIn}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                viewerOptedIn
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200'
                  : 'bg-[#2a6b7c] text-white hover:bg-[#235a6b]'
              }`}
            >
              {optingIn ? '…' : viewerOptedIn ? '✓ Opted In' : 'Opt In'}
            </button>
          )}
          {viewerPlayerId && dayStatuses[activeDay - 1] === 'locked_complete' && viewerOptedIn && (
            <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">✓ Entered</span>
          )}
        </div>
        {participants.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-2 pl-1">
            {participants.length} player{participants.length !== 1 ? 's' : ''} opted in for Day {activeDay}
          </p>
        )}
      </div>

      {/* Rules overview card */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 border border-gray-100">
        <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">How It Works</p>
        <div className="flex items-start gap-3 text-xs text-gray-600">
          <div className="flex-1">
            <p className="mb-1"><strong>Target = 36 − your handicap.</strong> Earn points on every hole based on gross score vs par. Hit your target to be eligible to win.</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-[11px]">
              <span>Double Eagle ≤−3: <strong>16 pts</strong></span>
              <span>Bogey +1: <strong>1 pt</strong></span>
              <span>Eagle −2: <strong>8 pts</strong></span>
              <span>Double Bogey+: <strong>0 pts</strong></span>
              <span>Birdie −1: <strong>4 pts</strong></span>
              <span className="text-gray-400">Surplus = pts − target</span>
              <span>Par 0: <strong>2 pts</strong></span>
              <span className="text-gray-400">Highest surplus wins</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading scores…</div>
      ) : !results?.scoresEntered ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center border border-gray-100">
          <p className="text-3xl mb-3">⛳</p>
          <p className="text-base font-semibold text-gray-600">No scores yet</p>
          <p className="text-xs text-gray-400 mt-1">Standings will appear as holes are played</p>
        </div>
      ) : (
        <>
          {/* Winner banner */}
          {eligiblePlayers.length > 0 && (
            <div className={`rounded-2xl p-4 mb-4 text-center border-2 ${
              results?.dayComplete
                ? 'bg-amber-50 border-amber-300'
                : 'bg-gray-50 border-gray-200'
            }`}>
              {results?.dayComplete ? (
                <>
                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">
                    {eligiblePlayers.filter(p => p.surplus === eligiblePlayers[0].surplus).length > 1
                      ? '🏆 Tied Leaders' : '🏆 Winner'}
                  </p>
                  <p className="text-lg font-bold text-amber-900">
                    {eligiblePlayers
                      .filter(p => p.surplus === eligiblePlayers[0].surplus)
                      .map(p => p.displayName.split(' ')[0])
                      .join(' & ')}
                  </p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    {eligiblePlayers[0].totalPoints} pts · +{eligiblePlayers[0].surplus} surplus
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">⏳ Current Leader</p>
                  <p className="text-base font-bold text-gray-800">
                    {eligiblePlayers[0].displayName.split(' ')[0]}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {eligiblePlayers[0].totalPoints} pts · {eligiblePlayers[0].holesPlayed} holes played
                  </p>
                </>
              )}
            </div>
          )}

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
              <div className="w-7" />
              <div className="flex-1">Player</div>
              <div className="w-8 text-center">Hcp</div>
              <div className="w-12 text-center">Target</div>
              <div className="w-12 text-center">Points</div>
              <div className="w-12 text-center">Surplus</div>
            </div>

            {/* Eligible players */}
            {eligiblePlayers.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-emerald-50 border-b border-emerald-100">
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">✓ Eligible ({eligiblePlayers.length})</span>
                </div>
                {eligiblePlayers.map((p, i) => {
                  // Rank accounts for ties
                  let rank = 1
                  for (let j = 0; j < i; j++) {
                    if (eligiblePlayers[j].surplus > p.surplus) rank++
                  }
                  return (
                    <div key={p.playerId} className="border-b border-gray-50 last:border-0">
                      <PlayerRow
                        player={p} rank={rank}
                        maxSurplus={maxSurplus}
                        isOptedIn={participants.includes(p.playerId)}
                        onSelect={() => setSelectedPlayer(selectedPlayer === p.playerId ? null : p.playerId)}
                        isSelected={selectedPlayer === p.playerId}
                      />
                    </div>
                  )
                })}
              </>
            )}

            {/* Ineligible players */}
            {ineligiblePlayers.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-200">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">✗ Not Eligible ({ineligiblePlayers.length})</span>
                </div>
                {ineligiblePlayers.map(p => (
                  <div key={p.playerId} className="border-b border-gray-50 last:border-0 opacity-60">
                    <PlayerRow
                      player={p} rank={0}
                      maxSurplus={maxSurplus}
                      isOptedIn={participants.includes(p.playerId)}
                      onSelect={() => setSelectedPlayer(selectedPlayer === p.playerId ? null : p.playerId)}
                      isSelected={selectedPlayer === p.playerId}
                    />
                  </div>
                ))}
              </>
            )}
          </div>

          <p className="text-center text-[10px] text-gray-400 mt-3">Tap a player to see their full scorecard</p>
        </>
      )}
    </div>
  )
}

export default function HandicapGamePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-96 text-gray-400" style={{fontFamily:'Georgia,serif'}}>Loading…</div>}>
      <HandicapGameContent />
    </Suspense>
  )
}
