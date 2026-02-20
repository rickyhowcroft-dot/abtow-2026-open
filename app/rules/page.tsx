'use client'

import Link from 'next/link'

const days = [
  {
    day: 1,
    title: 'Day 1 — Ritz Carlton GC (Blue Tees)',
    format: 'Team Best Ball Match Play',
    date: 'March 16, 2026',
    rules: [
      '75% Handicap.',
      'Low NET score in cart is TEAM score for the hole.',
      '2 man matches with 3 total points per match (1 front, 1 back, 1 total).',
      'Ties = half point.',
    ],
  },
  {
    day: 2,
    title: 'Day 2 — Southern Dunes (Blue/White Blended)',
    format: 'Stableford',
    date: 'March 17, 2026 ☘️',
    rules: [
      '75% Handicap.',
      '2 man matches with 3 total points per match (1 front, 1 back, 1 total).',
      '1 additional point for best overall team total.',
      'Ties = half point.',
    ],
  },
  {
    day: 3,
    title: 'Day 3 — Champions Gate International (White Tees)',
    format: 'Individual Match Play',
    date: 'March 18, 2026',
    rules: [
      '75% handicap off low man in the match.',
      '3 total points per match (1 front, 1 back, 1 total).',
      'Team with most points for the day gets 1 additional point.',
      'Ties = half point.',
    ],
  },
]

export default function RulesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <div className="mb-4 text-sm">
          <Link href="/" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Home</Link>
          <span className="text-gray-400 mx-2">›</span>
          <span className="text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>Rules</span>
        </div>

        <h1 className="text-4xl text-center mb-2 text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
          Tournament Rules
        </h1>
        <p className="text-center text-gray-500 mb-8 text-sm" style={{ fontFamily: 'Georgia, serif' }}>
          ABTOW 2026 Open &bull; $4,800 Purse
        </p>

        <div className="space-y-6">
          {days.map(d => (
            <div key={d.day} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="bg-[#2a6b7c] text-white px-6 py-3">
                <h2 className="text-xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>{d.title}</h2>
                <p className="text-sm text-white/80">{d.date}</p>
              </div>
              <div className="px-6 py-4">
                <div className="mb-3">
                  <span className="inline-block px-3 py-1 bg-[#2a6b7c]/10 text-[#2a6b7c] rounded-full text-sm font-semibold" style={{ fontFamily: 'Georgia, serif' }}>
                    {d.format}
                  </span>
                </div>
                <ul className="space-y-2">
                  {d.rules.map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
                      <span className="text-[#2a6b7c] mt-0.5">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}

          {/* Skins Rules */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-[#2a6b7c] text-white px-6 py-3">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>Skins</h2>
              <p className="text-sm text-white/80">All 3 Days</p>
            </div>
            <div className="px-6 py-4">
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
                  <span className="text-[#2a6b7c] mt-0.5">•</span>
                  <span>$200/day — NET &amp; GROSS.</span>
                </li>
                <li className="flex items-start gap-2 text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
                  <span className="text-[#2a6b7c] mt-0.5">•</span>
                  <span>Gross birdie or better wins both NET and GROSS skins.</span>
                </li>
                <li className="flex items-start gap-2 text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
                  <span className="text-[#2a6b7c] mt-0.5">•</span>
                  <span>NET scores never cut or push a GROSS score.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-[#2a6b7c] hover:underline text-sm" style={{ fontFamily: 'Georgia, serif' }}>
            ← Back to Leaderboard
          </Link>
        </div>
      </div>
    </div>
  )
}
