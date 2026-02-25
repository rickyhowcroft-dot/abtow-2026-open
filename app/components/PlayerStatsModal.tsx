'use client'

import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { PlayerStatsOverview, PlayerDailyStats } from '@/lib/stats-service'
import StatsService from '@/lib/stats-service'

interface PlayerStatsModalProps {
  playerId: string
  playerName: string
  dreamRound?: { gross: number; net: number }
  isOpen: boolean
  onClose: () => void
}

type TabType = 'overview' | 'daily' | 'scorecard'

type ScorecardDay = {
  day: number; courseName: string; playingHandicap: number
  holes: Array<{ holeNumber: number; par: number; holeHandicap: number; grossScore: number | null; netScore: number | null; strokesGiven: number }>
  frontGross: number; frontNet: number; frontPar: number
  backGross: number; backNet: number; backPar: number
  totalGross: number; totalNet: number; totalPar: number
}

export default function PlayerStatsModal({ playerId, playerName, dreamRound, isOpen, onClose }: PlayerStatsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [stats, setStats] = useState<PlayerStatsOverview | null>(null)
  const [dailyStats, setDailyStats] = useState<Array<PlayerDailyStats & { courseName: string }>>([])
  const [scorecardData, setScorecardData] = useState<ScorecardDay[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && playerId) {
      loadStats()
    }
  }, [isOpen, playerId])

  const loadStats = async () => {
    setLoading(true)
    try {
      const [playerStats, dailyData, scorecard] = await Promise.all([
        StatsService.getPlayerStats(playerId),
        StatsService.getPlayerDailyStats(playerId),
        StatsService.getPlayerScorecardData(playerId)
      ])
      setStats(playerStats)
      setDailyStats(dailyData)
      setScorecardData(scorecard)
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatPercentage = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%'
    return `${((numerator / denominator) * 100).toFixed(1)}%`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-green-600 to-green-700 text-white">
          <h2 className="text-2xl font-bold">{playerName} - Statistics</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-lg">Loading statistics...</div>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('daily')}
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'daily'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Daily Performance
              </button>
              <button
                onClick={() => setActiveTab('scorecard')}
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'scorecard'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Scorecard
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {activeTab === 'overview' && (
                <OverviewTab stats={stats} dreamRound={dreamRound} formatPercentage={formatPercentage} />
              )}
              {activeTab === 'daily' && (
                <DailyTab dailyStats={dailyStats} />
              )}
              {activeTab === 'scorecard' && (
                <ScorecardTab scorecardData={scorecardData} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OverviewTab({ 
  stats,
  dreamRound,
  formatPercentage 
}: { 
  stats: PlayerStatsOverview | null
  dreamRound?: { gross: number; net: number }
  formatPercentage: (n: number, d: number) => string
}) {
  if (!stats) return <div>No statistics available</div>

  const totalHoles = stats.total_holes_played
  const totalScores = stats.eagles + stats.birdies + stats.pars + stats.bogeys + stats.double_bogeys + stats.triple_bogeys_plus

  return (
    <div className="space-y-8">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-600">
            {stats.scoringAverage.toFixed(1)}
          </div>
          <div className="text-sm text-gray-600">Scoring Average</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-600">
            {stats.netScoringAverage.toFixed(1)}
          </div>
          <div className="text-sm text-gray-600">Net Average</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg text-center">
          <div className={`text-2xl font-bold ${stats.handicapPerformance < 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.handicapPerformance > 0 ? '+' : ''}{stats.handicapPerformance.toFixed(1)}
          </div>
          <div className="text-sm text-gray-600">vs Handicap</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-600">
            {stats.total_rounds_played}
          </div>
          <div className="text-sm text-gray-600">Rounds Played</div>
        </div>
      </div>

      {/* Score Distribution */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Score Distribution</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-yellow-100 p-3 rounded text-center">
            <div className="text-lg font-bold text-yellow-700">{stats.eagles}</div>
            <div className="text-xs">Eagles</div>
            <div className="text-xs text-gray-600">{formatPercentage(stats.eagles, totalScores)}</div>
          </div>
          <div className="bg-green-100 p-3 rounded text-center">
            <div className="text-lg font-bold text-green-700">{stats.birdies}</div>
            <div className="text-xs">Birdies</div>
            <div className="text-xs text-gray-600">{formatPercentage(stats.birdies, totalScores)}</div>
          </div>
          <div className="bg-blue-100 p-3 rounded text-center">
            <div className="text-lg font-bold text-blue-700">{stats.pars}</div>
            <div className="text-xs">Pars</div>
            <div className="text-xs text-gray-600">{formatPercentage(stats.pars, totalScores)}</div>
          </div>
          <div className="bg-orange-100 p-3 rounded text-center">
            <div className="text-lg font-bold text-orange-700">{stats.bogeys}</div>
            <div className="text-xs">Bogeys</div>
            <div className="text-xs text-gray-600">{formatPercentage(stats.bogeys, totalScores)}</div>
          </div>
          <div className="bg-red-100 p-3 rounded text-center">
            <div className="text-lg font-bold text-red-700">{stats.double_bogeys}</div>
            <div className="text-xs">Doubles</div>
            <div className="text-xs text-gray-600">{formatPercentage(stats.double_bogeys, totalScores)}</div>
          </div>
          <div className="bg-gray-100 p-3 rounded text-center">
            <div className="text-lg font-bold text-gray-700">{stats.triple_bogeys_plus}</div>
            <div className="text-xs">Triple+</div>
            <div className="text-xs text-gray-600">{formatPercentage(stats.triple_bogeys_plus, totalScores)}</div>
          </div>
        </div>
      </div>

      {/* Performance vs Handicap */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Handicap Performance</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">{stats.rounds_under_handicap}</div>
            <div className="text-sm text-gray-600">Under Handicap</div>
            <div className="text-xs text-gray-500">{formatPercentage(stats.rounds_under_handicap, stats.total_rounds_played)}</div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.rounds_at_handicap}</div>
            <div className="text-sm text-gray-600">At Handicap</div>
            <div className="text-xs text-gray-500">{formatPercentage(stats.rounds_at_handicap, stats.total_rounds_played)}</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">{stats.rounds_over_handicap}</div>
            <div className="text-sm text-gray-600">Over Handicap</div>
            <div className="text-xs text-gray-500">{formatPercentage(stats.rounds_over_handicap, stats.total_rounds_played)}</div>
          </div>
        </div>
      </div>

      {/* Best/Worst Rounds */}
      {(stats.bestRound || stats.worstRound) && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Round Highlights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.bestRound && (
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-700">Best Round</h4>
                <div className="text-2xl font-bold text-green-600">{stats.bestRound.grossScore}</div>
                <div className="text-sm text-gray-600">Day {stats.bestRound.day} - {stats.bestRound.course}</div>
              </div>
            )}
            {stats.worstRound && (
              <div className="bg-red-50 p-4 rounded-lg">
                <h4 className="font-semibold text-red-700">Highest Round</h4>
                <div className="text-2xl font-bold text-red-600">{stats.worstRound.grossScore}</div>
                <div className="text-sm text-gray-600">Day {stats.worstRound.day} - {stats.worstRound.course}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dream Round */}
      {dreamRound && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Dream Round</h3>
          <div className="bg-white rounded-lg border border-yellow-200 shadow-sm p-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden border-2 border-yellow-500">
                <img
                  src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/dream-round-tiger.jpg?v=3"
                  alt="Tiger"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="flex gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">{dreamRound.gross}</div>
                  <div className="text-sm text-gray-500 mt-0.5">Gross</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-teal-600">{dreamRound.net}</div>
                  <div className="text-sm text-gray-500 mt-0.5">Net</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Best score on each hole across all days played</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ScorecardTab({ scorecardData }: { scorecardData: ScorecardDay[] }) {
  if (scorecardData.length === 0) return <div className="text-gray-500">No scorecard data available.</div>

  function scoreColor(gross: number | null, par: number): string {
    if (gross === null) return ''
    const diff = gross - par
    if (diff <= -2) return 'bg-yellow-300 text-yellow-900'  // eagle+
    if (diff === -1) return 'bg-green-200 text-green-900'   // birdie
    if (diff === 0)  return ''                               // par
    if (diff === 1)  return 'bg-orange-100 text-orange-800' // bogey
    return 'bg-red-200 text-red-900'                        // double+
  }

  function netColor(net: number | null, par: number): string {
    if (net === null) return ''
    const diff = net - par
    if (diff <= -2) return 'text-yellow-600 font-bold'
    if (diff === -1) return 'text-green-600 font-bold'
    if (diff === 0)  return 'text-gray-600'
    if (diff === 1)  return 'text-orange-600'
    return 'text-red-600 font-bold'
  }

  const Cell = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <td className={`border border-gray-200 text-center px-1 py-1.5 text-xs ${className}`}>{children}</td>
  )

  const SubtotalCell = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <td className={`border border-gray-300 text-center px-1 py-1.5 text-xs font-bold bg-gray-50 ${className}`}>{children}</td>
  )

  const LabelCell = ({ children }: { children: React.ReactNode }) => (
    <td className="border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 bg-gray-50 whitespace-nowrap">{children}</td>
  )

  return (
    <div className="space-y-8">
      {scorecardData.map(day => {
        const front = day.holes.slice(0, 9)
        const back = day.holes.slice(9, 18)

        const renderNine = (holes: typeof day.holes, label: string, grossTotal: number, netTotal: number, parTotal: number) => (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[520px]">
              <tbody>
                {/* Hole row */}
                <tr className="bg-gray-800 text-white">
                  <LabelCell>Hole</LabelCell>
                  {holes.map(h => <Cell key={h.holeNumber} className="bg-gray-800 text-white font-bold">{h.holeNumber}</Cell>)}
                  <SubtotalCell className="bg-gray-700 text-white">{label}</SubtotalCell>
                </tr>
                {/* H/I row */}
                <tr>
                  <LabelCell>H/I</LabelCell>
                  {holes.map(h => <Cell key={h.holeNumber} className="text-gray-500">{h.holeHandicap}</Cell>)}
                  <SubtotalCell>—</SubtotalCell>
                </tr>
                {/* Par row */}
                <tr>
                  <LabelCell>Par</LabelCell>
                  {holes.map(h => <Cell key={h.holeNumber} className="text-gray-700">{h.par}</Cell>)}
                  <SubtotalCell>{parTotal}</SubtotalCell>
                </tr>
                {/* Gross row */}
                <tr>
                  <LabelCell>Gross</LabelCell>
                  {holes.map(h => (
                    <Cell key={h.holeNumber} className={scoreColor(h.grossScore, h.par)}>
                      <div className="relative inline-block">
                        {h.grossScore ?? '—'}
                        {h.strokesGiven > 0 && (
                          <span className="absolute -top-1 -right-1.5 text-[8px] text-blue-600 font-bold leading-none">
                            {'•'.repeat(Math.min(h.strokesGiven, 2))}
                          </span>
                        )}
                      </div>
                    </Cell>
                  ))}
                  <SubtotalCell className={grossTotal > 0 ? '' : 'text-gray-400'}>{grossTotal || '—'}</SubtotalCell>
                </tr>
                {/* Net row */}
                <tr>
                  <LabelCell>Net</LabelCell>
                  {holes.map(h => (
                    <Cell key={h.holeNumber}>
                      <span className={netColor(h.netScore, h.par)}>{h.netScore ?? '—'}</span>
                    </Cell>
                  ))}
                  <SubtotalCell className={netTotal > 0 ? '' : 'text-gray-400'}>{netTotal || '—'}</SubtotalCell>
                </tr>
              </tbody>
            </table>
          </div>
        )

        return (
          <div key={day.day}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold">Day {day.day}</h3>
                <p className="text-sm text-gray-500">{day.courseName} · HCP {day.playingHandicap}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">{day.totalGross}</div>
                <div className="text-sm text-gray-500">Net {day.totalNet}</div>
              </div>
            </div>
            {renderNine(front, 'OUT', day.frontGross, day.frontNet, day.frontPar)}
            <div className="mt-2">
              {renderNine(back, 'IN', day.backGross, day.backNet, day.backPar)}
            </div>
            {/* Totals row */}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse min-w-[520px]">
                <tbody>
                  <tr className="bg-gray-100">
                    <td className="border border-gray-300 px-2 py-1.5 text-xs font-bold text-gray-700 bg-gray-200 whitespace-nowrap">Totals</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-xs text-center text-gray-600">OUT {day.frontPar}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-xs text-center text-gray-600">IN {day.backPar}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-xs font-bold text-center">TOT {day.totalPar}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-xs text-center">Gross <span className="font-bold text-gray-800">{day.totalGross}</span></td>
                    <td className="border border-gray-300 px-3 py-1.5 text-xs text-center">Net <span className="font-bold text-teal-700">{day.totalNet}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-gray-400">• = stroke given on hole</div>
          </div>
        )
      })}
    </div>
  )
}

function DailyTab({ dailyStats }: { dailyStats: Array<PlayerDailyStats & { courseName: string }> }) {
  if (dailyStats.length === 0) {
    return <div>No daily statistics available</div>
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold mb-4">Daily Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border p-3 text-left">Day</th>
              <th className="border p-3 text-left">Course</th>
              <th className="border p-3 text-center">Gross</th>
              <th className="border p-3 text-center">Net</th>
              <th className="border p-3 text-center">vs HCP</th>
              <th className="border p-3 text-center">Eagles</th>
              <th className="border p-3 text-center">Birdies</th>
              <th className="border p-3 text-center">Pars</th>
              <th className="border p-3 text-center">Bogeys</th>
              <th className="border p-3 text-center">Doubles+</th>
            </tr>
          </thead>
          <tbody>
            {dailyStats.map((day) => (
              <tr key={`${day.day}-${day.course_id}`} className="hover:bg-gray-50">
                <td className="border p-3 font-medium">Day {day.day}</td>
                <td className="border p-3">{day.courseName}</td>
                <td className="border p-3 text-center font-bold">{day.gross_score}</td>
                <td className="border p-3 text-center">{day.net_score}</td>
                <td className={`border p-3 text-center font-medium ${
                  (day.strokes_to_handicap || 0) < 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {day.strokes_to_handicap !== null ? 
                    (day.strokes_to_handicap > 0 ? `+${day.strokes_to_handicap}` : day.strokes_to_handicap) : 
                    '-'
                  }
                </td>
                <td className="border p-3 text-center">{day.eagles}</td>
                <td className="border p-3 text-center">{day.birdies}</td>
                <td className="border p-3 text-center">{day.pars}</td>
                <td className="border p-3 text-center">{day.bogeys}</td>
                <td className="border p-3 text-center">{day.double_bogeys + day.triple_bogeys_plus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
