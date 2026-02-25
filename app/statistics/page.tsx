'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Layout from '@/app/components/Layout'
import PlayerStatsModal from '@/app/components/PlayerStatsModal'
import StatsService, { type PlayerStatsOverview } from '@/lib/stats-service'
import { TrendingDown, Award } from 'lucide-react'

export default function StatisticsPage() {
  const [allStats, setAllStats] = useState<PlayerStatsOverview[]>([])
  const [dreamRound, setDreamRound] = useState<{ gross: number; net: number; holeBreakdown: Array<{ hole: number; gross: number; net: number }> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<{id: string, name: string} | null>(null)
  const [sortBy, setSortBy] = useState<'scoringAverage' | 'netAverage' | 'handicapPerformance' | 'mostBogeys' | 'mostBirdies'>('scoringAverage')
  const [teamFilter, setTeamFilter] = useState<'all' | 'Shaft' | 'Balls'>('all')

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
    bestHandicap:   topTied(allStats,    p => p.handicapPerformance, false),
    mostConsistent: topTied(allStats,    p => p.pars / (p.total_holes_played || 1), true),
    bestNetScore:   topTied(playedStats, p => p.netScoringAverage,  false),
    mostBogeys:     topTied(allStats,    p => p.bogeys,             true),
    worstNetScore:  topTied(playedStats, p => p.netScoringAverage,  true),
  }

  const openPlayerStats = (playerId: string, playerName: string) => {
    setSelectedPlayer({ id: playerId, name: playerName })
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
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
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
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                  <div className="flex items-center">
                    <Icon>🐥</Icon>
                    <div>
                      <p className="text-sm text-gray-500">Most Birdies</p>
                      {leaders.mostBirdies.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-blue-600 font-medium text-sm">{leaders.mostBirdies[0].birdies}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.bestHandicap.length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                  <div className="flex items-center">
                    <Icon><span>⌛️</span><span>🛍️</span></Icon>
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
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
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
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-teal-500">
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
              {leaders.mostBogeys.length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-400">
                  <div className="flex items-center">
                    <Icon><span>⛳️</span><span>😩</span></Icon>
                    <div>
                      <p className="text-sm text-gray-500">Most Bogeys</p>
                      {leaders.mostBogeys.map(p => <p key={p.player_id} className="font-bold text-base leading-tight">{p.playerName}</p>)}
                      <p className="text-red-400 font-medium text-sm">{leaders.mostBogeys[0].bogeys}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.worstNetScore.length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-600">
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
              {dreamRound && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-400 md:col-span-2 lg:col-span-3">
                  <div className="flex items-start">
                    <Icon>🌟</Icon>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 mb-2">Dream Round — Best score per hole across all days</p>
                      <div className="flex gap-8 mb-3">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Gross</p>
                          <p className="text-2xl font-bold text-yellow-600">{dreamRound.gross}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Net</p>
                          <p className="text-2xl font-bold text-yellow-600">{dreamRound.net}</p>
                        </div>
                      </div>
                      {/* Hole-by-hole breakdown */}
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-gray-400">
                              <td className="pr-2 py-0.5 font-medium">Hole</td>
                              {dreamRound.holeBreakdown.map(h => (
                                <td key={h.hole} className="text-center px-1 py-0.5 w-7">{h.hole}</td>
                              ))}
                              <td className="text-center px-1 py-0.5 font-medium">Total</td>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="pr-2 py-0.5 font-medium text-gray-500">Gross</td>
                              {dreamRound.holeBreakdown.map(h => (
                                <td key={h.hole} className="text-center px-1 py-0.5 font-semibold text-gray-700">{h.gross}</td>
                              ))}
                              <td className="text-center px-1 py-0.5 font-bold text-yellow-600">{dreamRound.gross}</td>
                            </tr>
                            <tr>
                              <td className="pr-2 py-0.5 font-medium text-gray-500">Net</td>
                              {dreamRound.holeBreakdown.map(h => (
                                <td key={h.hole} className="text-center px-1 py-0.5 font-semibold text-teal-600">{h.net}</td>
                              ))}
                              <td className="text-center px-1 py-0.5 font-bold text-teal-600">{dreamRound.net}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
          isOpen={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </Layout>
  )
}
