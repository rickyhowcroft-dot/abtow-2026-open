'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getDayStatus, type DayStatus } from '@/lib/games-service'

interface Game {
  id: string
  name: string
  emoji: string
  tagline: string
  href: string
}

const GAMES: Game[] = [
  {
    id: 'handicap',
    name: 'Handicap Game — $10/player',
    emoji: '🎯',
    tagline: 'Earn points on every hole. Beat your target to be eligible to win.',
    href: '/games/handicap',
  },
]

const DAY_COURSE = ['Ritz Carlton', 'Southern Dunes', 'Champions Gate']

export default function GamesPage() {
  const [statuses, setStatuses] = useState<DayStatus[]>(['locked_date', 'locked_date', 'locked_date'])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDayStatus(1), getDayStatus(2), getDayStatus(3)]).then(results => {
      setStatuses(results)
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-xl mx-auto px-4 py-6" style={{ fontFamily: 'Georgia, serif', backgroundColor: '#f5f0e8', minHeight: '100vh' }}>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-[#2a6b7c]">🎮 Games</h1>
        <p className="text-xs text-gray-400 mt-1">Side games running alongside the tournament</p>
      </div>

      {/* Day status pills */}
      {!loading && (
        <div className="flex gap-2 justify-center mb-6">
          {[1, 2, 3].map(d => {
            const s = statuses[d - 1]
            return (
              <div key={d} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                s === 'open'             ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                s === 'locked_complete'  ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                           'bg-gray-100 text-gray-400 border-gray-200'
              }`}>
                {s === 'open' ? '🔓' : s === 'locked_complete' ? '✓' : '🔒'} Day {d}
              </div>
            )
          })}
        </div>
      )}

      {/* Game cards */}
      <div className="space-y-4">
        {GAMES.map(game => (
          <div key={game.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{game.emoji}</span>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{game.name}</h2>
                  {game.tagline.split('. ').map((s, i) => (
                    <p key={i} className="text-xs text-gray-500 mt-0.5">{s}{i < game.tagline.split('. ').length - 1 ? '.' : ''}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-gray-100">
              {[1, 2, 3].map(d => {
                const s = loading ? 'locked_date' : statuses[d - 1]
                const canView   = s === 'open' || s === 'locked_complete'
                const isComplete = s === 'locked_complete'
                const isLocked   = s === 'locked_date'

                const tile = (
                  <div className={`flex flex-col items-center py-4 px-2 ${canView ? 'hover:bg-[#2a6b7c]/5 active:bg-[#2a6b7c]/10' : 'opacity-40 cursor-not-allowed'} transition-colors`}>
                    <span className="text-sm font-bold text-[#2a6b7c]">{isLocked ? '🔒' : ''} Day {d}</span>
                    <span className="text-[10px] text-gray-400 text-center leading-tight mt-0.5">{DAY_COURSE[d - 1]}</span>
                    {isLocked && (
                      <span className="mt-2 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Locked</span>
                    )}
                    {s === 'open' && (
                      <span className="mt-2 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Open →</span>
                    )}
                    {isComplete && (
                      <span className="mt-2 text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-semibold">🔒 View →</span>
                    )}
                  </div>
                )

                return (
                  <div key={d}>
                    {canView
                      ? <Link href={`${game.href}?day=${d}`}>{tile}</Link>
                      : tile
                    }
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white/60 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 mb-1">Day unlock schedule</p>
        <p>🔓 Day 1 — Unlocks March 16th</p>
        <p>🔓 Day 2 — Unlocks March 17th</p>
        <p>🔓 Day 3 — Unlocks March 18th</p>
        <p className="text-gray-400 pt-1">🔒 View → Round complete — results viewable, scoring closed</p>
      </div>
    </div>
  )
}
