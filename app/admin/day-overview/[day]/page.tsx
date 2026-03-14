'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  calculateBestBallResults,
  calculateStablefordResults,
  calculateIndividualResults,
  type Player, type Match, type Score, type Course, type MatchResult,
} from '@/lib/scoring'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkinHole {
  hole: number
  par: number
  grossWinner?: Player
  grossScore?: number
  grossTie: boolean
  netWinner?: Player
  netScore?: number
  netTie: boolean
  push: boolean
}

interface SkinsSummary {
  holes: SkinHole[]
  totalGrossWon: number
  totalNetWon: number
  totalSkinsWon: number
  payoutPerSkin: number
  grossByPlayer: Record<string, { player: Player; count: number }>
  netByPlayer:   Record<string, { player: Player; count: number }>
}

interface MatchSummary {
  match: Match
  result: MatchResult
  team1IsShafts: boolean
  shaftsTotal: number
  ballsTotal: number
  label: string
}

const DAY_INFO: Record<number, { name: string; format: string; date: string }> = {
  1: { name: 'Ritz Carlton GC',       format: 'Net Best Ball',        date: 'March 16, 2026' },
  2: { name: 'Southern Dunes GC',     format: 'Combined Stableford',  date: 'March 17, 2026' },
  3: { name: 'Champions Gate Intl',   format: 'Individual Match Play', date: 'March 18, 2026' },
}

// ─── Skins calculation (mirrors app/skins/[day]/page.tsx) ─────────────────────

function computeSkins(allPlayers: Player[], allScores: Score[], course: Course): SkinHole[] {
  const parData = course.par_data as Record<string, { par: number; handicap: number }>
  const results: SkinHole[] = []

  for (let h = 1; h <= 18; h++) {
    const holePar  = parData[`hole_${h}`]?.par ?? 4
    const holeHcp  = parData[`hole_${h}`]?.handicap ?? h

    const holeScores = allPlayers
      .map(p => {
        const gross = allScores.find(s => s.player_id === p.id && s.hole_number === h)?.gross_score
        if (!gross) return null
        const strokes = Math.floor((p.playing_handicap * 0.75) / 18) + (holeHcp <= (p.playing_handicap * 0.75) % 18 ? 1 : 0)
        const net = gross - strokes
        return { player: p, grossScore: gross, netScore: net }
      })
      .filter(Boolean) as { player: Player; grossScore: number; netScore: number }[]

    if (holeScores.length < 2) { results.push({ hole: h, par: holePar, grossTie: false, netTie: false, push: false }); continue }

    const minGross   = Math.min(...holeScores.map(s => s.grossScore))
    const grossWinners = holeScores.filter(s => s.grossScore === minGross)
    const grossWinner  = grossWinners.length === 1 ? grossWinners[0] : null
    const push         = grossWinners.length > 1

    let netWinner: typeof holeScores[0] | null = null
    let netTie = false

    if (!push) {
      if (grossWinner) {
        const isBirdieOrBetter = grossWinner.grossScore <= holePar - 1
        if (isBirdieOrBetter) {
          netWinner = grossWinner
        } else {
          const others = holeScores.filter(s => s.player.id !== grossWinner.player.id)
          const minNet = Math.min(...others.map(s => s.netScore))
          const netWinners = others.filter(s => s.netScore === minNet)
          netTie = netWinners.length > 1
          netWinner = netWinners.length === 1 ? netWinners[0] : null
        }
      }
    } else {
      const minNet = Math.min(...holeScores.map(s => s.netScore))
      const netWinners = holeScores.filter(s => s.netScore === minNet)
      netTie = netWinners.length > 1
      netWinner = netWinners.length === 1 ? netWinners[0] : null
    }

    results.push({
      hole: h, par: holePar,
      grossWinner: !push ? grossWinner?.player : undefined,
      grossScore:  !push && grossWinner ? minGross : undefined,
      grossTie:    grossWinners.length > 1,
      netWinner:   netWinner?.player,
      netScore:    netWinner ? netWinner.netScore : undefined,
      netTie,
      push,
    })
  }
  return results
}

function buildSkinsSummary(holes: SkinHole[]): SkinsSummary {
  const grossByPlayer: Record<string, { player: Player; count: number }> = {}
  const netByPlayer:   Record<string, { player: Player; count: number }> = {}
  let totalGrossWon = 0, totalNetWon = 0

  for (const h of holes) {
    if (h.grossWinner) {
      totalGrossWon++
      const id = h.grossWinner.id
      grossByPlayer[id] = grossByPlayer[id]
        ? { ...grossByPlayer[id], count: grossByPlayer[id].count + 1 }
        : { player: h.grossWinner, count: 1 }
    }
    if (h.netWinner) {
      totalNetWon++
      const id = h.netWinner.id
      netByPlayer[id] = netByPlayer[id]
        ? { ...netByPlayer[id], count: netByPlayer[id].count + 1 }
        : { player: h.netWinner, count: 1 }
    }
  }

  const totalSkinsWon = totalGrossWon + totalNetWon
  const payoutPerSkin = totalSkinsWon > 0 ? 200 / totalSkinsWon : 0

  return { holes, totalGrossWon, totalNetWon, totalSkinsWon, payoutPerSkin, grossByPlayer, netByPlayer }
}

// ─── Score to label helpers ───────────────────────────────────────────────────

function scoreLabel(gross: number, par: number): string {
  const diff = gross - par
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0) return 'Par'
  if (diff === 1) return 'Bogey'
  if (diff === 2) return 'Double Bogey'
  return `+${diff}`
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DayOverview() {
  const params  = useParams()
  const router  = useRouter()
  const day     = parseInt(params.day as string, 10)

  const [authed,  setAuthed]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [ready,   setReady]   = useState(false) // all matches locked+attested
  const [matchSummaries, setMatchSummaries] = useState<MatchSummary[]>([])
  const [skins,   setSkins]   = useState<SkinsSummary | null>(null)
  const [cumulativeShafts, setCumulativeShafts] = useState(0)
  const [cumulativeBalls,  setCumulativeBalls]  = useState(0)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [mvp, setMvp] = useState<{ name: string; first: string; pts: number }[]>([])
  const [spotlights, setSpotlights] = useState<{ emoji: string; title: string; player: string; stat: string; flavor: string }[]>([])

  // ── Auth check ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/verify', { credentials: 'include' })
      .then(r => { if (r.ok) setAuthed(true); else router.push('/admin') })
      .catch(() => router.push('/admin'))
  }, [router])

  // ── Data fetch ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const info = DAY_INFO[day]
    if (!info) { setLoading(false); return }

    // Fetch all players, this day's matches + scores, course
    const [{ data: players }, { data: matches }] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('matches').select('*').eq('day', day),
    ])

    if (!players || !matches) { setLoading(false); return }
    setAllPlayers(players as Player[])

    // Check all locked + attested (scores_locked/attested_by are DB fields not in the Match type)
    const allDone = matches.every((m: Match & { scores_locked?: boolean; attested_by?: string | null }) => m.scores_locked && m.attested_by)
    setReady(allDone)

    if (!allDone) { setLoading(false); return }

    // Fetch scores + course
    const matchIds = matches.map((m: Match) => m.id)
    const courseId = matches[0]?.course_id

    const [{ data: scores }, { data: courseData }] = await Promise.all([
      supabase.from('scores').select('*').in('match_id', matchIds),
      supabase.from('courses').select('*').eq('id', courseId).single(),
    ])

    if (!scores || !courseData) { setLoading(false); return }

    const course = courseData as Course
    const allScores = scores as Score[]

    // ── Match summaries + team pts ─────────────────────────────────────────────
    let dayShafts = 0, dayBalls = 0
    const summaries: MatchSummary[] = []

    for (const match of matches as Match[]) {
      const matchScores = allScores.filter(s => s.match_id === match.id)
      const matchPlayers = players.filter((p: Player) =>
        [...match.team1_players, ...match.team2_players].includes(p.name)
      ) as Player[]

      let result: MatchResult
      if (match.format === 'Best Ball') result = calculateBestBallResults(match, matchScores, matchPlayers, course)
      else if (match.format === 'Stableford') result = calculateStablefordResults(match, matchScores, matchPlayers, course)
      else result = calculateIndividualResults(match, matchScores, matchPlayers, course)

      const team1IsShafts = (players as Player[]).find(p => match.team1_players.includes(p.name))?.team === 'Shaft'
      const shaftsTotal = team1IsShafts ? result.team1_total : result.team2_total
      const ballsTotal  = team1IsShafts ? result.team2_total : result.team1_total

      dayShafts += shaftsTotal
      dayBalls  += ballsTotal

      // Match label
      const t1Names = match.team1_players.map((n: string) => {
        const p = (players as Player[]).find(pl => pl.name === n)
        return p?.first_name ?? n
      }).join(' & ')
      const t2Names = match.team2_players.map((n: string) => {
        const p = (players as Player[]).find(pl => pl.name === n)
        return p?.first_name ?? n
      }).join(' & ')

      summaries.push({ match, result, team1IsShafts, shaftsTotal, ballsTotal, label: `${t1Names} vs ${t2Names}` })
    }

    setMatchSummaries(summaries)

    // ── Cumulative team pts (all days up to this one) ─────────────────────────
    const { data: allMatches } = await supabase
      .from('matches').select('*').lte('day', day)
    const { data: allDayScores } = await supabase
      .from('scores').select('*').in('match_id', (allMatches ?? []).map((m: Match) => m.id))

    let cumShafts = 0, cumBalls = 0
    for (const m of (allMatches ?? []) as Match[]) {
      const mScores = (allDayScores ?? []).filter((s: Score) => s.match_id === m.id)
      const mPlayers = players.filter((p: Player) => [...m.team1_players, ...m.team2_players].includes(p.name)) as Player[]
      const mCourse = m.course_id === courseId ? course : null
      if (!mCourse) continue

      let r: MatchResult
      if (m.format === 'Best Ball') r = calculateBestBallResults(m, mScores, mPlayers, mCourse)
      else if (m.format === 'Stableford') r = calculateStablefordResults(m, mScores, mPlayers, mCourse)
      else r = calculateIndividualResults(m, mScores, mPlayers, mCourse)

      const t1Shaft = players.find((p: Player) => m.team1_players.includes(p.name))?.team === 'Shaft'
      if (t1Shaft) { cumShafts += r.team1_total; cumBalls += r.team2_total }
      else         { cumBalls += r.team1_total; cumShafts += r.team2_total }
    }
    setCumulativeShafts(cumShafts)
    setCumulativeBalls(cumBalls)

    // ── Skins ─────────────────────────────────────────────────────────────────
    const skinPlayers = players.filter((p: Player) =>
      matches.some((m: Match) => [...m.team1_players, ...m.team2_players].includes(p.name))
    ) as Player[]
    const skinHoles = computeSkins(skinPlayers, allScores, course)
    setSkins(buildSkinsSummary(skinHoles))

    // ── MVP standings ─────────────────────────────────────────────────────────
    const { data: statsData } = await supabase
      .from('player_stats').select('player_id, match_points_total, total_net_strokes, total_birdies')
    if (statsData && statsData.length > 0) {
      const sorted = [...statsData].sort((a, b) =>
        b.match_points_total - a.match_points_total ||
        a.total_net_strokes  - b.total_net_strokes  ||
        b.total_birdies      - a.total_birdies
      ).slice(0, 5)
      setMvp(sorted.map(s => {
        const p = (players as Player[]).find(pl => pl.id === s.player_id)
        return { name: p?.name ?? '?', first: p?.first_name ?? '?', pts: s.match_points_total }
      }))
    }

    // ── Player Spotlights ──────────────────────────────────────────────────────
    const parData = course.par_data as Record<string, { par: number; handicap: number }>
    const dayPlayers = players.filter((p: Player) =>
      matches.some((m: Match) => [...m.team1_players, ...m.team2_players].includes(p.name))
    ) as Player[]

    type StatRow = {
      player: Player
      grossTotal: number
      birdies: number
      eagles: number
      bogeys: number
      doubles: number
      pars: number
    }
    const stats: StatRow[] = dayPlayers.map(p => {
      let grossTotal = 0, birdies = 0, eagles = 0, bogeys = 0, doubles = 0, pars = 0
      for (let h = 1; h <= 18; h++) {
        const gs = allScores.find(s => s.player_id === p.id && s.hole_number === h)?.gross_score
        if (!gs) continue
        const par = parData[`hole_${h}`]?.par ?? 4
        grossTotal += gs
        const diff = gs - par
        if (diff <= -2) eagles++
        else if (diff === -1) birdies++
        else if (diff === 0) pars++
        else if (diff === 1) bogeys++
        else if (diff >= 2) doubles++
      }
      return { player: p, grossTotal, birdies, eagles, bogeys, doubles, pars }
    }).filter(r => r.grossTotal > 0)

    const displayName = (p: Player) => (p as Player & { nickname?: string }).nickname || p.first_name || p.name

    const newSpots: typeof spotlights = []

    // Eagle club
    const eaglers = stats.filter(r => r.eagles > 0).sort((a, b) => b.eagles - a.eagles)
    if (eaglers.length > 0) {
      const e = eaglers[0]
      newSpots.push({
        emoji: '🦅',
        title: 'Eagle Club',
        player: displayName(e.player),
        stat: `${e.eagles} eagle${e.eagles > 1 ? 's' : ''}`,
        flavor: e.eagles > 1
          ? `${displayName(e.player)} is playing like it's a video game. ${e.eagles} eagles today.`
          : `${displayName(e.player)} found the bottom of the cup from distance. Welcome to the Eagle Club.`,
      })
    }

    // Birdie leader
    const birdieLeader = [...stats].sort((a, b) => b.birdies - a.birdies)[0]
    if (birdieLeader && birdieLeader.birdies > 0) {
      newSpots.push({
        emoji: '🐦',
        title: 'Birdie Bird',
        player: displayName(birdieLeader.player),
        stat: `${birdieLeader.birdies} birdies`,
        flavor: birdieLeader.birdies >= 4
          ? `${displayName(birdieLeader.player)} was on fire. ${birdieLeader.birdies} birdies — the field had no answer.`
          : `${displayName(birdieLeader.player)} led the field in birdies with ${birdieLeader.birdies}. Take a bow.`,
      })
    }

    // Low gross (round of the day)
    const lowGross = [...stats].sort((a, b) => a.grossTotal - b.grossTotal)[0]
    if (lowGross) {
      const toPar = lowGross.grossTotal - 72
      const toParStr = toPar === 0 ? 'even par' : toPar > 0 ? `+${toPar}` : `${toPar}`
      newSpots.push({
        emoji: '🏆',
        title: 'Round of the Day',
        player: displayName(lowGross.player),
        stat: `${lowGross.grossTotal} gross (${toParStr})`,
        flavor: toPar <= 0
          ? `${displayName(lowGross.player)} posted the low round at ${toParStr}. That's how it's done.`
          : `${displayName(lowGross.player)} led the field with a ${lowGross.grossTotal} — not pretty, but it's the best out there.`,
      })
    }

    // Bogey machine
    const bogeyKing = [...stats].sort((a, b) => b.bogeys - a.bogeys)[0]
    if (bogeyKing && bogeyKing.bogeys >= 5) {
      newSpots.push({
        emoji: '🚂',
        title: 'Bogey Machine',
        player: displayName(bogeyKing.player),
        stat: `${bogeyKing.bogeys} bogeys`,
        flavor: `${displayName(bogeyKing.player)} was consistent today — consistently bogey. ${bogeyKing.bogeys} of them. The train never stopped.`,
      })
    }

    // High gross (rough day)
    const highGross = [...stats].sort((a, b) => b.grossTotal - a.grossTotal)[0]
    if (highGross && highGross.grossTotal > lowGross.grossTotal + 8) {
      const toPar = highGross.grossTotal - 72
      newSpots.push({
        emoji: '😬',
        title: 'Rough Day Award',
        player: displayName(highGross.player),
        stat: `${highGross.grossTotal} gross (+${toPar})`,
        flavor: `${displayName(highGross.player)} had a day to forget. +${toPar} and a lot of explaining to do at the bar.`,
      })
    }

    // Double trouble
    const doubleKing = [...stats].sort((a, b) => b.doubles - a.doubles)[0]
    if (doubleKing && doubleKing.doubles >= 3) {
      newSpots.push({
        emoji: '😱',
        title: 'Double Trouble',
        player: displayName(doubleKing.player),
        stat: `${doubleKing.doubles} doubles+`,
        flavor: `${displayName(doubleKing.player)} found trouble in bulk today. ${doubleKing.doubles} double bogeys or worse. The course won this round.`,
      })
    }

    // Par machine (most pars — sneaky consistent)
    const parMachine = [...stats].sort((a, b) => b.pars - a.pars)[0]
    if (parMachine && parMachine.pars >= 12 && parMachine.player.id !== lowGross.player.id) {
      newSpots.push({
        emoji: '🤖',
        title: 'Par Machine',
        player: displayName(parMachine.player),
        stat: `${parMachine.pars} pars`,
        flavor: `${displayName(parMachine.player)} was the picture of consistency — ${parMachine.pars} pars. Not spectacular, not disastrous. Just there.`,
      })
    }

    setSpotlights(newSpots)

    setLoading(false)
  }, [day])

  useEffect(() => { if (authed) loadData() }, [authed, loadData])

  // ─────────────────────────────────────────────────────────────────────────────

  if (!authed || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white text-lg">{loading ? 'Loading…' : 'Checking auth…'}</div>
      </div>
    )
  }

  const info = DAY_INFO[day]
  if (!info) return <div className="p-8 text-red-500">Invalid day</div>

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-white text-2xl font-bold">Day {day} Not Ready</h1>
        <p className="text-gray-400 max-w-sm">All matches must be locked and attested before the Day Overview is available.</p>
        <button onClick={() => router.push('/admin')} className="mt-4 text-[#2a6b7c] underline text-sm">← Back to Admin</button>
      </div>
    )
  }

  const dayShafts = matchSummaries.reduce((s, m) => s + m.shaftsTotal, 0)
  const dayBalls  = matchSummaries.reduce((s, m) => s + m.ballsTotal,  0)

  const cumLeader = cumulativeShafts > cumulativeBalls
    ? `TEAM SHAFT LEADS ${cumulativeShafts.toFixed(1)} — ${cumulativeBalls.toFixed(1)}`
    : cumulativeBalls > cumulativeShafts
    ? `TEAM BALLS LEADS ${cumulativeBalls.toFixed(1)} — ${cumulativeShafts.toFixed(1)}`
    : `ALL SQUARE — ${cumulativeShafts.toFixed(1)} APIECE`

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-16">
      <div className="max-w-2xl mx-auto">

        {/* Back + Print */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <button onClick={() => router.push('/admin')} className="text-gray-400 hover:text-white text-sm">← Admin</button>
          <button
            onClick={() => window.print()}
            className="bg-[#2a6b7c] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#225a69]"
          >🖨️ Print</button>
        </div>

        {/* ── PRESS RELEASE ─────────────────────────────────────────────────── */}
        <div className="bg-gray-900 rounded-2xl p-6 space-y-6 font-mono print:bg-white print:text-black">

          {/* Header */}
          <div className="text-center border-b border-gray-700 pb-4">
            <div className="text-xs text-gray-400 tracking-widest uppercase mb-1">Official Press Release</div>
            <h1 className="text-2xl font-bold tracking-wide">🏌️ ABTOW 2026 OPEN</h1>
            <h2 className="text-lg font-semibold mt-1 text-[#7dd3e8]">DAY {day} OFFICIAL RECAP</h2>
            <p className="text-sm text-gray-400 mt-1">{info.name} · {info.format} · {info.date}</p>
          </div>

          {/* Team Standings */}
          <section>
            <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ Team Standings — After Day {day} ━━━</div>
            <div className="flex gap-4 mb-3">
              <div className="flex-1 bg-blue-900/40 rounded-xl p-4 text-center border border-blue-800">
                <div className="text-3xl font-bold text-blue-300">{cumulativeShafts.toFixed(1)}</div>
                <div className="text-xs text-blue-400 mt-1 uppercase tracking-wide">Team Shaft</div>
                <div className="text-xs text-gray-500 mt-1">Day {day}: +{dayShafts.toFixed(1)}</div>
              </div>
              <div className="flex-1 bg-red-900/40 rounded-xl p-4 text-center border border-red-800">
                <div className="text-3xl font-bold text-red-300">{cumulativeBalls.toFixed(1)}</div>
                <div className="text-xs text-red-400 mt-1 uppercase tracking-wide">Team Balls</div>
                <div className="text-xs text-gray-500 mt-1">Day {day}: +{dayBalls.toFixed(1)}</div>
              </div>
            </div>
            <div className="text-center text-sm font-bold text-yellow-400 tracking-widest py-2 bg-yellow-900/20 rounded-lg border border-yellow-800">
              {cumLeader}
            </div>
          </section>

          {/* Match Results */}
          <section>
            <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ Day {day} Match Results ━━━</div>
            <div className="space-y-2">
              {matchSummaries.map((ms, i) => {
                const { shaftsTotal: s, ballsTotal: b, match: m, result } = ms
                const winner = s > b ? 'SHAFT' : b > s ? 'BALLS' : null
                const t1Names = m.team1_players.map((n: string) => {
                  const p = allPlayers.find(pl => pl.name === n)
                  return p?.first_name ?? n
                })
                const t2Names = m.team2_players.map((n: string) => {
                  const p = allPlayers.find(pl => pl.name === n)
                  return p?.first_name ?? n
                })
                const shaftNames = ms.team1IsShafts ? t1Names : t2Names
                const ballNames  = ms.team1IsShafts ? t2Names : t1Names

                return (
                  <div key={m.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-2.5 text-sm">
                    <span className="text-gray-500 w-6 shrink-0">G{i+1}</span>
                    <span className={`flex-1 ${ms.team1IsShafts && s > b || !ms.team1IsShafts && b > s ? 'text-blue-300 font-semibold' : 'text-gray-300'}`}>
                      {shaftNames.join(' & ')}
                    </span>
                    <span className="text-xs text-gray-500">vs</span>
                    <span className={`flex-1 text-right ${!ms.team1IsShafts && s > b || ms.team1IsShafts && b > s ? 'text-red-300 font-semibold' : 'text-gray-300'}`}>
                      {ballNames.join(' & ')}
                    </span>
                    <span className="text-xs font-bold w-16 text-right">
                      {s === b
                        ? <span className="text-gray-400">HALVED</span>
                        : <span className={winner === 'SHAFT' ? 'text-blue-400' : 'text-red-400'}>
                            {winner === 'SHAFT' ? `${s}–${b} S` : `${b}–${s} B`}
                          </span>
                      }
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Skins */}
          {skins && (
            <section>
              <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ Skins Report — Day {day} ━━━</div>
              <div className="text-center bg-green-900/30 border border-green-800 rounded-lg py-2 mb-3 text-sm">
                <span className="text-green-400 font-bold">$200 pot</span>
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-white">{skins.totalSkinsWon} skins won</span>
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-yellow-400 font-bold">${skins.payoutPerSkin.toFixed(2)} per skin</span>
              </div>

              {/* Gross skins */}
              <div className="mb-3">
                <div className="text-xs text-gray-500 uppercase mb-1.5">Gross Skins — {skins.totalGrossWon} won</div>
                {skins.holes.filter(h => h.grossWinner).length === 0 && (
                  <div className="text-gray-600 text-sm pl-2">None won</div>
                )}
                {skins.holes.filter(h => h.grossWinner).map(h => {
                  const p = allPlayers.find(pl => pl.id === h.grossWinner!.id)
                  const payout = skins.payoutPerSkin
                  return (
                    <div key={h.hole} className="flex items-center gap-2 text-sm py-1 border-b border-gray-800">
                      <span className="text-gray-500 w-14 shrink-0">Hole {h.hole}</span>
                      <span className="text-green-300 font-semibold flex-1">{p?.first_name ?? h.grossWinner!.name}</span>
                      <span className="text-gray-400">{h.grossScore !== undefined ? scoreLabel(h.grossScore, h.par) : ''} ({h.grossScore})</span>
                      <span className="text-yellow-400 font-bold w-16 text-right">${payout.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Net skins */}
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1.5">Net Skins — {skins.totalNetWon} won</div>
                {skins.holes.filter(h => h.netWinner).length === 0 && (
                  <div className="text-gray-600 text-sm pl-2">None won</div>
                )}
                {skins.holes.filter(h => h.netWinner).map(h => {
                  const p = allPlayers.find(pl => pl.id === h.netWinner!.id)
                  const payout = skins.payoutPerSkin
                  return (
                    <div key={h.hole} className="flex items-center gap-2 text-sm py-1 border-b border-gray-800">
                      <span className="text-gray-500 w-14 shrink-0">Hole {h.hole}</span>
                      <span className="text-[#7dd3e8] font-semibold flex-1">{p?.first_name ?? h.netWinner!.name}</span>
                      <span className="text-gray-400">Net {h.netScore}</span>
                      <span className="text-yellow-400 font-bold w-16 text-right">${payout.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Skins leaders summary */}
              {skins.totalSkinsWon > 0 && (
                <div className="mt-3 bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 uppercase mb-2">Skins Leaders</div>
                  {[
                    ...Object.values(skins.grossByPlayer).map(e => ({ ...e, type: 'Gross' })),
                    ...Object.values(skins.netByPlayer).map(e => ({ ...e, type: 'Net' })),
                  ]
                    .sort((a, b) => b.count - a.count)
                    .map((e, i) => {
                      const earnings = e.count * skins.payoutPerSkin
                      const p = allPlayers.find(pl => pl.id === e.player.id)
                      return (
                        <div key={i} className="flex items-center justify-between text-sm py-0.5">
                          <span className="text-white">{p?.first_name ?? e.player.name}</span>
                          <span className="text-gray-400 text-xs">{e.count} {e.type.toLowerCase()} skin{e.count !== 1 ? 's' : ''}</span>
                          <span className="text-yellow-400 font-bold">${earnings.toFixed(2)}</span>
                        </div>
                      )
                    })}
                </div>
              )}
            </section>
          )}

          {/* Player Spotlights */}
          {spotlights.length > 0 && (
            <section>
              <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ Player Spotlights ━━━</div>
              <div className="space-y-3">
                {spotlights.map((s, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl p-4 border-l-4 border-[#2a6b7c]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{s.emoji}</span>
                      <span className="text-xs font-bold text-[#7dd3e8] uppercase tracking-widest">{s.title}</span>
                      <span className="ml-auto text-xs font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">{s.stat}</span>
                    </div>
                    <div className="text-base font-bold text-white mb-1">{s.player}</div>
                    <div className="text-sm text-gray-400 italic">"{s.flavor}"</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* MVP Standings */}
          {mvp.length > 0 && (
            <section>
              <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ MVP Standings — Through Day {day} ━━━</div>
              <div className="space-y-1">
                {mvp.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2 text-sm">
                    <span className="text-gray-500 w-5">{i + 1}.</span>
                    <span className={`flex-1 font-semibold ${i === 0 ? 'text-yellow-400' : 'text-white'}`}>{p.first}</span>
                    <span className="text-gray-400">{p.pts} pts</span>
                    {i === 0 && <span className="text-lg">🏆</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-gray-600 border-t border-gray-800 pt-4">
            ABTOW 2026 Open · Official Day {day} Summary · abtow.golf
          </div>

        </div>
      </div>
    </div>
  )
}
