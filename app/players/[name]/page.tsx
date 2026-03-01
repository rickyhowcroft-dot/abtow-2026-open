'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/scoring'
import { openVenmo } from '@/lib/venmo'
import PlayerStatsModal from '@/app/components/PlayerStatsModal'
import { getBetsForPlayer, acceptBet, playerDisplayName, betTypeLabel, betStatusLabel, betTermsInfo, matchTeamsLabel, matchTeamsParts, type BetWithPlayers, type Bet, type MatchRef } from '@/lib/bets-service'
import { notifyBetAccepted } from '@/lib/notifications'
import { formatMoneyline } from '@/lib/monte-carlo'
import { getPlayerGameParticipation, getHandicapGameResults, type GameParticipant, type HandicapGamePlayer } from '@/lib/games-service'

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.first_name && player.last_name 
    ? `${player.first_name.charAt(0)}${player.last_name.charAt(0)}`
    : player.name.charAt(0)
  
  const teamBg = player.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'

  return (
    <div className="mx-auto mb-6 w-40 h-40 sm:w-60 sm:h-60 rounded-full overflow-hidden border-4 border-white shadow-lg">
      {player.avatar_url ? (
        <img 
          src={player.avatar_url} 
          alt={player.name}
          className="w-full h-full object-cover" style={{ objectPosition: player.avatar_position || 'center 30%' }}
        />
      ) : (
        <div className={`w-40 h-40 sm:w-60 sm:h-60 rounded-full flex items-center justify-center text-5xl sm:text-7xl font-bold text-white ${teamBg} shadow-lg`}>
          {initials}
        </div>
      )}
    </div>
  )
}

function AcceptBetInline({ bet, s1Name, s2Name, onAccepted }: {
  bet: BetWithPlayers; s1Name: string; s2Name: string; onAccepted: (betId: string) => void
}) {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const proposerName = bet.proposer_side === 'side1' ? s1Name : s2Name

  async function handle() {
    if (!checked) { setErr('Check the box to confirm'); return }
    setLoading(true)
    try {
      await acceptBet(bet.id)
      // Notify the proposer their bet was accepted
      const proposerId = bet.proposer_side === 'side1' ? bet.side1_player_id : bet.side2_player_id
      const acceptorPlayer = bet.proposer_side === 'side1' ? bet.side2_player : bet.side1_player
      const acceptorFirst = acceptorPlayer.first_name ?? acceptorPlayer.name.split(' ')[0]
      notifyBetAccepted({
        proposerPlayerId: proposerId,
        acceptorFirstName: acceptorFirst,
        betTypeLabel: betTypeLabel(bet.bet_type),
      })
      onAccepted(bet.id)
    }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-yellow-800 font-semibold">{proposerName.split(' ')[0]} wants to bet with you</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => { setChecked(e.target.checked); setErr('') }} className="mt-0.5 accent-[#2a6b7c]" />
        <span className="text-xs text-gray-700">I acknowledge and accept this bet</span>
      </label>
      {err && <p className="text-red-500 text-xs">{err}</p>}
      <button onClick={handle} disabled={loading} className="w-full py-2 bg-[#2a6b7c] text-white rounded-lg text-xs font-bold disabled:opacity-50">
        {loading ? 'Accepting...' : '✓ Accept Bet'}
      </button>
    </div>
  )
}

export default function PlayerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [profileTab, setProfileTab] = useState<'overview' | 'bets'>('overview')
  const [playerBets, setPlayerBets] = useState<BetWithPlayers[]>([])
  const [betsLoading, setBetsLoading] = useState(false)
  const [viewBet, setViewBet] = useState<BetWithPlayers | null>(null)
  const [isMe, setIsMe] = useState(false)
  const [allPlayers, setAllPlayers] = useState<{ id: string; name: string; first_name: string | null }[]>([])
  const [gameEntries, setGameEntries] = useState<{ participation: GameParticipant; playerResult: HandicapGamePlayer; rank: number; totalPlayers: number }[]>([])

  const playerName = decodeURIComponent(params.name as string)

  useEffect(() => {
    fetchPlayer()
    supabase.from('players').select('id, name, first_name, playing_handicap').then(({ data }) => {
      if (data) setAllPlayers(data)
    })
  }, [playerName])

  async function fetchPlayer() {
    setLoading(true)
    setNotFound(false)
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('name', playerName)
        .single()
      if (error || !data) {
        setNotFound(true)
      } else {
        setPlayer(data)
        fetchBets(data.id)
        setIsMe(localStorage.getItem('abtow_viewer_id') === data.id)
        fetchGameEntries(data.id)
      }
    } catch (error) {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  async function fetchBets(playerId: string) {
    setBetsLoading(true)
    try {
      const data = await getBetsForPlayer(playerId)
      setPlayerBets(data)
    } catch (e) {
      console.error('Failed to fetch bets', e)
    } finally {
      setBetsLoading(false)
    }
  }

  async function fetchGameEntries(playerId: string) {
    try {
      const parts = await getPlayerGameParticipation(playerId)
      if (parts.length === 0) { setGameEntries([]); return }
      // Fetch results for each unique game+day combo
      const daySet = Array.from(new Set(parts.map(p => p.day)))
      const resultsMap: Record<number, Awaited<ReturnType<typeof getHandicapGameResults>>> = {}
      await Promise.all(daySet.map(async day => {
        resultsMap[day] = await getHandicapGameResults(day)
      }))
      const entries = parts.map(part => {
        const res = resultsMap[part.day]
        if (!res) return null
        const playerResult = res.players.find(p => p.playerId === playerId)
        if (!playerResult) return null
        const eligiblePlayers = res.players.filter(p => p.eligible)
        let rank = 0
        if (playerResult.eligible) {
          rank = 1
          for (const ep of eligiblePlayers) {
            if (ep.playerId === playerId) break
            if (ep.surplus > playerResult.surplus) rank++
          }
        }
        return { participation: part, playerResult, rank, totalPlayers: res.players.length }
      }).filter(Boolean) as typeof gameEntries
      setGameEntries(entries)
    } catch (e) {
      console.error('Failed to fetch game entries', e)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-96">
          <div className="text-xl">Loading player...</div>
        </div>
      </div>
    )
  }

  if (notFound || !player) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl mb-4">Player not found</h1>
          <p className="text-gray-600 mb-6">The player &ldquo;{playerName}&rdquo; could not be found.</p>
          <Link href="/players" className="btn-primary">Back to Players</Link>
        </div>
      </div>
    )
  }

  const displayName = player.first_name && player.last_name 
    ? `${player.first_name} ${player.last_name}`
    : player.name

  const teamBgColor = player.team === 'Shaft' ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 text-sm">
          <Link href="/" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Home</Link>
          <span className="text-gray-400 mx-2">›</span>
          <Link href="/players" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Players</Link>
          <span className="text-gray-400 mx-2">›</span>
          <span className="text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>{playerName}</span>
        </div>

        <div className={`bg-white rounded-lg shadow-lg p-8 text-center border-2 ${teamBgColor}`}>
          <PlayerAvatar player={player} />
          
          <h1 className="text-3xl mb-2" style={{ fontFamily: 'Georgia, serif' }}>{displayName}</h1>

          {/* Identity pin — tap to remember "You are this player" on Bets page */}
          <button
            onClick={() => {
              if (isMe) {
                localStorage.removeItem('abtow_viewer_id')
                setIsMe(false)
              } else {
                localStorage.setItem('abtow_viewer_id', player.id)
                setIsMe(true)
              }
            }}
            className={`mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              isMe
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
            }`}
          >
            {isMe ? '✓ This is me' : '👤 This is me'}
          </button>

          {player.nickname && (
            <p className="text-lg text-gray-600 italic mb-4">&ldquo;{player.nickname}&rdquo;</p>
          )}
          
          <div className={`inline-block px-4 py-2 rounded-full text-white font-semibold mb-4 ${
            player.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'
          }`}>
            Team {player.team}
          </div>

          {player.venmo_handle && (
            <div className="mb-5">
              <button
                onClick={() => openVenmo(player.venmo_handle!, 'pay', 'ABTOW 2026')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#3D95CE] text-white font-semibold text-sm hover:bg-[#3182b8] transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 2c.8 1.3 1.2 2.7 1.2 4.5 0 5.6-4.8 12.9-8.7 18H4.8L2 2.6l6.3-.6 1.6 12.9C11.6 12 13.5 8 13.5 5.2c0-1.7-.3-2.9-.8-3.9L19.5 2z"/>
                </svg>
                @{player.venmo_handle}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {player.first_name && (
              <div className="text-center">
                <h3 className="font-semibold text-gray-700 mb-2">First Name</h3>
                <p className="text-xl">{player.first_name}</p>
              </div>
            )}
            {player.last_name && (
              <div className="text-center">
                <h3 className="font-semibold text-gray-700 mb-2">Last Name</h3>
                <p className="text-xl">{player.last_name}</p>
              </div>
            )}
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 mb-2">Raw Handicap</h3>
              <p className="text-2xl font-bold">{player.raw_handicap}</p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 mb-2">Playing Handicap (75%)</h3>
              <p className="text-2xl font-bold">{player.playing_handicap}</p>
            </div>
          </div>

          <div className="mt-8 flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => setShowStatsModal(true)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              View Statistics
            </button>
            <Link href="/" className="btn-secondary">View Leaderboard</Link>
            <Link href="/players" className="btn-secondary">All Players</Link>
          </div>
        </div>

        {/* Profile tabs */}
        <div className="flex rounded-xl overflow-hidden border border-gray-300 mt-6" style={{ fontFamily: 'Georgia, serif' }}>
          {(['overview', 'bets'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setProfileTab(tab)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors capitalize ${profileTab === tab ? 'bg-[#2a6b7c] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {tab === 'bets' ? `🎲 Bets${playerBets.length > 0 ? ` (${playerBets.length})` : ''}` : 'Overview'}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {profileTab === 'overview' && (
          <div className="mt-6 space-y-5">
            {/* Active games */}
            {gameEntries.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">🎮 Active Games</h3>
                <div className="space-y-2">
                  {gameEntries.map(entry => {
                    const { playerResult: pr, rank } = entry
                    const day = entry.participation.day
                    const dayLabel = day === 1 ? 'Ritz Carlton' : day === 2 ? 'Southern Dunes' : 'Champions Gate'
                    const surplusStr = pr.surplus >= 0 ? `+${pr.surplus}` : `${pr.surplus}`
                    return (
                      <a
                        key={`${entry.participation.game_id}-${day}`}
                        href={`/games/${entry.participation.game_id}?day=${day}`}
                        className="block bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold text-gray-900">🎯 Handicap Game</div>
                            <div className="text-xs text-gray-400 mt-0.5">Day {day} · {dayLabel}</div>
                          </div>
                          <div className="text-right">
                            {pr.holesPlayed === 0 ? (
                              <div className="text-xs text-gray-400">No scores yet</div>
                            ) : pr.eligible ? (
                              <>
                                <div className="text-base font-bold text-emerald-700">#{rank}</div>
                                <div className="text-xs text-emerald-600">{pr.totalPoints} pts · {surplusStr}</div>
                              </>
                            ) : (
                              <>
                                <div className="text-xs font-semibold text-red-400">Not eligible</div>
                                <div className="text-xs text-gray-400">{pr.totalPoints} / {pr.targetPoints} pts</div>
                              </>
                            )}
                          </div>
                        </div>
                        {pr.holesPlayed > 0 && pr.holesPlayed < 18 && (
                          <div className="mt-2 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#2a6b7c]/40 rounded-full" style={{ width: `${(pr.holesPlayed / 18) * 100}%` }} />
                          </div>
                        )}
                      </a>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-2 px-1 text-center">
                  Tap to view full leaderboard →
                </p>
              </div>
            )}
            <TeamMembersSection currentPlayer={player} />
          </div>
        )}

        {/* Bets tab */}
        {profileTab === 'bets' && (
          <div className="mt-6 space-y-3" style={{ fontFamily: 'Georgia, serif' }}>
            {betsLoading ? (
              <div className="text-center text-gray-400 py-8">Loading bets...</div>
            ) : playerBets.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                <div className="text-3xl mb-2">🎲</div>
                <p className="text-sm">No bets logged yet.</p>
                <p className="text-xs mt-1">Head to the <a href="/bets" className="text-[#2a6b7c] underline">Bets page</a> to add one.</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex justify-around text-center">
                    <div>
                      <div className="text-2xl font-bold text-[#2a6b7c]">{playerBets.filter(b => b.status === 'active').length}</div>
                      <div className="text-xs text-gray-500">Active</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-600">{playerBets.filter(b => b.status === 'side1_won' || b.status === 'side2_won').filter(b => {
                        const isS1 = b.side1_player_id === player.id
                        return (isS1 && b.status === 'side1_won') || (!isS1 && b.status === 'side2_won')
                      }).length}</div>
                      <div className="text-xs text-gray-500">Won</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-500">{playerBets.filter(b => b.status === 'side1_won' || b.status === 'side2_won').filter(b => {
                        const isS1 = b.side1_player_id === player.id
                        return (isS1 && b.status === 'side2_won') || (!isS1 && b.status === 'side1_won')
                      }).length}</div>
                      <div className="text-xs text-gray-500">Lost</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-700">
                        ${playerBets.filter(b => b.status === 'active').reduce((sum, b) => {
                          return sum + Number(b.side1_player_id === player.id ? b.side1_amount : b.side2_amount)
                        }, 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">At Stake</div>
                    </div>
                  </div>
                </div>

                {/* Bets needing acceptance — only shown to the player themselves */}
                {isMe && playerBets.filter(b => {
                  if (b.status !== 'pending') return false
                  const acceptorId = b.proposer_side === 'side1' ? b.side2_player_id : b.side1_player_id
                  return acceptorId === player.id
                }).length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3">
                    <div className="text-sm font-bold text-yellow-800 mb-1">⏳ Bets awaiting your acceptance</div>
                    <div className="text-xs text-yellow-600">Check the box on each bet to accept.</div>
                  </div>
                )}

                {/* Settled result alerts */}
                {playerBets.filter(b => ['side1_won','side2_won','push'].includes(b.status)).map(b => {
                  const vIs1 = player.id === b.side1_player_id
                  const vWon  = (vIs1 && b.status === 'side1_won') || (!vIs1 && b.status === 'side2_won')
                  const vLost = (vIs1 && b.status === 'side2_won') || (!vIs1 && b.status === 'side1_won')
                  const winP  = b.status === 'side1_won' ? b.side1_player : b.side2_player
                  const losP  = b.status === 'side1_won' ? b.side2_player : b.side1_player
                  const winN  = playerDisplayName(winP)
                  const losN  = playerDisplayName(losP)
                  const amt   = b.status === 'side1_won' ? b.side2_amount : b.side1_amount
                  const label = betTypeLabel(b.bet_type)

                  if (b.status === 'push') return (
                    <div key={b.id} className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-3">
                      <span className="text-xl">🤝</span>
                      <div><div className="text-sm font-bold text-amber-800">Push — {label}</div>
                      <div className="text-xs text-amber-600">No money changes hands</div></div>
                    </div>
                  )
                  if (vWon) return (
                    <div key={b.id} className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-3 flex items-center gap-3">
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
                  )
                  if (vLost) return (
                    <div key={b.id} className="rounded-xl overflow-hidden border-2 border-red-300">
                      <img src="/tywin.jpg" alt="" className="w-full h-24 object-cover" style={{objectPosition:'center 15%'}} />
                      <div className="bg-red-50 p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-red-900">📜 You lost — {label}</div>
                          <div className="text-xs text-red-700">You owe {winN} <strong>${Number(amt).toLocaleString()}</strong></div>
                          <div className="text-xs text-red-500 italic">&ldquo;A Lannister always pays their debts.&rdquo;</div>
                        </div>
                        {winP.venmo_handle && (
                          <button
                            onClick={() => openVenmo(winP.venmo_handle!, 'pay', 'ABTOW 2026 Bet')}
                            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#008CFF] text-white text-xs font-bold rounded-full">
                            <svg width="10" height="10" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  )
                  return null
                })}

                {/* Bet list */}
                {playerBets.map(bet => {
                  const isS1 = bet.side1_player_id === player.id
                  const myMl = isS1 ? bet.side1_ml : bet.side2_ml
                  const myAmount = isS1 ? bet.side1_amount : bet.side2_amount
                  const opponent = isS1 ? bet.side2_player : bet.side1_player
                  const oppName = playerDisplayName(opponent)
                  const s1Name = playerDisplayName(bet.side1_player)
                  const s2Name = playerDisplayName(bet.side2_player)
                  const myLine = formatMoneyline(myMl)
                  const mlColorClass = myMl < -110 ? 'text-emerald-600' : myMl > 110 ? 'text-amber-500' : 'text-gray-600'
                  const isPending = bet.status === 'pending'
                  const acceptorId = bet.proposer_side === 'side1' ? bet.side2_player_id : bet.side1_player_id
                  const iNeedToAccept = isPending && acceptorId === player.id
                  const iProposed = isPending && acceptorId !== player.id

                  return (
                    <div key={bet.id} className={`bg-white rounded-xl shadow-sm border transition-colors ${iNeedToAccept ? 'border-yellow-300' : 'border-gray-100'}`}>
                      <button
                        onClick={() => setViewBet(bet)}
                        className="w-full text-left p-4"
                      >
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            {bet.match && (() => {
                              const [t1, t2] = matchTeamsParts(bet.match, allPlayers)
                              const myTeam  = isS1 ? t1 : t2
                              const oppTeam = isS1 ? t2 : t1
                              return (
                                <div className="text-xs text-gray-400 mb-0.5">
                                  Day {bet.match.day} · <span className="font-semibold text-gray-600">✓ {myTeam}</span> vs {oppTeam}
                                </div>
                              )
                            })()}
                            <div className="text-sm font-semibold text-gray-800">{betTypeLabel(bet.bet_type)} vs {oppName.split(' ')[0]}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Your line: <span className={`font-bold ${mlColorClass}`}>{myLine}</span>
                              {bet.tease_adjustment !== 0 && <span className="ml-1 text-gray-300">(teased {bet.tease_adjustment > 0 ? `+${bet.tease_adjustment}` : bet.tease_adjustment})</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <div className="text-base font-bold text-gray-900">${Number(myAmount).toLocaleString()}</div>
                            <div className="mt-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                isPending ? 'bg-yellow-100 text-yellow-700' :
                                bet.status === 'active' ? 'bg-blue-100 text-blue-700' :
                                (bet.status === 'side1_won' && isS1) || (bet.status === 'side2_won' && !isS1) ? 'bg-emerald-100 text-emerald-700' :
                                bet.status === 'push' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {iProposed ? 'Awaiting acceptance' :
                                 iNeedToAccept ? (isMe ? 'Needs your OK' : 'Pending acceptance') :
                                 bet.status === 'active' ? 'Active' :
                                 (bet.status === 'side1_won' && isS1) || (bet.status === 'side2_won' && !isS1) ? '✓ Won' :
                                 bet.status === 'push' ? 'Push' : '✗ Lost'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Inline acceptance — only rendered for the player themselves */}
                      {iNeedToAccept && isMe && (
                        <div className="border-t border-yellow-200 bg-yellow-50 px-4 py-3 rounded-b-xl">
                          <AcceptBetInline bet={bet} s1Name={s1Name} s2Name={s2Name} onAccepted={(betId) => {
                            setPlayerBets(prev => prev.map(b => b.id === betId ? { ...b, status: 'active' } : b))
                          }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bet Detail Modal */}
      {viewBet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setViewBet(null)}>
          <div className="bg-[#f5f0e8] rounded-2xl w-full max-w-md shadow-2xl p-5" style={{ fontFamily: 'Georgia, serif' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#2a6b7c]">Bet Details</h2>
                {viewBet.match && (() => {
                  const vIs1 = player.id === viewBet.side1_player_id
                  const [t1, t2] = matchTeamsParts(viewBet.match, allPlayers)
                  const myT  = vIs1 ? t1 : t2
                  const oppT = vIs1 ? t2 : t1
                  return (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Day {viewBet.match.day} · <span className="font-semibold text-gray-600">✓ {myT}</span> vs {oppT}
                    </p>
                  )
                })()}
              </div>
              <button onClick={() => setViewBet(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* Settlement result card */}
            {['side1_won','side2_won','push'].includes(viewBet.status) && (() => {
              const s1n = playerDisplayName(viewBet.side1_player)
              const s2n = playerDisplayName(viewBet.side2_player)
              const vIs1 = player.id === viewBet.side1_player_id
              const vIs2 = player.id === viewBet.side2_player_id
              const vWon  = (vIs1 && viewBet.status === 'side1_won') || (vIs2 && viewBet.status === 'side2_won')
              const vLost = (vIs1 && viewBet.status === 'side2_won') || (vIs2 && viewBet.status === 'side1_won')
              const winP  = viewBet.status === 'side1_won' ? viewBet.side1_player : viewBet.side2_player
              const losP  = viewBet.status === 'side1_won' ? viewBet.side2_player : viewBet.side1_player
              const winN  = viewBet.status === 'side1_won' ? s1n : s2n
              const losN  = viewBet.status === 'side1_won' ? s2n : s1n
              const amt   = viewBet.status === 'side1_won' ? viewBet.side2_amount : viewBet.side1_amount
              if (viewBet.status === 'push') return (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl mb-1">🤝</p>
                  <p className="font-bold text-amber-800">Push — all square. No money changes hands.</p>
                </div>
              )
              if (vWon) return (
                <div className="mb-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 text-center">
                  <p className="text-3xl mb-1">🏆</p>
                  <p className="font-bold text-emerald-800 text-lg">You won!</p>
                  <p className="text-sm text-emerald-700 mt-1"><strong>${Number(amt).toLocaleString()}</strong> from {losN}. Your read was right.</p>
                  {losP.venmo_handle && (
                    <button
                      onClick={() => openVenmo(losP.venmo_handle!, 'charge', 'ABTOW 2026 Bet')}
                      className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#008CFF] text-white text-sm font-bold rounded-full">
                      <svg width="14" height="14" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                      Request from {losN}
                    </button>
                  )}
                </div>
              )
              if (vLost) return (
                <div className="mb-4 rounded-2xl overflow-hidden border-2 border-red-300">
                  <img src="/tywin.jpg" alt="Tywin Lannister" className="w-full object-cover max-h-48" style={{objectPosition:'center 20%'}} />
                  <div className="bg-red-50 p-4 text-center">
                    <p className="font-bold text-red-900 text-base mb-1">📜 A debt is owed.</p>
                    <p className="text-sm text-red-800">You owe <strong>{winN}</strong> <strong>${Number(amt).toLocaleString()}</strong>.</p>
                    <p className="text-sm text-red-700 mt-1 italic">&ldquo;A Lannister always pays their debts.&rdquo;<br/>Be an honorable man — don&apos;t make them ask twice.</p>
                    {winP.venmo_handle && (
                      <button
                        onClick={() => openVenmo(winP.venmo_handle!, 'pay', 'ABTOW 2026 Bet')}
                        className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#008CFF] text-white text-sm font-bold rounded-full">
                        <svg width="14" height="14" viewBox="0 0 32 32" fill="white"><path d="M26.3 2c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.4H6.8L3 4.2l8.8-.8 2 16.2c1.8-3 4-7.8 4-11 0-1.8-.3-3-.8-4L26.3 2z"/></svg>
                        Pay {winN}
                      </button>
                    )}
                  </div>
                </div>
              )
              return null
            })()}

            <div className="bg-white rounded-xl p-4 space-y-3 text-sm">
              {(() => {
                const s1 = playerDisplayName(viewBet.side1_player)
                const s2 = playerDisplayName(viewBet.side2_player)
                const terms = betTermsInfo(viewBet.bet_type, viewBet.tease_adjustment, s1, s2)
                return (
                  <div className="bg-[#2a6b7c]/5 border border-[#2a6b7c]/20 rounded-xl p-3 space-y-1.5 text-xs">
                    <p className="font-bold text-[#2a6b7c] text-sm">📋 Bet Terms</p>
                    <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Segment</span><span className="text-gray-700 font-medium">{terms.segment}</span></div>
                    <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Strokes</span><span className="text-gray-700 font-medium">{terms.stroke}</span></div>
                    <div className="flex gap-1.5"><span className="text-gray-400 w-16 shrink-0">Winner</span><span className="text-gray-700 font-bold">{terms.winner}</span></div>
                  </div>
                )
              })()}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{playerDisplayName(viewBet.side1_player)}</div>
                    <div className="text-gray-400 text-xs">Side 1 · {formatMoneyline(viewBet.side1_ml)}</div>
                  </div>
                  <div className="text-lg font-bold">${Number(viewBet.side1_amount).toLocaleString()}</div>
                </div>
              </div>
              <div className="text-center text-gray-300 text-xs">vs</div>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{playerDisplayName(viewBet.side2_player)}</div>
                  <div className="text-gray-400 text-xs">Side 2 · {formatMoneyline(viewBet.side2_ml)}</div>
                </div>
                <div className="text-lg font-bold">${Number(viewBet.side2_amount).toLocaleString()}</div>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                <span className="text-gray-500">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  viewBet.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  viewBet.status === 'active' ? 'bg-blue-100 text-blue-700' :
                  viewBet.status === 'side1_won' || viewBet.status === 'side2_won' ? 'bg-emerald-100 text-emerald-700' :
                  viewBet.status === 'push' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-500'
                }`}>
                  {betStatusLabel(viewBet.status, playerDisplayName(viewBet.side1_player), playerDisplayName(viewBet.side2_player))}
                </span>
              </div>
            </div>
            {/* Venmo links */}
            {(viewBet.side1_player.venmo_handle || viewBet.side2_player.venmo_handle) && (
              <div className="mt-3 flex gap-2">
                {[viewBet.side1_player, viewBet.side2_player].map(p => p.venmo_handle ? (
                  <button
                    key={p.id}
                    onClick={() => openVenmo(p.venmo_handle!, 'pay', 'ABTOW 2026 Bet')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#3D95CE] text-white text-xs font-bold hover:bg-[#3182b8] transition-colors"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 2c.8 1.3 1.2 2.7 1.2 4.5 0 5.6-4.8 12.9-8.7 18H4.8L2 2.6l6.3-.6 1.6 12.9C11.6 12 13.5 8 13.5 5.2c0-1.7-.3-2.9-.8-3.9L19.5 2z"/></svg>
                    Pay {playerDisplayName(p).split(' ')[0]}
                  </button>
                ) : null)}
              </div>
            )}
            <button onClick={() => setViewBet(null)} className="mt-3 w-full py-2.5 bg-[#2a6b7c] text-white rounded-xl font-semibold text-sm">Close</button>
          </div>
        </div>
      )}

      {/* Player Stats Modal */}
      {player && (
        <PlayerStatsModal
          playerId={player.id}
          playerName={displayName}
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
        />
      )}
    </div>
  )
}

function TeamMembersSection({ currentPlayer }: { currentPlayer: Player }) {
  const [teammates, setTeammates] = useState<Player[]>([])

  useEffect(() => {
    fetchTeammates()
  }, [currentPlayer.team])

  async function fetchTeammates() {
    try {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('team', currentPlayer.team)
        .neq('id', currentPlayer.id)
        .order('name')
      if (data) setTeammates(data)
    } catch (error) {
      console.error('Failed to fetch teammates:', error)
    }
  }

  if (teammates.length === 0) return null

  const teamColor = currentPlayer.team === 'Shaft' ? 'text-team-shafts border-team-shafts' : 'text-team-balls border-team-balls'

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 border-t-4 ${teamColor}`}>
      <h2 className={`text-xl font-bold mb-4 ${teamColor}`}>Team {currentPlayer.team} Members</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {teammates.map(tm => (
          <Link
            key={tm.id}
            href={`/players/${encodeURIComponent(tm.name)}`}
            className="text-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {tm.avatar_url ? (
              <div className="w-[72px] h-[72px] min-h-[72px] rounded-full overflow-hidden mx-auto mb-2"><img src={tm.avatar_url} alt={tm.name} className="w-full h-full object-cover" style={{ objectPosition: tm.avatar_position || 'center 30%' }} /></div>
            ) : (
              <div className={`w-[72px] h-[72px] min-h-[72px] rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-bold text-white ${
                currentPlayer.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'
              }`}>
                {tm.first_name && tm.last_name 
                  ? `${tm.first_name.charAt(0)}${tm.last_name.charAt(0)}`
                  : tm.name.charAt(0)}
              </div>
            )}
            <p className="text-sm font-medium">
              {tm.first_name && tm.last_name ? `${tm.first_name} ${tm.last_name}` : tm.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
