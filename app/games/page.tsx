'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isDayComplete } from '@/lib/games-service'

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
    name: 'Handicap Game',
    emoji: '🎯',
    tagline: 'Earn points on every hole. Beat your target to be eligible to win.',
    href: '/games/handicap',
  },
]

export default function GamesPage() {
  const [day1Done, setDay1Done] = useState(false)
  const [day2Done, setDay2Done] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([isDayComplete(1), isDayComplete(2)]).then(([d1, d2]) => {
      setDay1Done(d1)
      setDay2Done(d2)
      setLoading(false)
    })
  }, [])

  const dayUnlocked = [true, day1Done, day2Done] // index 0 = Day 1, 1 = Day 2, 2 = Day 3

  return (
    <div className="max-w-xl mx-auto px-4 py-6" style={{ fontFamily: 'Georgia, serif', backgroundColor: '#f5f0e8', minHeight: '100vh' }}>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-[#2a6b7c]">🎮 Games</h1>
        <p className="text-xs text-gray-400 mt-1">Side games running alongside the tournament</p>
      </div>

      {/* Day unlock status */}
      {!loading && (
        <div className="flex gap-2 justify-center mb-6">
          {[1, 2, 3].map(d => (
            <div key={d} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              dayUnlocked[d - 1]
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-gray-100 text-gray-400 border-gray-200'
            }`}>
              {dayUnlocked[d - 1] ? '🔓' : '🔒'} Day {d}
            </div>
          ))}
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
                  <p className="text-xs text-gray-500 mt-0.5">{game.tagline}</p>
                </div>
              </div>
            </div>

            {/* Day tiles */}
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              {[1, 2, 3].map(d => {
                const unlocked = dayUnlocked[d - 1]
                const label = d === 1 ? 'Ritz Carlton' : d === 2 ? 'Southern Dunes' : 'Champions Gate'
                return (
                  <div key={d}>
                    {unlocked ? (
                      <Link
                        href={`${game.href}?day=${d}`}
                        className="flex flex-col items-center py-4 px-2 hover:bg-[#2a6b7c]/5 active:bg-[#2a6b7c]/10 transition-colors"
                      >
                        <span className="text-sm font-bold text-[#2a6b7c]">Day {d}</span>
                        <span className="text-[10px] text-gray-400 text-center leading-tight mt-0.5">{label}</span>
                        <span className="mt-2 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Open →</span>
                      </Link>
                    ) : (
                      <div className="flex flex-col items-center py-4 px-2 opacity-40 cursor-not-allowed">
                        <span className="text-sm font-bold text-gray-500">Day {d}</span>
                        <span className="text-[10px] text-gray-400 text-center leading-tight mt-0.5">{label}</span>
                        <span className="mt-2 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">🔒 Locked</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Unlock legend */}
      <div className="mt-6 bg-white/60 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 mb-1">Unlock schedule</p>
        <p>🔓 Day 1 — Always available</p>
        <p>🔓 Day 2 — Unlocks after Day 1 scores are locked by admin</p>
        <p>🔓 Day 3 — Unlocks after Day 2 scores are locked by admin</p>
      </div>
    </div>
  )
}
