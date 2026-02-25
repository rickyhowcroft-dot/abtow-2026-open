'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Layout from '@/app/components/Layout'
import PlayerStatsModal from '@/app/components/PlayerStatsModal'
import StatsService, { type PlayerStatsOverview } from '@/lib/stats-service'
import { TrendingDown, Award } from 'lucide-react'

export default function StatisticsPage() {
  const [allStats, setAllStats] = useState<PlayerStatsOverview[]>([])
  const [dreamRound, setDreamRound] = useState<{ gross: number; net: number; topGrossContributor: string; topNetContributor: string; holeBreakdown: Array<{ hole: number; gross: number; grossPlayer: string; net: number; netPlayer: string }>; playerDreamRounds: Array<{ playerId: string; playerName: string; dreamGross: number; dreamNet: number }> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<{id: string, name: string, dreamRound?: {gross: number, net: number}} | null>(null)
  const [sortBy, setSortBy] = useState<'scoringAverage' | 'netAverage' | 'handicapPerformance' | 'mostBogeys' | 'mostBirdies'>('scoringAverage')
  const [teamFilter, setTeamFilter] = useState<'all' | 'Shaft' | 'Balls'>('all')
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null)

  const InfoBtn = ({ title, description }: { title: string; description: string }) => (
    <button
      onClick={(e) => { e.stopPropagation(); setInfoModal({ title, description }) }}
      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 text-xs font-bold transition-colors flex items-center justify-center leading-none"
      title="What is this?"
    >
      i
    </button>
  )

  useEffect(() => {
    loadAllStats()
  }, [])

  const loadAllStats = async () => {
    try {
      const [stats, dream] = await Promise.all([
        StatsService.getAllPlayersStats(),
        StatsService.getDreamRound()
      ])
      setAllStats(stats)
      setDreamRound(dream)
    } catch (error) {
      console.error('Error loading statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredStats = allStats
    .filter(player => teamFilter === 'all' || player.team === teamFilter)
    .sort((a, b) => {
      switch (sortBy) {
        case 'scoringAverage':
          return a.scoringAverage - b.scoringAverage // Lower is better
        case 'netAverage':
          return a.netScoringAverage - b.netScoringAverage // Lower is better
        case 'handicapPerformance':
          return a.handicapPerformance - b.handicapPerformance // Lower is better (negative = under handicap)
        case 'mostBogeys':
          return b.bogeys - a.bogeys // Higher is worse (sort descending)
        case 'mostBirdies':
          return b.birdies - a.birdies // Higher is better (sort descending)
        default:
          return 0
      }
    })

  // Returns up to 3 tied leaders for a category
  function topTied<T>(arr: T[], bestVal: (a: T) => number, isHigher: boolean): T[] {
    if (arr.length === 0) return []
    const best = arr.reduce((p, c) => isHigher ? (bestVal(c) > bestVal(p) ? c : p) : (bestVal(c) < bestVal(p) ? c : p))
    const bestScore = bestVal(best)
    return arr.filter(p => bestVal(p) === bestScore).slice(0, 3)
  }

  const playedStats = allStats.filter(p => p.total_rounds_played > 0)
  const leaders = {
    lowestAverage:  topTied(allStats,    p => p.scoringAverage,    false),
    mostBirdies:    topTied(allStats,    p => p.birdies,           true),
    mostPars:       topTied(allStats,    p => p.pars,              true),
    bestHandicap:   topTied(allStats,    p => p.handicapPerformance, false),
    mostConsistent: topTied(allStats,    p => p.pars / (p.total_holes_played || 1), true),
    bestNetScore:   topTied(playedStats, p => p.netScoringAverage,  false),
    mostBogeys:     topTied(allStats,    p => p.bogeys,             true),
    worstNetScore:  topTied(playedStats, p => p.netScoringAverage,  true),
  }

  const openPlayerStats = (playerId: string, playerName: string) => {
    const playerDream = dreamRound?.playerDreamRounds.find(p => p.playerId === playerId)
    setSelectedPlayer({ id: playerId, name: playerName, dreamRound: playerDream ? { gross: playerDream.dreamGross, net: playerDream.dreamNet } : undefined })
  }

  const formatPercentage = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%'
    return `${((numerator / denominator) * 100).toFixed(1)}%`
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl">Loading tournament statistics...</div>
        </div>
      </Layout>
    )
  }

  // Reusable leader card icon wrapper — fixed width so single/double emojis align the same
  const Icon = ({ children }: { children: React.ReactNode }) => (
    <div className="w-10 shrink-0 flex items-center justify-center text-xl leading-none mr-3 gap-0.5">{children}</div>
  )

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-gray-900 mb-1">Tournament Statistics</h1>
            <p className="text-lg text-gray-600">ABTOW 2026 Open Performance Analysis</p>
          </div>

          {/* Tournament Leaders */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3 flex items-center">
              <Award className="mr-2 text-yellow-500" size={20} />
              Tournament Leaders
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leaders.lowestAverage.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                  <InfoBtn title="Lowest Scoring Average" description="Average gross strokes per round across all days played. The classic stroke play leader — pure ball-striking with no handicap adjustments. Lower is better." />
                  <div className="flex items-center">
                    <Icon><TrendingDown className="text-green-500" size={20} /></Icon>
                    <div>
                      <p className="text-sm text-gray-500">Lowest Scoring Average</p>
                      {leaders.lowestAverage.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-green-600 font-medium text-sm">{leaders.lowestAverage[0].scoringAverage.toFixed(1)}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.mostBirdies.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                  <InfoBtn title="Most Birdies" description="Total holes completed in 1 stroke under par (gross) across all rounds played. The most aggressive scorer in the field — someone who hunts pins and makes things happen." />
                  <div className="flex items-center">
                    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border-2 border-blue-500 mr-3">
                      <img src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/most-birdies-tiger.jpg" alt="Tiger" className="w-full h-full object-cover object-top" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Most Birdies</p>
                      {leaders.mostBirdies.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-blue-600 font-medium text-sm">{leaders.mostBirdies[0].birdies}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.mostPars.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-gray-400">
                  <InfoBtn title="Most Pars" description="Total holes completed at exactly par (gross) across all rounds. The steady, reliable player — no blow-ups, no miracles. Just consistent, dependable golf." />
                  <div className="flex items-center">
                    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border-2 border-gray-400 mr-3">
                      <img src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/most-pars-scottie.jpg" alt="Scottie" className="w-full h-full object-cover object-top" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Most Pars</p>
                      {leaders.mostPars.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-gray-600 font-medium text-sm">{leaders.mostPars[0].pars}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.mostBogeys.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-red-400">
                  <InfoBtn title="Most Bogeys" description="Total holes completed in 1 stroke over par (gross) across all rounds. One too many trips to the rough, the bunker, or the water. The bogey train has a conductor." />
                  <div className="flex items-center">
                    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border-2 border-red-400 mr-3">
                      <img src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/most-pars-rory.jpg" alt="Rory" className="w-full h-full object-cover object-top" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Most Bogeys</p>
                      {leaders.mostBogeys.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-red-400 font-medium text-sm">{leaders.mostBogeys[0].bogeys}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.bestHandicap.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                  <InfoBtn title="Best vs Handicap" description="Average strokes above or below playing handicap per round. A negative number means you're beating your handicap. The truest measure of who is outperforming expectations — not just who hits it far." />
                  <div className="flex items-center">
                    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border-2 border-purple-500 mr-3">
                      <img src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/best-handicap-guy.jpg?v=2" alt="Best vs HCP" className="w-full h-full object-cover object-top" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Best vs Handicap</p>
                      {leaders.bestHandicap.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-purple-600 font-medium text-sm">
                        {leaders.bestHandicap[0].handicapPerformance > 0 ? '+' : ''}
                        {leaders.bestHandicap[0].handicapPerformance.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.mostConsistent.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
                  <InfoBtn title="Most Consistent" description="Highest percentage of holes completed at par or better (gross) across all rounds played. This player avoids blow-up holes better than anyone — the fewest disasters in the field." />
                  <div className="flex items-center">
                    <Icon>🏌</Icon>
                    <div>
                      <p className="text-sm text-gray-500">Most Consistent</p>
                      {leaders.mostConsistent.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-orange-600 font-medium text-sm">
                        {formatPercentage(leaders.mostConsistent[0].pars, leaders.mostConsistent[0].total_holes_played)} pars
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.bestNetScore.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-teal-500">
                  <InfoBtn title="Best Net Score" description="Lowest average net score per round — your gross score minus the handicap strokes you receive on each hole. This is the handicap-adjusted leader, leveling the playing field between high and low handicappers." />
                  <div className="flex items-center">
                    <Icon>💰</Icon>
                    <div>
                      <p className="text-sm text-gray-500">Best Net Score</p>
                      {leaders.bestNetScore.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-teal-600 font-medium text-sm">
                        {leaders.bestNetScore[0].netScoringAverage.toFixed(1)} avg
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.worstNetScore.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-red-600">
                  <InfoBtn title="Worst Net Score" description="Highest average net score per round. Even with handicap strokes applied, this player is still bleeding shots. The handicap isn't enough to save them." />
                  <div className="flex items-center">
                    <Icon>🫃🏻</Icon>
                    <div>
                      <p className="text-sm text-gray-500">Worst Net Score</p>
                      {leaders.worstNetScore.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-red-600 font-medium text-sm">
                        {leaders.worstNetScore[0].netScoringAverage.toFixed(1)} avg
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {dreamRound && dreamRound.playerDreamRounds.length > 0 && (
                <div className="relative bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
                  <InfoBtn title="Best Dream Round" description="Your personal Dream Round: take your single best gross score on each individual hole across all three tournament days, then add them up. That's your theoretical perfect 18 from this week. The lowest such score in the field wins this one." />
                  <div className="flex items-center">
                    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border-2 border-yellow-500 mr-3">
                      <img src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/dream-round-tiger.jpg?v=3" alt="Tiger" className="w-full h-full object-cover object-top" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Best Dream Round</p>
                      <p className="font-bold text-base leading-tight">{dreamRound.playerDreamRounds[0].playerName}</p>
                      <p className="text-yellow-600 font-medium text-sm">
                        Gross {dreamRound.playerDreamRounds[0].dreamGross} · Net {dreamRound.playerDreamRounds[0].dreamNet}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Filters and Controls */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="scoringAverage">Gross Score Avg</option>
                  <option value="netAverage">Net Score Avg</option>
                  <option value="handicapPerformance">vs Handicap</option>
                  <option value="mostBirdies">Most Birdies</option>
                  <option value="mostBogeys">Most Bogeys</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select 
                  value={teamFilter} 
                  onChange={(e) => setTeamFilter(e.target.value as any)}
                  className="border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="all">All Teams</option>
                  <option value="Shaft">Team Shaft</option>
                  <option value="Balls">Team Balls</option>
                </select>
              </div>
            </div>
          </div>

          {/* Player Statistics Table */}
          {(() => {
            type Col = { key: string; label: string; sortKey?: string; renderCell: (p: PlayerStatsOverview, hidden: boolean) => React.ReactNode }

            const allCols: Col[] = [
              {
                key: 'rounds',
                label: 'Rounds',
                renderCell: (p, hidden) => <td key="rounds" className={`px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900 ${hidden ? 'hidden md:table-cell' : ''}`}>{p.total_rounds_played}</td>
              },
              {
                key: 'scoringAverage',
                label: 'Scoring Avg',
                sortKey: 'scoringAverage',
                renderCell: (p, hidden) => <td key="scoringAverage" className={`px-4 py-4 whitespace-nowrap text-center ${hidden ? 'hidden md:table-cell' : ''}`}><span className="text-lg font-bold text-gray-900">{p.scoringAverage > 0 ? p.scoringAverage.toFixed(1) : '—'}</span></td>
              },
              {
                key: 'netAverage',
                label: 'Net Avg',
                sortKey: 'netAverage',
                renderCell: (p, hidden) => <td key="netAverage" className={`px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900 ${hidden ? 'hidden md:table-cell' : ''}`}>{p.netScoringAverage > 0 ? p.netScoringAverage.toFixed(1) : '—'}</td>
              },
              {
                key: 'handicapPerformance',
                label: 'vs Handicap',
                sortKey: 'handicapPerformance',
                renderCell: (p, hidden) => (
                  <td key="handicapPerformance" className={`px-4 py-4 whitespace-nowrap text-center ${hidden ? 'hidden md:table-cell' : ''}`}>
                    <span className={`text-sm font-medium ${p.handicapPerformance < 0 ? 'text-green-600' : p.handicapPerformance > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {p.total_rounds_played > 0 ? `${p.handicapPerformance > 0 ? '+' : ''}${p.handicapPerformance.toFixed(1)}` : '—'}
                    </span>
                  </td>
                )
              },
              {
                key: 'eagles',
                label: 'Eagles',
                renderCell: (p, hidden) => <td key="eagles" className={`px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900 ${hidden ? 'hidden md:table-cell' : ''}`}>{p.eagles}</td>
              },
              {
                key: 'mostBirdies',
                label: 'Birdies',
                sortKey: 'mostBirdies',
                renderCell: (p, hidden) => <td key="mostBirdies" className={`px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900 ${hidden ? 'hidden md:table-cell' : ''}`}>{p.birdies}</td>
              },
              {
                key: 'mostBogeys',
                label: 'Bogeys',
                sortKey: 'mostBogeys',
                renderCell: (p, hidden) => <td key="mostBogeys" className={`px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900 ${hidden ? 'hidden md:table-cell' : ''}`}>{p.bogeys}</td>
              },
              {
                key: 'pars',
                label: 'Pars',
                renderCell: (p, hidden) => <td key="pars" className={`px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900 ${hidden ? 'hidden md:table-cell' : ''}`}>{p.pars} ({formatPercentage(p.pars, p.total_holes_played)})</td>
              },
            ]

            // Promote the active sort column to position 0 of the data cols
            const activeIdx = allCols.findIndex(c => c.sortKey === sortBy)
            let orderedCols = [...allCols]
            if (activeIdx > 0) {
              const [promoted] = orderedCols.splice(activeIdx, 1)
              orderedCols.unshift(promoted)
            }

            return (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                        {orderedCols.map((col, i) => (
                          <th
                            key={col.key}
                            className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                              col.sortKey === sortBy ? 'text-green-700 bg-green-50' : 'text-gray-500'
                            } ${i > 0 ? 'hidden md:table-cell' : ''}`}
                          >
                            {col.label}
                            {col.sortKey === sortBy && <span className="ml-1">↑</span>}
                          </th>
                        ))}
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredStats.map((player, index) => (
                        <tr key={player.player_id || index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-3 ${player.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'}`}></div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{index + 1}. {player.playerName}</div>
                                <div className="text-sm text-gray-500">Team {player.team}</div>
                              </div>
                            </div>
                          </td>
                          {orderedCols.map((col, i) => col.renderCell(player, i > 0))}
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                            <button
                              onClick={() => openPlayerStats(player.player_id, player.playerName)}
                              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition-colors"
                            >
                              View Details
                            </button>
                            <Link
                              href={`/players/${encodeURIComponent(player.playerName)}`}
                              className="ml-2 bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors inline-block"
                            >
                              Profile
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {filteredStats.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No statistics available yet. Complete some rounds to see data!</p>
            </div>
          )}
        </div>
      </div>

      {/* Player Stats Modal */}
      {selectedPlayer && (
        <PlayerStatsModal
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          dreamRound={selectedPlayer.dreamRound}
          isOpen={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Category Info Modal */}
      {infoModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setInfoModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 pr-4">{infoModal.title}</h3>
              <button
                onClick={() => setInfoModal(null)}
                className="shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-600 leading-relaxed text-sm">{infoModal.description}</p>
          </div>
        </div>
      )}
    </Layout>
  )
}
