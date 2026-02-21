'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Layout from '@/app/components/Layout'
import PlayerStatsModal from '@/app/components/PlayerStatsModal'
import StatsService, { type PlayerStatsOverview } from '@/lib/stats-service'
import { TrendingUp, Award, Target, BarChart3 } from 'lucide-react'

export default function StatisticsPage() {
  const [allStats, setAllStats] = useState<PlayerStatsOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<{id: string, name: string} | null>(null)
  const [sortBy, setSortBy] = useState<'scoringAverage' | 'totalScore' | 'handicapPerformance'>('scoringAverage')
  const [teamFilter, setTeamFilter] = useState<'all' | 'Shaft' | 'Balls'>('all')

  useEffect(() => {
    loadAllStats()
  }, [])

  const loadAllStats = async () => {
    try {
      const stats = await StatsService.getAllPlayersStats()
      setAllStats(stats)
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
        case 'totalScore':
          return a.total_gross_strokes - b.total_gross_strokes // Lower is better
        case 'handicapPerformance':
          return a.handicapPerformance - b.handicapPerformance // Lower is better (negative = under handicap)
        default:
          return 0
      }
    })

  // Calculate tournament leaders
  const leaders = {
    lowestAverage: allStats.length > 0 ? allStats.reduce((prev, current) => 
      prev.scoringAverage < current.scoringAverage ? prev : current) : null,
    mostBirdies: allStats.length > 0 ? allStats.reduce((prev, current) => 
      prev.birdies > current.birdies ? prev : current) : null,
    bestHandicap: allStats.length > 0 ? allStats.reduce((prev, current) => 
      prev.handicapPerformance < current.handicapPerformance ? prev : current) : null,
    mostConsistent: allStats.length > 0 ? allStats.reduce((prev, current) => {
      const prevConsistency = prev.pars / (prev.total_holes_played || 1)
      const currentConsistency = current.pars / (current.total_holes_played || 1)
      return prevConsistency > currentConsistency ? prev : current
    }) : null
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

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Tournament Statistics</h1>
            <p className="text-xl text-gray-600">ABTOW 2026 Open Performance Analysis</p>
          </div>

          {/* Tournament Leaders */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center">
              <Award className="mr-2 text-yellow-500" />
              Tournament Leaders
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {leaders.lowestAverage && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                  <div className="flex items-center">
                    <TrendingUp className="text-green-500 mr-2" size={20} />
                    <div>
                      <p className="text-sm text-gray-600">Lowest Scoring Average</p>
                      <p className="font-bold text-lg">{leaders.lowestAverage.playerName}</p>
                      <p className="text-green-600 font-medium">{leaders.lowestAverage.scoringAverage.toFixed(1)}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.mostBirdies && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                  <div className="flex items-center">
                    <Target className="text-blue-500 mr-2" size={20} />
                    <div>
                      <p className="text-sm text-gray-600">Most Birdies</p>
                      <p className="font-bold text-lg">{leaders.mostBirdies.playerName}</p>
                      <p className="text-blue-600 font-medium">{leaders.mostBirdies.birdies}</p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.bestHandicap && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                  <div className="flex items-center">
                    <BarChart3 className="text-purple-500 mr-2" size={20} />
                    <div>
                      <p className="text-sm text-gray-600">Best vs Handicap</p>
                      <p className="font-bold text-lg">{leaders.bestHandicap.playerName}</p>
                      <p className="text-purple-600 font-medium">
                        {leaders.bestHandicap.handicapPerformance > 0 ? '+' : ''}
                        {leaders.bestHandicap.handicapPerformance.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {leaders.mostConsistent && (
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
                  <div className="flex items-center">
                    <Award className="text-orange-500 mr-2" size={20} />
                    <div>
                      <p className="text-sm text-gray-600">Most Consistent</p>
                      <p className="font-bold text-lg">{leaders.mostConsistent.playerName}</p>
                      <p className="text-orange-600 font-medium">
                        {formatPercentage(leaders.mostConsistent.pars, leaders.mostConsistent.total_holes_played)} pars
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
                  <option value="scoringAverage">Scoring Average</option>
                  <option value="totalScore">Total Score</option>
                  <option value="handicapPerformance">vs Handicap</option>
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Player
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rounds
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scoring Avg
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Avg
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      vs Handicap
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Eagles
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Birdies
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pars
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStats.map((player, index) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-3 ${
                            player.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'
                          }`}></div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {index + 1}. {player.playerName}
                            </div>
                            <div className="text-sm text-gray-500">Team {player.team}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {player.total_rounds_played}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-lg font-bold text-gray-900">
                          {player.scoringAverage.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {player.netScoringAverage.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`text-sm font-medium ${
                          player.handicapPerformance < 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {player.handicapPerformance > 0 ? '+' : ''}
                          {player.handicapPerformance.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {player.eagles}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {player.birdies}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {player.pars} ({formatPercentage(player.pars, player.total_holes_played)})
                      </td>
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