'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getOdds, getNineHoleOdds, teamEffectiveHcp, applyTease,
  formatMoneyline, PLAYER_HCPS,
} from '@/lib/monte-carlo'
import {
  createBet, acceptBet, getAllBets,
  playerDisplayName, betTypeLabel, betStatusLabel,
  type BetWithPlayers, type Bet,
} from '@/lib/bets-service'
import type { Player, Match } from '@/lib/scoring'

// ─── Static match config ────────────────────────────────────────────────────

const DAY1_CONFIG = [
  { group: 1, side1: ['Yurus', 'Krasinski'], side2: ['Stratton', 'Sturgis'] },
  { group: 2, side1: ['Short', 'Leone'],     side2: ['Riley', 'Hanna'] },
  { group: 3, side1: ['Hallimen', 'KOP'],    side2: ['Stewart', 'Howcroft'] },
  { group: 4, side1: ['Cummings', 'Lawler'], side2: ['Horeth', 'Campbell'] },
  { group: 5, side1: ['Cook', 'Joel'],       side2: ['Chantra', 'Boeggeman'] },
]
const DAY2_CONFIG = [
  { group: 1, side1: ['Cook', 'KOP'],        side2: ['Riley', 'Boeggeman'] },
  { group: 2, side1: ['Short', 'Yurus'],     side2: ['Stratton', 'Hanna'] },
  { group: 3, side1: ['Hallimen', 'Lawler'], side2: ['Horeth', 'Sturgis'] },
  { group: 4, side1: ['Cummings', 'Joel'],   side2: ['Chantra', 'Howcroft'] },
  { group: 5, side1: ['Leone', 'Krasinski'], side2: ['Stewart', 'Campbell'] },
]
const DAY3_CONFIG = [
  { group: 1,  side1: ['Hallimen'],  side2: ['Riley'] },
  { group: 2,  side1: ['Cummings'],  side2: ['Stratton'] },
  { group: 3,  side1: ['Short'],     side2: ['Stewart'] },
  { group: 4,  side1: ['Cook'],      side2: ['Chantra'] },
  { group: 5,  side1: ['Leone'],     side2: ['Horeth'] },
  { group: 6,  side1: ['Yurus'],     side2: ['Howcroft'] },
  { group: 7,  side1: ['Krasinski'], side2: ['Sturgis'] },
  { group: 8,  side1: ['KOP'],       side2: ['Hanna'] },
  { group: 9,  side1: ['Joel'],      side2: ['Campbell'] },
  { group: 10, side1: ['Lawler'],    side2: ['Boeggeman'] },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function teamHcp(names: string[]): number {
  return names.length === 1
    ? (PLAYER_HCPS[names[0]] ?? 10)
    : teamEffectiveHcp(names.map(n => PLAYER_HCPS[n] ?? 10))
}

function getMatchOdds(betType: 'front' | 'back' | 'overall', hcp1: number, hcp2: number) {
  return betType === 'overall' ? getOdds(hcp1, hcp2) : getNineHoleOdds(hcp1, hcp2)
}

function mlColor(ml: number) {
  if (Math.abs(ml) <= 110) return 'text-gray-600'
  return ml < 0 ? 'text-emerald-600' : 'text-amber-500'
}

function StatusBadge({ status, s1, s2 }: { status: Bet['status']; s1: string; s2: string }) {
  const styles: Record<Bet['status'], string> = {
    pending:    'bg-yellow-100 text-yellow-700',
    active:     'bg-blue-100 text-blue-700',
    side1_won:  'bg-emerald-100 text-emerald-700',
    side2_won:  'bg-emerald-100 text-emerald-700',
    push:       'bg-amber-100 text-amber-700',
    cancelled:  'bg-red-100 text-red-400 line-through',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${styles[status]}`}>
      {betStatusLabel(status, s1, s2)}
    </span>
  )
}

// ─── Bet Detail / Accept Modal ───────────────────────────────────────────────

function BetDetailModal({
  bet, viewerPlayerId, onClose, onAccepted,
}: {
  bet: BetWithPlayers
  viewerPlayerId: string
  onClose: () => void
  onAccepted: () => void
}) {
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')

  const s1 = playerDisplayName(bet.side1_player)
  const s2 = playerDisplayName(bet.side2_player)

  const isPending = bet.status === 'pending'
  const proposerIsS1 = bet.proposer_side === 'side1'
  const acceptorId = proposerIsS1 ? bet.side2_player_id : bet.side1_player_id
  const isAcceptor = viewerPlayerId === acceptorId
  const proposerName = proposerIsS1 ? s1 : s2

  async function handleAccept() {
    if (!accepted) { setError('Check the box to confirm you accept this bet'); return }
    setAccepting(true)
    setError('')
    try {
      await acceptBet(bet.id)
      onAccepted()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to accept')
    } finally {
      setAccepting(false)
    }
  }

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
            <span className="font-semibold">{bet.tease_adjustment === 0 ? 'None' : bet.tease_adjustment > 0 ? `+${bet.tease_adjustment}` : bet.tease_adjustment}</span>
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">{s1}</div>
                <div className="text-xs text-gray-400">Side 1 · {formatMoneyline(bet.side1_ml)}</div>
              </div>
              <div className="text-lg font-bold">${Number(bet.side1_amount).toLocaleString()}</div>
            </div>
            <div className="text-center text-gray-300 text-xs">vs</div>
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">{s2}</div>
                <div className="text-xs text-gray-400">Side 2 · {formatMoneyline(bet.side2_ml)}</div>
              </div>
              <div className="text-lg font-bold">${Number(bet.side2_amount).toLocaleString()}</div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="text-gray-500">Status</span>
            <StatusBadge status={bet.status} s1={s1} s2={s2} />
          </div>
          {isPending && (
            <div className="text-xs text-gray-400 italic text-center">
              Proposed by {proposerName} · awaiting {isAcceptor ? 'your' : 'opponent'} acceptance
            </div>
          )}
        </div>

        {/* Accept action — shown to the non-proposer only */}
        {isPending && isAcceptor && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-yellow-800 mb-3">
              {proposerName} wants to bet with you. Accept?
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={e => { setAccepted(e.target.checked); setError('') }}
                className="mt-0.5 w-4 h-4 accent-[#2a6b7c]"
              />
              <span className="text-sm text-gray-700">
                I acknowledge and accept this bet
              </span>
            </label>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="mt-3 w-full py-2.5 bg-[#2a6b7c] text-white rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {accepting ? 'Accepting...' : '✓ Accept Bet'}
            </button>
          </div>
        )}

        {/* Venmo pay links */}
        {(bet.side1_player.venmo_handle || bet.side2_player.venmo_handle) && (
          <div className="mt-3 flex gap-2">
            {[bet.side1_player, bet.side2_player].map(p => p.venmo_handle ? (
              <a
                key={p.id}
                href={`https://venmo.com/${p.venmo_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#3D95CE] text-white text-xs font-bold hover:bg-[#3182b8] transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 2c.8 1.3 1.2 2.7 1.2 4.5 0 5.6-4.8 12.9-8.7 18H4.8L2 2.6l6.3-.6 1.6 12.9C11.6 12 13.5 8 13.5 5.2c0-1.7-.3-2.9-.8-3.9L19.5 2z"/></svg>
                Pay {playerDisplayName(p).split(' ')[0]}
              </a>
            ) : null)}
          </div>
        )}

        {!(isPending && isAcceptor) && (
          <button onClick={onClose} className="mt-3 w-full py-2.5 bg-[#2a6b7c] text-white rounded-xl font-semibold text-sm">
            Close
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Add Bet Modal — 4-step wizard ──────────────────────────────────────────

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
  const [step, setStep] = useState(1)

  // Step 1: who are you
  const [myPlayerId, setMyPlayerId] = useState('')

  // Step 2: which side are you backing
  const [mySide, setMySide] = useState<'side1' | 'side2' | ''>('')

  // Step 3: who are you betting with (from the OTHER side)
  const [opponentPlayerId, setOpponentPlayerId] = useState('')

  // Step 4: bet details
  const [betType, setBetType] = useState<'front' | 'back' | 'overall'>('overall')
  const [tease, setTease] = useState(0)
  const [myAmount, setMyAmount] = useState('')
  const [myAmountError, setMyAmountError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const isTeam = side1Names.length > 1
  const hcp1 = teamHcp(side1Names)
  const hcp2 = teamHcp(side2Names)
  const baseOdds = getMatchOdds(betType, hcp1, hcp2)
  const [side1Ml, side2Ml] = applyTease(baseOdds.aMoneyline, baseOdds.bMoneyline, tease)
  const myMl = mySide === 'side1' ? side1Ml : side2Ml
  const oppMl = mySide === 'side1' ? side2Ml : side1Ml

  const myPlayer = players.find(p => p.id === myPlayerId)
  // Any player can bet on any match — opponent = anyone except yourself
  const opponentPlayers = players.filter(p => p.id !== myPlayerId)

  // Side 1 and 2 player IDs for the DB
  const side1PlayerId = mySide === 'side1' ? myPlayerId : opponentPlayerId
  const side2PlayerId = mySide === 'side2' ? myPlayerId : opponentPlayerId

  function validateAmount(val: string) {
    const cleaned = val.replace(/[^0-9]/g, '')
    setMyAmount(cleaned)
    if (val !== cleaned) { setMyAmountError('Numbers only — no letters or symbols'); return }
    if (cleaned.length > 5) { setMyAmountError('Max $99,999'); return }
    setMyAmountError('')
  }

  function canAdvance() {
    if (step === 1) return !!myPlayerId
    if (step === 2) return !!mySide
    if (step === 3) return !!opponentPlayerId
    return true
  }

  async function handleSubmit() {
    const amt = parseInt(myAmount)
    if (!myAmount || isNaN(amt) || amt < 1) { setMyAmountError('Enter a valid amount'); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      await createBet({
        matchId,
        betType,
        side1PlayerId,
        side1Amount: amt,
        side2PlayerId,
        side2Amount: amt,
        side1Ml,
        side2Ml,
        teaseAdjustment: tease,
        proposerSide: mySide as 'side1' | 'side2',
      })
      onCreated()
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create bet')
    } finally {
      setSubmitting(false)
    }
  }

  const formatLabel = isTeam ? (day === 1 ? 'Best Ball' : 'Stableford') : 'Individual'
  const myPlayerName = myPlayer ? (myPlayer.first_name && myPlayer.last_name ? `${myPlayer.first_name} ${myPlayer.last_name}` : myPlayer.name) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#f5f0e8] rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[92vh]"
        style={{ fontFamily: 'Georgia, serif' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#f5f0e8] border-b border-gray-200 px-5 pt-5 pb-3 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-[#2a6b7c]">New Bet</h2>
              <p className="text-xs text-gray-500">Day {day} · Group {group} · {formatLabel}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">✕</button>
          </div>
          {/* Step progress */}
          <div className="flex gap-1 mt-3">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#2a6b7c]' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── Step 1: Who are you? ── */}
          {step === 1 && (
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Who are you?</h3>
              <p className="text-xs text-gray-400 mb-4">Select your name to get started.</p>
              <div className="grid grid-cols-2 gap-2">
                {players
                  .sort((a, b) => (a.first_name ?? a.name).localeCompare(b.first_name ?? b.name))
                  .map(p => {
                    const name = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name
                    const selected = myPlayerId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setMyPlayerId(p.id)}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${selected ? 'border-[#2a6b7c] bg-[#2a6b7c]/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      >
                        {p.avatar_url ? (
                          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200">
                            <img src={p.avatar_url} alt={name} className="w-full h-full object-cover" style={{ objectPosition: p.avatar_position || 'center 30%' }} />
                          </div>
                        ) : (
                          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white ${p.team === 'Shaft' ? 'bg-blue-500' : 'bg-red-500'}`}>
                            {(p.first_name?.charAt(0) ?? '') + (p.last_name?.charAt(0) ?? '')}
                          </div>
                        )}
                        <span className="text-xs font-semibold text-gray-800 leading-tight">{name}</span>
                      </button>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ── Step 2: Who are you backing? ── */}
          {step === 2 && (
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Who are you backing?</h3>
              <p className="text-xs text-gray-400 mb-4">Pick the side you&apos;re betting <em>on</em>.</p>
              <div className="space-y-3">
                {([['side1', side1Names, hcp1], ['side2', side2Names, hcp2]] as const).map(([sideKey, names, hcp]) => {
                  const selected = mySide === sideKey
                  const ml = sideKey === 'side1' ? side1Ml : side2Ml
                  return (
                    <button
                      key={sideKey}
                      onClick={() => setMySide(sideKey)}
                      className={`w-full flex justify-between items-center p-4 rounded-xl border-2 text-left transition-all ${selected ? 'border-[#2a6b7c] bg-[#2a6b7c]/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                    >
                      <div>
                        <div className="font-bold text-gray-800">{names.join(' & ')}</div>
                        {isTeam && <div className="text-xs text-gray-400">eff. hcp {hcp}</div>}
                        <div className="text-xs text-gray-400 mt-1">Overall line</div>
                      </div>
                      <div className={`text-xl font-bold ml-3 ${mlColor(ml)}`}>{formatMoneyline(ml)}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: Who are you betting with? ── */}
          {step === 3 && (
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Who are you betting with?</h3>
              <p className="text-xs text-gray-400 mb-4">
                Anyone in the tournament can be your opponent — they&apos;ll need to accept.
              </p>
              <div className="space-y-2">
                {opponentPlayers
                  .sort((a, b) => (a.first_name ?? a.name).localeCompare(b.first_name ?? b.name))
                  .map(p => {
                    const name = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name
                    const selected = opponentPlayerId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setOpponentPlayerId(p.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${selected ? 'border-[#2a6b7c] bg-[#2a6b7c]/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      >
                        {p.avatar_url ? (
                          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-gray-200">
                            <img src={p.avatar_url} alt={name} className="w-full h-full object-cover" style={{ objectPosition: p.avatar_position || 'center 30%' }} />
                          </div>
                        ) : (
                          <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white ${p.team === 'Shaft' ? 'bg-blue-500' : 'bg-red-500'}`}>
                            {(p.first_name?.charAt(0) ?? '') + (p.last_name?.charAt(0) ?? '')}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm text-gray-800">{name}</div>
                          <div className="text-xs text-gray-400">Hcp {PLAYER_HCPS[p.name] ?? '?'}</div>
                        </div>
                        {selected && <div className="ml-auto text-[#2a6b7c] font-bold">✓</div>}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ── Step 4: Bet details ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-800 mb-0.5">Bet details</h3>
                <p className="text-xs text-gray-400">
                  {myPlayerName} backing <strong>{mySide === 'side1' ? side1Names.join(' & ') : side2Names.join(' & ')}</strong>
                </p>
              </div>

              {/* Bet type tabs */}
              <div>
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">What are you betting on?</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['front', 'back', 'overall'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setBetType(t)}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${betType === t ? 'bg-[#2a6b7c] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >
                      {betTypeLabel(t)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lines */}
              <div className="bg-white rounded-xl p-4">
                <p className="text-xs text-gray-400 text-center mb-3">Lines · drag slider to tease</p>
                <div className="flex justify-around mb-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1 truncate max-w-[100px]">{side1Names.join(' & ')}</div>
                    <div className={`text-xl font-bold ${mlColor(side1Ml)}`}>{formatMoneyline(side1Ml)}</div>
                    <div className="text-[10px] text-gray-300">Side 1</div>
                  </div>
                  <div className="text-gray-300 self-center text-sm">vs</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1 truncate max-w-[100px]">{side2Names.join(' & ')}</div>
                    <div className={`text-xl font-bold ${mlColor(side2Ml)}`}>{formatMoneyline(side2Ml)}</div>
                    <div className="text-[10px] text-gray-300">Side 2</div>
                  </div>
                </div>
                <div className="text-[10px] flex justify-between text-gray-400 mb-1">
                  <span>← Favor {side2Names[0]}</span>
                  <span className="text-gray-500 font-medium">{tease === 0 ? 'Baseline' : tease > 0 ? `+${tease} → ${side1Names[0]}` : `${tease} → ${side2Names[0]}`}</span>
                  <span>Favor {side1Names[0]} →</span>
                </div>
                <input type="range" min={-50} max={50} step={5} value={tease} onChange={e => setTease(Number(e.target.value))} className="w-full accent-[#2a6b7c]" />
                <div className="mt-3 p-2.5 bg-[#2a6b7c]/5 rounded-lg text-center">
                  <span className="text-xs text-gray-500">Your line: </span>
                  <span className={`text-base font-bold ${mlColor(myMl)}`}>{formatMoneyline(myMl)}</span>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">Your bet amount ($)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 100"
                  maxLength={5}
                  value={myAmount}
                  onChange={e => validateAmount(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-[#2a6b7c] text-center"
                />
                {myAmountError && <p className="text-red-500 text-xs mt-1 text-center">{myAmountError}</p>}
                <p className="text-xs text-gray-400 text-center mt-1">Numbers only · max $99,999</p>
              </div>

              {submitError && <p className="text-red-500 text-sm text-center">{submitError}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 bg-[#2a6b7c] text-white rounded-xl font-bold text-sm hover:bg-[#235a68] disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Sending...' : '📨 Send Bet to Opponent'}
              </button>
              <p className="text-center text-xs text-gray-400">Opponent will need to accept before it goes active.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2 pb-1">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                ← Back
              </button>
            )}
            {step < 4 && (
              <button
                onClick={() => canAdvance() && setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex-1 py-2.5 bg-[#2a6b7c] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#235a68] transition-colors"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Match Card ──────────────────────────────────────────────────────────────

function MatchCard({
  matchId, day, group, side1Names, side2Names, matchBets, players,
  viewerPlayerId, onAddBet, onViewBet,
}: {
  matchId: string; day: number; group: number
  side1Names: string[]; side2Names: string[]
  matchBets: BetWithPlayers[]; players: Player[]
  viewerPlayerId: string
  onAddBet: () => void
  onViewBet: (bet: BetWithPlayers) => void
}) {
  const isTeam = side1Names.length > 1
  const hcp1 = teamHcp(side1Names)
  const hcp2 = teamHcp(side2Names)
  const odds = getOdds(hcp1, hcp2)
  const pendingForMe = matchBets.filter(b => {
    if (b.status !== 'pending') return false
    const acceptorId = b.proposer_side === 'side1' ? b.side2_player_id : b.side1_player_id
    return acceptorId === viewerPlayerId
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-[#2a6b7c]/5">
        <span className="text-xs font-bold text-[#2a6b7c] uppercase tracking-wide">Group {group}</span>
        <div className="flex gap-1.5">
          {pendingForMe.length > 0 && (
            <span className="text-xs bg-yellow-400 text-yellow-900 font-bold rounded-full px-2 py-0.5">
              {pendingForMe.length} awaiting you
            </span>
          )}
          {matchBets.filter(b => b.status === 'active').length > 0 && (
            <span className="text-xs bg-[#2a6b7c] text-white rounded-full px-2 py-0.5">
              {matchBets.filter(b => b.status === 'active').length} active
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
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

        {matchBets.length > 0 && (
          <div className="border-t border-gray-100 pt-2 mt-2 space-y-1.5">
            {matchBets.map(bet => {
              const s1 = playerDisplayName(bet.side1_player)
              const s2 = playerDisplayName(bet.side2_player)
              return (
                <button key={bet.id} onClick={() => onViewBet(bet)} className="w-full text-left flex items-center justify-between rounded-lg hover:bg-gray-50 px-2 py-1.5 transition-colors gap-2">
                  <span className="text-xs text-gray-400 shrink-0">{betTypeLabel(bet.bet_type)}</span>
                  <span className="text-xs text-gray-700 truncate flex-1">
                    {s1.split(' ')[0]} ${Number(bet.side1_amount).toLocaleString()} vs {s2.split(' ')[0]} ${Number(bet.side2_amount).toLocaleString()}
                  </span>
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
  const [viewerPlayerId, setViewerPlayerId] = useState('')
  const [addBetTarget, setAddBetTarget] = useState<MatchWithConfig | null>(null)
  const [viewBet, setViewBet] = useState<BetWithPlayers | null>(null)

  useEffect(() => { loadAll() }, [])

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
    return config.map((c: { group: number; side1: string[]; side2: string[] }) => {
      const dbMatch = dayMatches.find(m => m.group_number === c.group)
      return { dbMatch: dbMatch as Match, side1Names: c.side1, side2Names: c.side2 }
    }).filter(m => m.dbMatch)
  }

  const pendingForMe = bets.filter(b => {
    if (b.status !== 'pending') return false
    const acceptorId = b.proposer_side === 'side1' ? b.side2_player_id : b.side1_player_id
    return acceptorId === viewerPlayerId
  })

  const sortedPlayers = [...players].sort((a, b) => (a.first_name ?? a.name).localeCompare(b.first_name ?? b.name))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96" style={{ fontFamily: 'Georgia, serif' }}>
        <div className="text-gray-400">Loading bets...</div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6" style={{ fontFamily: 'Georgia, serif', backgroundColor: '#f5f0e8', minHeight: '100vh' }}>
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-[#2a6b7c]">🎲 Bets</h1>
        <p className="text-xs text-gray-400 mt-1">5,000 MC simulations · American moneylines</p>
      </div>

      {/* "You are" selector — helps surface pending bets */}
      <div className="bg-white rounded-xl p-3 mb-4 shadow-sm flex items-center gap-3">
        <span className="text-xs text-gray-500 shrink-0 font-semibold">You are:</span>
        <select
          value={viewerPlayerId}
          onChange={e => setViewerPlayerId(e.target.value)}
          className="flex-1 text-sm border-0 bg-transparent focus:outline-none text-gray-700 font-semibold"
        >
          <option value="">— select to see your bets —</option>
          {sortedPlayers.map(p => (
            <option key={p.id} value={p.id}>
              {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Pending bets banner */}
      {viewerPlayerId && pendingForMe.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-lg">⏳</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-yellow-800">
              {pendingForMe.length} bet{pendingForMe.length !== 1 ? 's' : ''} awaiting your acceptance
            </div>
            <div className="text-xs text-yellow-600">Tap the bet below to accept</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> Fav</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Dog</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Pick</span>
      </div>

      {/* Day tabs */}
      <div className="flex rounded-xl overflow-hidden border border-gray-300 mb-5">
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

      <p className="text-xs text-center text-gray-400 -mt-3 mb-4">
        {activeDay === 1 ? 'Best Ball · Ritz Carlton GC · Mar 16' : activeDay === 2 ? 'Stableford · Southern Dunes · Mar 17' : 'Individual · Champions Gate · Mar 18'}
      </p>

      <div className="space-y-4">
        {getMatchConfig(activeDay).map(({ dbMatch, side1Names, side2Names }) => (
          <MatchCard
            key={dbMatch.id}
            matchId={dbMatch.id}
            day={activeDay}
            group={dbMatch.group_number}
            side1Names={side1Names}
            side2Names={side2Names}
            matchBets={bets.filter(b => b.match_id === dbMatch.id)}
            players={players}
            viewerPlayerId={viewerPlayerId}
            onAddBet={() => setAddBetTarget({ dbMatch, side1Names, side2Names })}
            onViewBet={setViewBet}
          />
        ))}
      </div>

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

      {viewBet && (
        <BetDetailModal
          bet={viewBet}
          viewerPlayerId={viewerPlayerId}
          onClose={() => setViewBet(null)}
          onAccepted={() => { setViewBet(null); loadAll() }}
        />
      )}
    </div>
  )
}
