'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getOdds, teamEffectiveHcp, teaseOdds,
  formatMoneyline, PLAYER_HCPS,
} from '@/lib/monte-carlo'
import {
  createBet, acceptBet, getAllBets,
  playerDisplayName, betTypeLabel, betStatusLabel, betTermsInfo, matchTeamsLabel, matchTeamsParts,
  type BetWithPlayers, type Bet,
} from '@/lib/bets-service'
import type { Player, Match } from '@/lib/scoring'
import { openVenmo } from '@/lib/venmo'

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
  bet, day, viewerPlayerId, players, onClose, onAccepted,
}: {
  bet: BetWithPlayers
  day?: number
  viewerPlayerId: string
  players: { id: string; name: string; first_name?: string | null }[]
  onClose: () => void
  onAccepted: () => void
}) {
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')

  const s1 = playerDisplayName(bet.side1_player)
  const s2 = playerDisplayName(bet.side2_player)

  const isPending   = bet.status === 'pending'
  const isSettled   = ['side1_won', 'side2_won', 'push'].includes(bet.status)
  const isPush      = bet.status === 'push'
  const viewerIs1   = viewerPlayerId === bet.side1_player_id
  const viewerIs2   = viewerPlayerId === bet.side2_player_id
  const viewerWon   = (viewerIs1 && bet.status === 'side1_won') || (viewerIs2 && bet.status === 'side2_won')
  const viewerLost  = (viewerIs1 && bet.status === 'side2_won') || (viewerIs2 && bet.status === 'side1_won')
  const winnerPlayer  = bet.status === 'side1_won' ? bet.side1_player : bet.side2_player
  const loserPlayer   = bet.status === 'side1_won' ? bet.side2_player : bet.side1_player
  const winnerName    = bet.status === 'side1_won' ? s1 : s2
  const loserName     = bet.status === 'side1_won' ? s2 : s1
  const winnerAmount  = bet.status === 'side1_won' ? bet.side2_amount : bet.side1_amount
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
          <div>
            <h2 className="text-lg font-bold text-[#2a6b7c]">Bet Details</h2>
            {bet.match && (() => {
              const vIs1 = viewerPlayerId === bet.side1_player_id
              const [t1, t2] = matchTeamsParts(bet.match, players)
              const myT  = vIs1 ? t1 : t2
              const oppT = vIs1 ? t2 : t1
              const hasViewer = !!viewerPlayerId && (viewerPlayerId === bet.side1_player_id || viewerPlayerId === bet.side2_player_id)
              return (
                <p className="text-xs text-gray-400 mt-0.5">
                  Day {bet.match.day} ·{' '}
                  {hasViewer
                    ? <><span className="font-semibold text-gray-600">✓ {myT}</span> vs {oppT}</>
                    : matchTeamsLabel(bet.match, players)
                  }
                </p>
              )
            })()}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* ── Settlement result card ── */}
        {isSettled && (
          <div className="mb-4">
            {isPush && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                <p className="text-2xl mb-1">🤝</p>
                <p className="font-bold text-amber-800 text-base">Push — all square.</p>
                <p className="text-sm text-amber-600 mt-1">No money changes hands on this one. Grab a beer.</p>
              </div>
            )}
            {viewerWon && !isPush && (
              <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 text-center">
                <p className="text-3xl mb-1">🏆</p>
                <p className="font-bold text-emerald-800 text-lg">You won!</p>
                <p className="text-sm text-emerald-700 mt-1">
                  <strong>${Number(winnerAmount).toLocaleString()}</strong> from {loserName} — your read was right.
                </p>
                <p className="text-xs text-emerald-600 mt-1 italic">{loserName} has been notified. Expect payment.</p>
                {loserPlayer.venmo_handle && (
                  <button
                    onClick={() => openVenmo(loserPlayer.venmo_handle!, 'charge', 'ABTOW 2026 Bet')}
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#008CFF] text-white text-sm font-bold rounded-full"
                  >
                    <svg width="14" height="14" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                    Request from {loserName}
                  </button>
                )}
              </div>
            )}
            {viewerLost && !isPush && (
              <div className="rounded-2xl overflow-hidden border-2 border-red-300">
                <img src="/tywin.jpg" alt="Tywin Lannister" className="w-full object-cover max-h-48" style={{objectPosition:'center 20%'}} />
                <div className="bg-red-50 p-4 text-center">
                  <p className="font-bold text-red-900 text-base mb-1">📜 A debt is owed.</p>
                  <p className="text-sm text-red-800">
                    You owe <strong>{winnerName}</strong> <strong>${Number(winnerAmount).toLocaleString()}</strong>.
                  </p>
                  <p className="text-sm text-red-700 mt-1 italic">
                    &ldquo;A Lannister always pays their debts.&rdquo;<br/>
                    Be an honorable man — don&apos;t make them ask twice.
                  </p>
                  {winnerPlayer.venmo_handle && (
                    <button
                      onClick={() => openVenmo(winnerPlayer.venmo_handle!, 'pay', 'ABTOW 2026 Bet')}
                      className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#008CFF] text-white text-sm font-bold rounded-full"
                    >
                      <svg width="14" height="14" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                      Pay {winnerName}
                    </button>
                  )}
                </div>
              </div>
            )}
            {!viewerWon && !viewerLost && !isPush && (
              /* Spectator view — not a participant in this bet */
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 text-center text-sm text-gray-600">
                <StatusBadge status={bet.status} s1={s1} s2={s2} />
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl p-4 space-y-3 text-sm">
          {day ? (() => {
            const terms = betTermsInfo(bet.bet_type, bet.tease_adjustment, s1, s2, day)
            return (
              <div className="bg-[#2a6b7c]/5 border border-[#2a6b7c]/20 rounded-xl p-3 space-y-1.5 text-xs">
                <p className="font-bold text-[#2a6b7c] text-sm">📋 Bet Terms</p>
                <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Segment</span><span className="text-gray-700 font-medium">{terms.segment}</span></div>
                <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Format</span><span className="text-gray-700 font-medium">{terms.format}</span></div>
                <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Strokes</span><span className="text-gray-700 font-medium">{terms.stroke}</span></div>
                <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Winner</span><span className="text-gray-700 font-bold">{terms.winner}</span></div>
              </div>
            )
          })() : (
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-semibold">{betTypeLabel(bet.bet_type)}{bet.tease_adjustment !== 0 && <span className="text-gray-400 text-xs ml-1">({bet.tease_adjustment > 0 ? '+' : ''}{bet.tease_adjustment} strokes)</span>}</span>
            </div>
          )}
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
              <button
                key={p.id}
                onClick={() => openVenmo(p.venmo_handle!, 'pay', 'ABTOW 2026 Bet')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#3D95CE] text-white text-xs font-bold hover:bg-[#3182b8] transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 2c.8 1.3 1.2 2.7 1.2 4.5 0 5.6-4.8 12.9-8.7 18H4.8L2 2.6l6.3-.6 1.6 12.9C11.6 12 13.5 8 13.5 5.2c0-1.7-.3-2.9-.8-3.9L19.5 2z"/></svg>
                Pay {playerDisplayName(p).split(' ')[0]}
              </button>
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

// ─── Add Bet Modal — sequential accordion flow ──────────────────────────────

interface AddBetModalProps {
  matchId: string
  day: number
  group: number
  side1Names: string[]
  side2Names: string[]
  players: Player[]
  viewerPlayerId?: string
  onViewerChange?: (playerId: string) => void
  onClose: () => void
  onCreated: () => void
}

function AddBetModal({ matchId, day, group, side1Names, side2Names, players, viewerPlayerId = '', onViewerChange, onClose, onCreated }: AddBetModalProps) {
  // ── Steps 1–3 — skip to step 2 if we already know who the user is
  const [step, setStep] = useState<1 | 2 | 3 | 4>(viewerPlayerId ? 2 : 1)
  const [myPlayerId, setMyPlayerId] = useState(viewerPlayerId)
  const [mySide, setMySide] = useState<'side1' | 'side2' | ''>('')
  const [opponentPlayerId, setOpponentPlayerId] = useState('')

  // ── Step 4 — one slot per bet type
  type SlotStatus = 'idle' | 'active' | 'logged' | 'skipped'
  interface BetSlot { amount: string; amountError: string; tease: number; status: SlotStatus; showTip?: boolean }
  const mkSlot = (status: SlotStatus): BetSlot => ({ amount: '', amountError: '', tease: 0, status, showTip: false })
  const [slots, setSlots] = useState<Record<'front' | 'back' | 'overall', BetSlot>>({
    front:   mkSlot('active'),
    back:    mkSlot('idle'),
    overall: mkSlot('idle'),
  })
  const [missingPrompt, setMissingPrompt] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const BET_ORDER: ('front' | 'back' | 'overall')[] = ['front', 'back', 'overall']
  const isTeam = side1Names.length > 1
  const hcp1 = teamHcp(side1Names)
  const hcp2 = teamHcp(side2Names)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const myPlayerName = myPlayer ? (myPlayer.first_name && myPlayer.last_name ? `${myPlayer.first_name} ${myPlayer.last_name}` : myPlayer.name) : ''
  const opponentPlayers = players.filter(p => p.id !== myPlayerId).sort((a, b) => (a.first_name ?? a.name).localeCompare(b.first_name ?? b.name))
  const side1PlayerId = mySide === 'side1' ? myPlayerId : opponentPlayerId
  const side2PlayerId = mySide === 'side2' ? myPlayerId : opponentPlayerId

  function slotMl(type: 'front' | 'back' | 'overall', strokes: number): [number, number] {
    return teaseOdds(hcp1, hcp2, strokes, type)
  }

  function updateSlot(type: 'front' | 'back' | 'overall', patch: Partial<BetSlot>) {
    setSlots(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }

  function validateAmount(val: string, type: 'front' | 'back' | 'overall') {
    const cleaned = val.replace(/[^0-9]/g, '')
    const err = val !== cleaned ? 'Numbers only' : cleaned.length > 5 ? 'Max $99,999' : ''
    updateSlot(type, { amount: cleaned, amountError: err })
  }

  function advanceAfter(type: 'front' | 'back' | 'overall') {
    const idx = BET_ORDER.indexOf(type)
    const next = BET_ORDER[idx + 1]
    if (!next) return
    setSlots(prev => {
      const patch: Partial<BetSlot> = { status: 'active' }
      if (next === 'overall') {
        // Sum strokes from logged front/back bets — overall net is front+back combined
        const frontTease = prev.front.status === 'logged' ? prev.front.tease : 0
        const backTease  = prev.back.status  === 'logged' ? prev.back.tease  : 0
        patch.tease = Math.min(5, Math.max(-5, frontTease + backTease))
      }
      return { ...prev, [next]: { ...prev[next], ...patch } }
    })
  }

  function logSlot(type: 'front' | 'back' | 'overall') {
    const slot = slots[type]
    const amt = parseInt(slot.amount)
    if (!slot.amount || isNaN(amt) || amt < 1) {
      updateSlot(type, { amountError: 'Enter an amount to add this bet' })
      return
    }
    updateSlot(type, { status: 'logged', amountError: '' })
    advanceAfter(type)
  }

  function skipSlot(type: 'front' | 'back' | 'overall') {
    updateSlot(type, { status: 'skipped', amount: '', amountError: '' })
    advanceAfter(type)
  }

  function reactivateSlot(type: 'front' | 'back' | 'overall') {
    updateSlot(type, { status: 'active' })
  }

  const loggedSlots = BET_ORDER.filter(t => slots[t].status === 'logged')
  const allResolved = BET_ORDER.every(t => slots[t].status === 'logged' || slots[t].status === 'skipped')
  const onlyOverall = loggedSlots.length === 1 && slots.overall.status === 'logged' && slots.front.status === 'skipped' && slots.back.status === 'skipped'

  async function handleSubmit() {
    if (loggedSlots.length === 0) { setSubmitError('Log at least one bet first'); return }
    if (onlyOverall && !missingPrompt) { setMissingPrompt(true); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      await Promise.all(loggedSlots.map(type => {
        const slot = slots[type]
        const [s1Ml, s2Ml] = slotMl(type, slot.tease)
        return createBet({
          matchId, betType: type,
          side1PlayerId, side1Amount: parseInt(slot.amount),
          side2PlayerId, side2Amount: parseInt(slot.amount),
          side1Ml: s1Ml, side2Ml: s2Ml,
          teaseAdjustment: slot.tease,
          proposerSide: mySide as 'side1' | 'side2',
        })
      }))
      onCreated()
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  function addMissingSlots() {
    setMissingPrompt(false)
    setSlots(prev => ({
      ...prev,
      front: prev.front.status === 'skipped' ? { ...prev.front, status: 'active', amount: '', amountError: '' } : prev.front,
      back:  prev.back.status === 'skipped'  ? { ...prev.back,  status: 'active', amount: '', amountError: '' } : prev.back,
    }))
  }

  const formatLabel = isTeam ? (day === 1 ? 'Best Ball' : 'Stableford') : 'Individual'
  const mySideLabel = mySide === 'side1' ? side1Names.join(' & ') : mySide === 'side2' ? side2Names.join(' & ') : ''

  // ── Slot accordion component
  function BetSlotPanel({ type, label }: { type: 'front' | 'back' | 'overall'; label: string }) {
    const slot = slots[type]
    const [s1Ml, s2Ml] = slotMl(type, slot.tease)
    const myMl = mySide === 'side1' ? s1Ml : s2Ml

    if (slot.status === 'idle') {
      return (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 opacity-40">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</div>
        </div>
      )
    }

    if (slot.status === 'logged') {
      return (
        <button onClick={() => reactivateSlot(type)} className="w-full text-left rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wide">{label} ✓</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">
                ${parseInt(slot.amount).toLocaleString()} · {formatMoneyline(myMl)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                {betTermsInfo(type, slot.tease, side1Names.join(' & '), side2Names.join(' & '), day).compact}
              </div>
            </div>
            <span className="text-xs text-emerald-600 underline">edit</span>
          </div>
        </button>
      )
    }

    if (slot.status === 'skipped') {
      return (
        <button onClick={() => reactivateSlot(type)} className="w-full text-left rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label} — skipped</div>
            <span className="text-xs text-[#2a6b7c] underline">add bet</span>
          </div>
        </button>
      )
    }

    // active
    return (
      <div className="rounded-xl border-2 border-[#2a6b7c] bg-white p-4 space-y-3">
        <div className="text-xs font-bold text-[#2a6b7c] uppercase tracking-wide">{label}</div>

        {/* Auto-set note for Overall */}
        {type === 'overall' && slot.tease !== 0 && (
          <div className="flex items-start gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            <span className="shrink-0 mt-0.5">🔗</span>
            <span>
              Line auto-set from your Front &amp; Back adjustments ({slot.tease > 0 ? '+' : ''}{slot.tease} strokes total).
              Adjust below if needed.
            </span>
          </div>
        )}

        {/* Lines */}
        <div className="flex justify-around text-center bg-gray-50 rounded-lg py-2.5 px-2">
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5 truncate max-w-[90px]">{side1Names.join(' & ')}</div>
            <div className={`text-base font-bold ${mlColor(s1Ml)}`}>{formatMoneyline(s1Ml)}</div>
          </div>
          <div className="text-gray-300 self-center text-sm">vs</div>
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5 truncate max-w-[90px]">{side2Names.join(' & ')}</div>
            <div className={`text-base font-bold ${mlColor(s2Ml)}`}>{formatMoneyline(s2Ml)}</div>
          </div>
        </div>

        {/* Tease */}
        <div>
          <div className="flex justify-between items-center text-[10px] text-gray-400 mb-0.5">
            <span>← +strokes to {side2Names[0]}</span>
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-500">
                {slot.tease === 0
                  ? 'No strokes'
                  : slot.tease > 0
                    ? `+${slot.tease} to ${side1Names[0]}`
                    : `+${Math.abs(slot.tease)} to ${side2Names[0]}`}
              </span>
              <button
                onClick={() => updateSlot(type, { showTip: !slot.showTip })}
                className={`w-5 h-5 rounded-full transition-colors flex items-center justify-center text-[10px] font-bold shrink-0 ${slot.showTip ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-500 hover:bg-[#2a6b7c] hover:text-white'}`}
                title="What is this?"
              >ℹ</button>
            </div>
            <span>+strokes to {side1Names[0]} →</span>
          </div>

          {slot.showTip && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-3">
              <p className="font-bold text-base text-amber-900 mb-3">🎰 Adjust the line — trust your vibes.</p>
              <p className="text-sm text-gray-600 italic mb-0.5">The math is good.</p>
              <p className="text-sm text-gray-600 italic mb-0.5">The math doesn&apos;t know what you know.</p>
              <p className="text-sm text-gray-600 italic mb-3">Ask yourself:</p>
              <ul className="space-y-2 text-sm text-gray-800 mb-4">
                <li>🍺 Was someone over-served at dinner last night?</li>
                <li>🤢 Are they nursing a hangover that could floor a horse?</li>
                <li>😴 Did they look half-dead on the first tee?</li>
                <li>📱 Is their wife blowing up their phone right now?</li>
                <li>🎯 Did they just spend 2 hours on the range looking locked in?</li>
                <li>🧊 Have they been ice cold all trip and due for a hot round?</li>
              </ul>
              <p className="text-sm text-gray-500 italic border-t border-amber-200 pt-3">Slide left to spot them points. Slide right to squeeze &apos;em. Either way, don&apos;t come crying to Sampson when the vibes don&apos;t hit. 🤷</p>
            </div>
          )}

          <input
            type="range" min={-5} max={5} step={1}
            value={slot.tease}
            onChange={e => updateSlot(type, { tease: Number(e.target.value) })}
            className="w-full accent-[#2a6b7c]"
          />
          <div className="text-center mt-1">
            <span className="text-[10px] text-gray-400">{slot.tease !== 0 ? 'Adjusted line: ' : 'Your line: '}</span>
            <span className={`text-sm font-bold ${mlColor(myMl)}`}>{formatMoneyline(myMl)}</span>
          </div>
        </div>

        {/* Live Bet Terms */}
        {(() => {
          const terms = betTermsInfo(type, slot.tease, side1Names.join(' & '), side2Names.join(' & '), day)
          return (
            <div className="bg-[#2a6b7c]/5 border border-[#2a6b7c]/20 rounded-xl p-3 text-xs space-y-1.5">
              <p className="font-bold text-[#2a6b7c] text-sm">📋 Bet Terms</p>
              <div className="flex gap-1.5"><span className="text-gray-400 shrink-0 w-16">Segment</span><span className="text-gray-700 font-medium">{terms.segment}</span></div>
              <div className="flex gap-1.5"><span className="text-gray-400 shrink-0 w-16">Format</span><span className="text-gray-700 font-medium">{terms.format}</span></div>
              <div className="flex gap-1.5"><span className="text-gray-400 shrink-0 w-16">Strokes</span><span className="text-gray-700 font-medium">{terms.stroke}</span></div>
              <div className="flex gap-1.5"><span className="text-gray-400 shrink-0 w-16">Winner</span><span className="text-gray-700 font-bold">{terms.winner}</span></div>
            </div>
          )
        })()}

        {/* Amount */}
        <div>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            placeholder="$ amount"
            maxLength={5}
            value={slot.amount}
            onChange={e => validateAmount(e.target.value, type)}
            onKeyDown={e => { if (e.key === 'Enter') logSlot(type) }}
            autoFocus
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold text-center focus:outline-none focus:border-[#2a6b7c]"
          />
          {slot.amountError && <p className="text-red-500 text-xs text-center mt-1">{slot.amountError}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {type !== 'overall' ? (
            <button onClick={() => skipSlot(type)} className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Skip →
            </button>
          ) : (
            <button onClick={() => skipSlot(type)} className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Skip
            </button>
          )}
          <button
            onClick={() => logSlot(type)}
            className="flex-1 py-2 bg-[#2a6b7c] text-white rounded-xl text-sm font-bold hover:bg-[#235a68] transition-colors"
          >
            Add {label} Bet
          </button>
        </div>
      </div>
    )
  }

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
              <p className="text-xs text-gray-500">
                Day {day} · Group {group} · {formatLabel}
                {myPlayerName && <span className="ml-1 text-[#2a6b7c] font-semibold">· {myPlayerName}</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">✕</button>
          </div>
          <div className="flex gap-1 mt-3">
            {[1,2,3,4].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#2a6b7c]' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── Step 1: Who are you? ── */}
          {step === 1 && (
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Who are you?</h3>
              <p className="text-xs text-gray-400 mb-3">Tap your name to continue.</p>
              <div className="grid grid-cols-2 gap-2">
                {players.sort((a, b) => (a.first_name ?? a.name).localeCompare(b.first_name ?? b.name)).map(p => {
                  const name = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setMyPlayerId(p.id); onViewerChange?.(p.id); setStep(2) }}
                      className="flex items-center gap-2 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-[#2a6b7c] hover:bg-[#2a6b7c]/5 text-left transition-all"
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

          {/* ── Step 2: Which side? ── */}
          {step === 2 && (
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Who are you backing?</h3>
              <p className="text-xs text-gray-400 mb-3">Tap the side you&apos;re betting on.</p>
              <div className="space-y-3">
                {(['side1', 'side2'] as const).map(sideKey => {
                  const names = sideKey === 'side1' ? side1Names : side2Names
                  const hcp = sideKey === 'side1' ? hcp1 : hcp2
                  const [s1Ml] = slotMl('overall', 0)
                  const [, s2Ml] = slotMl('overall', 0)
                  const ml = sideKey === 'side1' ? s1Ml : s2Ml
                  return (
                    <button
                      key={sideKey}
                      onClick={() => { setMySide(sideKey); setStep(3) }}
                      className="w-full flex justify-between items-center p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-[#2a6b7c] hover:bg-[#2a6b7c]/5 text-left transition-all"
                    >
                      <div>
                        <div className="font-bold text-gray-800">{names.join(' & ')}</div>
                        {isTeam && <div className="text-xs text-gray-400">eff. hcp {hcp}</div>}
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
              <p className="text-xs text-gray-400 mb-3">Tap your opponent — they&apos;ll need to accept.</p>
              <div className="space-y-2">
                {opponentPlayers.map(p => {
                  const name = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.name
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setOpponentPlayerId(p.id); setStep(4) }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-[#2a6b7c] hover:bg-[#2a6b7c]/5 text-left transition-all"
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
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Bet entry ── */}
          {step === 4 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-gray-800 mb-0.5">Set your bets</h3>
                <p className="text-xs text-gray-400">
                  {myPlayerName} backing <strong>{mySideLabel}</strong> · up to 3 bets
                </p>
              </div>

              {BetSlotPanel({ type: 'front',   label: 'Front 9' })}
              {BetSlotPanel({ type: 'back',    label: 'Back 9' })}
              {BetSlotPanel({ type: 'overall', label: 'Overall' })}

              {/* Missing bet prompt */}
              {missingPrompt && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-800 mb-1">Want to also bet Front 9 or Back 9?</p>
                  <p className="text-xs text-amber-600 mb-3">You only have an Overall bet logged.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={addMissingSlots}
                      className="flex-1 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600"
                    >
                      Yes, add them
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 py-2 bg-[#2a6b7c] text-white rounded-xl text-sm font-bold hover:bg-[#235a68] disabled:opacity-50"
                    >
                      {submitting ? 'Sending...' : 'No, lock it in'}
                    </button>
                  </div>
                </div>
              )}

              {submitError && <p className="text-red-500 text-sm text-center">{submitError}</p>}

              {/* Lock In — shown when at least 1 logged and all active resolved */}
              {!missingPrompt && (loggedSlots.length > 0) && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-3 bg-[#2a6b7c] text-white rounded-xl font-bold text-sm hover:bg-[#235a68] disabled:opacity-50 transition-colors"
                >
                  {submitting
                    ? 'Sending...'
                    : `📨 Send ${loggedSlots.length} Bet${loggedSlots.length > 1 ? 's' : ''} to Opponent`}
                </button>
              )}

              <p className="text-center text-xs text-gray-400 pb-1">Opponent must accept before bets go active.</p>
            </div>
          )}

          {/* Back button for steps 2–3 (don't go back past step 2 if pre-identified) */}
          {step > (viewerPlayerId ? 2 : 1) && step < 4 && (
            <button onClick={() => setStep(s => (s - 1) as 1|2|3|4)} className="w-full py-2 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50">
              ← Back
            </button>
          )}
          {step === 4 && loggedSlots.length === 0 && !missingPrompt && (
            <button onClick={() => setStep(3)} className="w-full py-2 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50">
              ← Back
            </button>
          )}
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
  const [viewBetDay, setViewBetDay] = useState<number>(1)

  // Restore saved identity on mount
  useEffect(() => {
    const saved = localStorage.getItem('abtow_viewer_id')
    if (saved) setViewerPlayerId(saved)
  }, [])

  // Persist identity to localStorage whenever it changes
  function handleViewerChange(id: string) {
    setViewerPlayerId(id)
    if (id) localStorage.setItem('abtow_viewer_id', id)
    else localStorage.removeItem('abtow_viewer_id')
  }

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

  const settledForMe = bets.filter(b =>
    ['side1_won', 'side2_won', 'push'].includes(b.status) &&
    (b.side1_player_id === viewerPlayerId || b.side2_player_id === viewerPlayerId)
  )

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
          onChange={e => handleViewerChange(e.target.value)}
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

      {/* Settled bet result alerts */}
      {viewerPlayerId && settledForMe.length > 0 && (
        <div className="space-y-3 mb-4">
          {settledForMe.map(b => {
            const s1n = playerDisplayName(b.side1_player)
            const s2n = playerDisplayName(b.side2_player)
            const vIs1 = viewerPlayerId === b.side1_player_id
            const vWon  = (vIs1 && b.status === 'side1_won') || (!vIs1 && b.status === 'side2_won')
            const vLost = (vIs1 && b.status === 'side2_won') || (!vIs1 && b.status === 'side1_won')
            const winP  = b.status === 'side1_won' ? b.side1_player : b.side2_player
            const losP  = b.status === 'side1_won' ? b.side2_player : b.side1_player
            const winN  = b.status === 'side1_won' ? s1n : s2n
            const losN  = b.status === 'side1_won' ? s2n : s1n
            const amt   = b.status === 'side1_won' ? b.side2_amount : b.side1_amount
            const label = betTypeLabel(b.bet_type)

            if (b.status === 'push') return (
              <div key={b.id} className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl shrink-0">🤝</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-amber-800">Push — {label}</div>
                  <div className="text-xs text-amber-600">vs {vIs1 ? s2n : s1n} · No money changes hands</div>
                </div>
              </div>
            )
            if (vWon) return (
              <div key={b.id} className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl shrink-0">🏆</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-emerald-800">You won — {label}</div>
                    <div className="text-xs text-emerald-600">${Number(amt).toLocaleString()} from {losN}</div>
                  </div>
                  {losP.venmo_handle && (
                    <button
                      onClick={() => openVenmo(losP.venmo_handle!, 'charge', 'ABTOW 2026 Bet')}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#008CFF] text-white text-xs font-bold rounded-full">
                      <svg width="10" height="10" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                      Request
                    </button>
                  )}
                </div>
              </div>
            )
            if (vLost) return (
              <div key={b.id} className="rounded-xl overflow-hidden border-2 border-red-300">
                <img src="/tywin.jpg" alt="" className="w-full h-28 object-cover" style={{objectPosition:'center 15%'}} />
                <div className="bg-red-50 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-red-900">📜 You lost — {label}</div>
                      <div className="text-xs text-red-700 mt-0.5">
                        You owe {winN} <strong>${Number(amt).toLocaleString()}</strong>
                      </div>
                      <div className="text-xs text-red-500 italic mt-0.5">&ldquo;A Lannister always pays their debts.&rdquo;</div>
                    </div>
                    {winP.venmo_handle && (
                      <button
                        onClick={() => openVenmo(winP.venmo_handle!, 'pay', 'ABTOW 2026 Bet')}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#008CFF] text-white text-xs font-bold rounded-full mt-1">
                        <svg width="10" height="10" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                        Pay
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
            return null
          })}
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
            onViewBet={(bet) => { setViewBet(bet); setViewBetDay(activeDay) }}
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
          viewerPlayerId={viewerPlayerId}
          onViewerChange={handleViewerChange}
          onClose={() => setAddBetTarget(null)}
          onCreated={() => { setAddBetTarget(null); loadAll() }}
        />
      )}

      {viewBet && (
        <BetDetailModal
          bet={viewBet}
          day={viewBetDay}
          viewerPlayerId={viewerPlayerId}
          players={players}
          onClose={() => setViewBet(null)}
          onAccepted={() => { setViewBet(null); loadAll() }}
        />
      )}
    </div>
  )
}
