'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Layout from '@/app/components/Layout'

const ADMIN_PASSWORD = 'FuckCalder'
const ADMIN_KEY = 'abtow_admin_auth'

interface MatchRow {
  id: string
  day: number
  format: string
  group_access_token: string
  scores_locked: boolean
  team1_players: string[]
  team2_players: string[]
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_KEY)
    if (stored === ADMIN_PASSWORD) {
      setAuthenticated(true)
      fetchMatches()
    }
  }, [])

  async function fetchMatches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('matches')
      .select('id, day, format, group_access_token, scores_locked, team1_players, team2_players')
      .order('day')
    if (!error && data) setMatches(data as MatchRow[])
    setLoading(false)
  }

  function login() {
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_KEY, ADMIN_PASSWORD)
      setAuthenticated(true)
      fetchMatches()
    } else {
      setError('Wrong password. Try again.')
      setPassword('')
    }
  }

  async function toggleLock(matchId: string, currentlyLocked: boolean) {
    setToggling(matchId)
    const { error } = await supabase.rpc('set_match_scores_locked', {
      match_id: matchId,
      locked: !currentlyLocked
    })
    if (!error) {
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, scores_locked: !currentlyLocked } : m))
    }
    setToggling(null)
  }

  function copyUrl(token: string) {
    const url = `${window.location.origin}/score/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2500)
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_KEY)
    setAuthenticated(false)
    setMatches([])
  }

  if (!authenticated) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🔒</div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>Admin Access</h1>
              <p className="text-sm text-gray-500 mt-1">ABTOW 2026 Open</p>
            </div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && login()}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 text-base focus:outline-none focus:ring-2 focus:ring-[#2a6b7c]"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
            <button
              onClick={login}
              className="btn-primary w-full text-base py-3"
            >
              Enter
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const days = [1, 2, 3]
  const dayLabels: Record<number, string> = {
    1: 'Day 1 — Ritz Carlton GC',
    2: 'Day 2 — Southern Dunes',
    3: 'Day 3 — Champions Gate',
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-2xl mx-auto px-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>Admin Panel</h1>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 underline">
              Log out
            </button>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">Loading matches…</div>
          ) : (
            days.map(day => {
              const dayMatches = matches.filter(m => m.day === day)
              return (
                <div key={day} className="mb-8">
                  <h2 className="text-base font-semibold text-[#2a6b7c] uppercase tracking-wide mb-3">
                    {dayLabels[day]}
                  </h2>
                  {dayMatches.length === 0 ? (
                    <p className="text-sm text-gray-400 pl-1">No matches yet</p>
                  ) : (
                    <div className="space-y-3">
                      {dayMatches.map(match => {
                        const allPlayers = [...(match.team1_players || []), ...(match.team2_players || [])]
                        const isLocked = match.scores_locked
                        return (
                          <div key={match.id} className={`bg-white rounded-xl shadow-sm border-l-4 p-4 ${isLocked ? 'border-red-400' : 'border-green-400'}`}>
                            {/* Players + format */}
                            <div className="mb-3">
                              <p className="font-semibold text-gray-800 text-sm leading-tight">
                                {allPlayers.join(' · ')}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{match.format} · Day {match.day}</p>
                            </div>

                            {/* URL row */}
                            <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-lg px-3 py-2">
                              <span className="text-xs text-gray-400 font-mono truncate flex-1 min-w-0">
                                /score/{match.group_access_token}
                              </span>
                              <button
                                onClick={() => copyUrl(match.group_access_token)}
                                className={`text-xs px-3 py-1.5 rounded-lg shrink-0 font-medium transition-colors ${
                                  copied === match.group_access_token
                                    ? 'bg-green-500 text-white'
                                    : 'bg-[#2a6b7c] text-white hover:bg-[#235a68]'
                                }`}
                              >
                                {copied === match.group_access_token ? '✓ Copied!' : 'Copy URL'}
                              </button>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              {/* Lock toggle */}
                              <button
                                onClick={() => toggleLock(match.id, isLocked)}
                                disabled={toggling === match.id}
                                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
                                  isLocked
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                } disabled:opacity-50`}
                              >
                                {toggling === match.id ? '…' : isLocked ? '🔒 Locked — Tap to Unlock' : '🔓 Unlocked — Tap to Lock'}
                              </button>

                              {/* Admin edit */}
                              <a
                                href={`/score/${match.group_access_token}?adminOverride=1`}
                                className="text-sm px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium whitespace-nowrap"
                              >
                                ✏️ Edit
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </Layout>
  )
}
