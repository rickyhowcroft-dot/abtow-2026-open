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
  const [dailyGameData, setDailyGameData] = useState<Awaited<ReturnType<typeof StatsService.getPlayerDailyGameData>>>([]) 
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && playerId) {
      loadStats()
    }
  }, [isOpen, playerId])

  const loadStats = async () => {
    setLoading(true)
    try {
      const [playerStats, dailyData, scorecard, gameData] = await Promise.all([
        StatsService.getPlayerStats(playerId),
        StatsService.getPlayerDailyStats(playerId),
        StatsService.getPlayerScorecardData(playerId),
        StatsService.getPlayerDailyGameData(playerId, playerName),
      ])
      setStats(playerStats)
      setDailyStats(dailyData)
      setScorecardData(scorecard)
      setDailyGameData(gameData)
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
                <DailyTab dailyStats={dailyStats} gameData={dailyGameData} />
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
                  src="https://fnxyorriiytdskxpedir.supabase.co/storage/v1/object/public/avatars/dream-round-tiger.jpg?v=4"
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
  if (scorecardData.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
      <span className="text-3xl">🏌️</span>
      <span className="text-sm">No rounds played yet.</span>
    </div>
  )

  function scoreCell(gross: number | null, par: number, strokesGiven: number) {
    if (gross === null) return <span className="text-gray-300 text-xs">—</span>
    const diff = gross - par
    let cls = ''
    let shape = ''
    if (diff <= -2)       { cls = 'bg-yellow-300 text-yellow-900'; shape = 'rounded-full' }
    else if (diff === -1) { cls = 'bg-green-200 text-green-900';   shape = 'rounded-full' }
    else if (diff === 1)  { cls = 'bg-orange-100 text-orange-800'; shape = 'rounded' }
    else if (diff >= 2)   { cls = 'bg-red-200 text-red-900';       shape = 'rounded' }
    return (
      <div className={`relative inline-flex items-center justify-center w-7 h-7 text-xs font-bold leading-none ${cls} ${shape}`}>
        {gross}
        {strokesGiven > 0 && (
          <span className="absolute -top-0.5 -right-0.5 text-[6px] text-blue-500 font-black leading-none">
            {'•'.repeat(Math.min(strokesGiven, 2))}
          </span>
        )}
      </div>
    )
  }

  function renderNine(holes: ScorecardDay['holes'], label: string, grossTotal: number, netTotal: number, parTotal: number) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: '360px' }}>
          <tbody>
            <tr className="bg-gray-800 text-white">
              <td className="px-2 py-1.5 font-semibold text-gray-300 bg-gray-800 whitespace-nowrap w-12">Hole</td>
              {holes.map(h => <td key={h.holeNumber} className="px-1 py-1.5 text-center font-bold w-7">{h.holeNumber}</td>)}
              <td className="px-2 py-1.5 text-center font-bold bg-gray-700 w-10">{label}</td>
            </tr>
            <tr>
              <td className="px-2 py-1.5 text-gray-500 font-medium bg-gray-50 whitespace-nowrap">H/I</td>
              {holes.map(h => <td key={h.holeNumber} className="px-1 py-1.5 text-center text-gray-400">{h.holeHandicap}</td>)}
              <td className="px-2 py-1.5 text-center text-gray-400 bg-gray-50">—</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1.5 text-gray-600 font-medium bg-gray-50 whitespace-nowrap">Par</td>
              {holes.map(h => <td key={h.holeNumber} className="px-1 py-1.5 text-center text-gray-700">{h.par}</td>)}
              <td className="px-2 py-1.5 text-center font-bold text-gray-700 bg-gray-50">{parTotal}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1.5 font-bold text-gray-800 bg-gray-50 whitespace-nowrap">Score</td>
              {holes.map(h => (
                <td key={h.holeNumber} className="px-0.5 py-1 text-center">
                  {scoreCell(h.grossScore, h.par, h.strokesGiven)}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center font-bold text-gray-800 bg-gray-50">{grossTotal || '—'}</td>
            </tr>
            <tr>
              <td className="px-2 py-1.5 text-gray-500 font-medium bg-gray-50 whitespace-nowrap">Net</td>
              {holes.map(h => <td key={h.holeNumber} className="px-1 py-1.5 text-center text-gray-500">{h.netScore ?? '—'}</td>)}
              <td className="px-2 py-1.5 text-center font-bold text-gray-500 bg-gray-50">{netTotal || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {scorecardData.map(day => (
        <div key={day.day}>
          {/* Day header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div>
              <div className="text-sm font-bold text-gray-800">Day {day.day} · {day.courseName}</div>
              <div className="text-xs text-gray-400">HCP {day.playingHandicap}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">{day.totalGross}</div>
              <div className="text-xs text-gray-400">Net {day.totalNet}</div>
            </div>
          </div>

          {/* Scorecard tables */}
          <div className="rounded-lg overflow-hidden border border-gray-200 space-y-px">
            {renderNine(day.holes.slice(0, 9), 'Out', day.frontGross, day.frontNet, day.frontPar)}
            {renderNine(day.holes.slice(9, 18), 'In', day.backGross, day.backNet, day.backPar)}
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between mt-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
            <span>Par <strong className="text-gray-800">{day.totalPar}</strong></span>
            <span>Out <strong className="text-gray-800">{day.frontGross}</strong> · In <strong className="text-gray-800">{day.backGross}</strong></span>
            <span>Net <strong className="text-teal-700">{day.totalNet}</strong></span>
          </div>
        </div>
      ))}

      {/* Colour legend */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-5 h-5 rounded-full bg-yellow-300 flex items-center justify-center text-yellow-900 text-xs font-bold">3</div>Eagle+
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-green-900 text-xs font-bold">4</div>Birdie
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center text-orange-800 text-xs font-bold">5</div>Bogey
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-5 h-5 rounded bg-red-200 flex items-center justify-center text-red-900 text-xs font-bold">6</div>Dbl+
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="text-[8px] text-blue-500 font-black">•</span>Stroke given
        </div>
      </div>
    </div>
  )
}

function DailyTab({
  dailyStats,
  gameData,
}: {
  dailyStats: Array<PlayerDailyStats & { courseName: string }>
  gameData: Array<{
    day: number
    matchResult: 'W' | 'L' | 'D' | null
    matchPoints: number | null
    matchScoreDisplay: string | null
    betsWon: number
    betsLost: number
    betsPush: number
    betsNetAmount: number
  }>
}) {
  const days = Array.from(new Set([...dailyStats.map(d => d.day), ...gameData.map(d => d.day)])).sort((a, b) => a - b)

  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
        <span className="text-3xl">⛳</span>
        <span className="text-sm">No rounds played yet.</span>
      </div>
    )
  }

  const COURSE_NAMES: Record<number, string> = { 1: 'Ritz Carlton GC', 2: 'Southern Dunes', 3: "Champions Gate Int'l" }

  return (
    <div className="space-y-5">
      {days.map(day => {
        const daily = dailyStats.find(d => d.day === day)
        const game = gameData.find(d => d.day === day)
        const courseName = daily?.courseName ?? COURSE_NAMES[day] ?? `Day ${day}`

        const resultColor = game?.matchResult === 'W'
          ? 'text-green-700 bg-green-50 border-green-200'
          : game?.matchResult === 'L'
          ? 'text-red-700 bg-red-50 border-red-200'
          : game?.matchResult === 'D'
          ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
          : 'text-gray-400 bg-gray-50 border-gray-200'

        const resultLabel = game?.matchResult === 'W' ? 'WIN' : game?.matchResult === 'L' ? 'LOSS' : game?.matchResult === 'D' ? 'DRAW' : '—'

        const betsNet = game?.betsNetAmount ?? 0
        const betsNetColor = betsNet > 0 ? 'text-green-700' : betsNet < 0 ? 'text-red-700' : 'text-gray-500'
        const betsNetLabel = betsNet === 0 ? 'Even' : betsNet > 0 ? `+$${betsNet.toFixed(0)}` : `-$${Math.abs(betsNet).toFixed(0)}`

        return (
          <div key={day} className="rounded-xl border border-gray-200 overflow-hidden">
            {/* Day header */}
            <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-bold text-sm">Day {day}</div>
                <div className="text-green-200 text-xs">{courseName}</div>
              </div>
              {daily && (
                <div className="text-right">
                  <div className="text-white font-bold text-lg">{daily.gross_score}</div>
                  <div className="text-green-200 text-xs">Net {daily.net_score}</div>
                </div>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              {/* Match Result */}
              <div className="bg-white px-4 py-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Match Result</div>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-sm font-bold ${resultColor}`}>
                  {resultLabel}
                </div>
                {game?.matchScoreDisplay && (
                  <div className="text-xs text-gray-400 mt-1">{game.matchScoreDisplay}</div>
                )}
              </div>

              {/* Match Points */}
              <div className="bg-white px-4 py-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Match Points</div>
                <div className="text-2xl font-bold text-gray-900">
                  {game?.matchPoints ?? '—'}
                </div>
                <div className="text-xs text-gray-400">of 2 possible</div>
              </div>

              {/* Skins Won */}
              <div className="bg-white px-4 py-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Skins Won</div>
                <div className="text-2xl font-bold text-gray-900">—</div>
                <div className="text-xs text-gray-400">after round</div>
              </div>

              {/* Side Games */}
              <div className="bg-white px-4 py-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Handicap Game</div>
                <div className="text-2xl font-bold text-gray-900">—</div>
                <div className="text-xs text-gray-400">finish place</div>
              </div>

              {/* Bets Record */}
              <div className="bg-white px-4 py-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Bets Record</div>
                {(game?.betsWon ?? 0) + (game?.betsLost ?? 0) + (game?.betsPush ?? 0) === 0 ? (
                  <div className="text-sm text-gray-400">No settled bets</div>
                ) : (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-green-700">{game?.betsWon ?? 0}W</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm font-bold text-red-700">{game?.betsLost ?? 0}L</span>
                    {(game?.betsPush ?? 0) > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm font-bold text-gray-500">{game.betsPush}P</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Bets Net */}
              <div className="bg-white px-4 py-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Bets Net</div>
                <div className={`text-2xl font-bold ${betsNetColor}`}>{betsNetLabel}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


