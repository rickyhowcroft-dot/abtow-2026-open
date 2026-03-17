'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Layout from '@/app/components/Layout'
import {
  calculateBestBallResults,
  calculateStablefordResults,
  calculateIndividualResults,
  type Player, type Match, type Score, type Course, type MatchResult,
} from '@/lib/scoring'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SkinHole {
  hole: number; par: number
  grossWinner?: Player; grossScore?: number; grossTie: boolean
  netWinner?: Player; netScore?: number; netTie: boolean; push: boolean
}
interface SkinsSummary {
  holes: SkinHole[]; totalGrossWon: number; totalNetWon: number
  totalSkinsWon: number; payoutPerSkin: number
  grossByPlayer: Record<string, { player: Player; count: number }>
  netByPlayer:   Record<string, { player: Player; count: number }>
}
interface MatchSummary {
  match: Match; result: MatchResult; team1IsShafts: boolean
  shaftsTotal: number; ballsTotal: number
}
interface DayData {
  matchSummaries: MatchSummary[]; skins: SkinsSummary | null
  cumulativeShafts: number; cumulativeBalls: number
  allPlayers: Player[]
  mvp: { name: string; first: string; pts: number }[]
  spotlights: { emoji: string; title: string; player: string; stat: string; flavor: string }[]
}

const DAY_INFO: Record<number, { name: string; format: string; date: string }> = {
  1: { name: 'Ritz Carlton GC',      format: 'Net Best Ball',         date: 'March 16, 2026' },
  2: { name: 'Southern Dunes GC',    format: 'Combined Stableford',   date: 'March 17, 2026' },
  3: { name: 'Champions Gate Intl',  format: 'Individual Match Play',  date: 'March 18, 2026' },
}

// ─── Skins calc ───────────────────────────────────────────────────────────────
function computeSkins(players: Player[], scores: Score[], course: Course): SkinHole[] {
  const parData = course.par_data as Record<string, { par: number; handicap: number }>
  const results: SkinHole[] = []
  for (let h = 1; h <= 18; h++) {
    const holePar = parData[`hole_${h}`]?.par ?? 4
    const holeHcp = parData[`hole_${h}`]?.handicap ?? h
    const hs = players.map(p => {
      const gross = scores.find(s => s.player_id === p.id && s.hole_number === h)?.gross_score
      if (!gross) return null
      const strokes = Math.floor((p.playing_handicap * 0.75) / 18) + (holeHcp <= (p.playing_handicap * 0.75) % 18 ? 1 : 0)
      return { player: p, grossScore: gross, netScore: gross - strokes }
    }).filter(Boolean) as { player: Player; grossScore: number; netScore: number }[]
    if (hs.length < 2) { results.push({ hole: h, par: holePar, grossTie: false, netTie: false, push: false }); continue }
    const minGross = Math.min(...hs.map(s => s.grossScore))
    const grossWinners = hs.filter(s => s.grossScore === minGross)
    const grossWinner = grossWinners.length === 1 ? grossWinners[0] : null
    const push = grossWinners.length > 1
    let netWinner: typeof hs[0] | null = null; let netTie = false
    if (!push && grossWinner) {
      if (grossWinner.grossScore <= holePar - 1) { netWinner = grossWinner }
      else {
        const others = hs.filter(s => s.player.id !== grossWinner.player.id)
        const minNet = Math.min(...others.map(s => s.netScore))
        const netWinners = others.filter(s => s.netScore === minNet)
        netTie = netWinners.length > 1; netWinner = netWinners.length === 1 ? netWinners[0] : null
      }
    } else if (push) {
      const minNet = Math.min(...hs.map(s => s.netScore))
      const netWinners = hs.filter(s => s.netScore === minNet)
      netTie = netWinners.length > 1; netWinner = netWinners.length === 1 ? netWinners[0] : null
    }
    results.push({
      hole: h, par: holePar,
      grossWinner: !push ? grossWinner?.player : undefined,
      grossScore: !push && grossWinner ? minGross : undefined,
      grossTie: grossWinners.length > 1,
      netWinner: netWinner?.player, netScore: netWinner?.netScore, netTie, push,
    })
  }
  return results
}
function buildSkinsSummary(holes: SkinHole[]): SkinsSummary {
  const grossByPlayer: Record<string, { player: Player; count: number }> = {}
  const netByPlayer:   Record<string, { player: Player; count: number }> = {}
  let totalGrossWon = 0, totalNetWon = 0
  for (const h of holes) {
    if (h.grossWinner) { totalGrossWon++; const id = h.grossWinner.id; grossByPlayer[id] = grossByPlayer[id] ? { ...grossByPlayer[id], count: grossByPlayer[id].count + 1 } : { player: h.grossWinner, count: 1 } }
    if (h.netWinner)   { totalNetWon++;   const id = h.netWinner.id;   netByPlayer[id]   = netByPlayer[id]   ? { ...netByPlayer[id],   count: netByPlayer[id].count   + 1 } : { player: h.netWinner,   count: 1 } }
  }
  const totalSkinsWon = totalGrossWon + totalNetWon
  return { holes, totalGrossWon, totalNetWon, totalSkinsWon, payoutPerSkin: totalSkinsWon > 0 ? 200 / totalSkinsWon : 0, grossByPlayer, netByPlayer }
}
function scoreLabel(gross: number, par: number): string {
  const d = gross - par
  if (d <= -2) return 'Eagle'; if (d === -1) return 'Birdie'; if (d === 0) return 'Par'
  if (d === 1) return 'Bogey'; if (d === 2) return 'Double'; return `+${d}`
}

// ─── Day section ──────────────────────────────────────────────────────────────
function DaySection({ day }: { day: number }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DayData | null>(null)
  const info = DAY_INFO[day]

  const loadDay = useCallback(async () => {
    setLoading(true)
    const [{ data: players }, { data: matches }] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('matches').select('*').eq('day', day),
    ])
    if (!players || !matches || matches.length === 0) { setLoading(false); return }

    const matchIds = matches.map((m: Match) => m.id)
    const courseId = matches[0]?.course_id
    const [{ data: scores }, { data: courseData }] = await Promise.all([
      supabase.from('scores').select('*').in('match_id', matchIds),
      supabase.from('courses').select('*').eq('id', courseId).single(),
    ])
    if (!scores || !courseData) { setLoading(false); return }
    const course = courseData as Course
    const allScores = scores as Score[]
    const allPlayers = players as Player[]

    // Match summaries
    let dayShafts = 0, dayBalls = 0
    const summaries: MatchSummary[] = []
    for (const match of matches as Match[]) {
      const mScores = allScores.filter(s => s.match_id === match.id)
      const mPlayers = allPlayers.filter(p => [...match.team1_players, ...match.team2_players].includes(p.name))
      let result: MatchResult
      if (match.format === 'Best Ball') result = calculateBestBallResults(match, mScores, mPlayers, course)
      else if (match.format === 'Stableford') result = calculateStablefordResults(match, mScores, mPlayers, course)
      else result = calculateIndividualResults(match, mScores, mPlayers, course)
      const team1IsShafts = allPlayers.find(p => match.team1_players.includes(p.name))?.team === 'Shaft'
      const shaftsTotal = team1IsShafts ? result.team1_total : result.team2_total
      const ballsTotal  = team1IsShafts ? result.team2_total : result.team1_total
      dayShafts += shaftsTotal; dayBalls += ballsTotal
      summaries.push({ match, result, team1IsShafts, shaftsTotal, ballsTotal })
    }

    // Cumulative
    const { data: allMatches } = await supabase.from('matches').select('*').lte('day', day)
    const { data: allDayScores } = await supabase.from('scores').select('*').in('match_id', (allMatches ?? []).map((m: Match) => m.id))
    let cumShafts = 0, cumBalls = 0
    for (const m of (allMatches ?? []) as Match[]) {
      const mScores = (allDayScores ?? []).filter((s: Score) => s.match_id === m.id)
      const mPlayers = allPlayers.filter(p => [...m.team1_players, ...m.team2_players].includes(p.name))
      const mCourse = m.course_id === courseId ? course : null; if (!mCourse) continue
      let r: MatchResult
      if (m.format === 'Best Ball') r = calculateBestBallResults(m, mScores, mPlayers, mCourse)
      else if (m.format === 'Stableford') r = calculateStablefordResults(m, mScores, mPlayers, mCourse)
      else r = calculateIndividualResults(m, mScores, mPlayers, mCourse)
      const t1Shaft = allPlayers.find(p => m.team1_players.includes(p.name))?.team === 'Shaft'
      if (t1Shaft) { cumShafts += r.team1_total; cumBalls += r.team2_total }
      else         { cumBalls  += r.team1_total; cumShafts += r.team2_total }
    }

    // Skins
    const skinPlayers = allPlayers.filter(p => matches.some((m: Match) => [...m.team1_players, ...m.team2_players].includes(p.name)))
    const skins = buildSkinsSummary(computeSkins(skinPlayers, allScores, course))

    // MVP
    const { data: statsData } = await supabase.from('player_stats').select('player_id, match_points_total, total_net_strokes, total_birdies')
    const mvp = statsData && statsData.length > 0
      ? [...statsData].sort((a, b) => b.match_points_total - a.match_points_total || a.total_net_strokes - b.total_net_strokes || b.total_birdies - a.total_birdies)
          .slice(0, 5).map(s => { const p = allPlayers.find(pl => pl.id === s.player_id); return { name: p?.name ?? '?', first: p?.first_name ?? '?', pts: s.match_points_total } })
      : []

    // Spotlights
    const parData = course.par_data as Record<string, { par: number; handicap: number }>
    const dayPlayers = allPlayers.filter(p => matches.some((m: Match) => [...m.team1_players, ...m.team2_players].includes(p.name)))
    const stats = dayPlayers.map(p => {
      let grossTotal = 0, birdies = 0, eagles = 0, bogeys = 0, doubles = 0, pars = 0
      for (let h = 1; h <= 18; h++) {
        const gs = allScores.find(s => s.player_id === p.id && s.hole_number === h)?.gross_score; if (!gs) continue
        const par = parData[`hole_${h}`]?.par ?? 4; grossTotal += gs; const diff = gs - par
        if (diff <= -2) eagles++; else if (diff === -1) birdies++; else if (diff === 0) pars++; else if (diff === 1) bogeys++; else doubles++
      }
      return { player: p, grossTotal, birdies, eagles, bogeys, doubles, pars }
    }).filter(r => r.grossTotal > 0)

    const dn = (p: Player) => (p as any).nickname || p.first_name || p.name
    const spots: DayData['spotlights'] = []
    const eaglers = stats.filter(r => r.eagles > 0).sort((a, b) => b.eagles - a.eagles)
    if (eaglers[0]) { const e = eaglers[0]; spots.push({ emoji: '🦅', title: 'Eagle Club', player: dn(e.player), stat: `${e.eagles} eagle${e.eagles > 1 ? 's' : ''}`, flavor: e.eagles > 1 ? `${dn(e.player)} is playing like it's a video game. ${e.eagles} eagles today.` : `${dn(e.player)} found the bottom of the cup from distance. Welcome to the Eagle Club.` }) }
    const bl = [...stats].sort((a, b) => b.birdies - a.birdies)[0]
    if (bl && bl.birdies > 0) spots.push({ emoji: '🐦', title: 'Birdie Bird', player: dn(bl.player), stat: `${bl.birdies} birdies`, flavor: bl.birdies >= 4 ? `${dn(bl.player)} was on fire. ${bl.birdies} birdies — the field had no answer.` : `${dn(bl.player)} led the field in birdies with ${bl.birdies}. Take a bow.` })
    const lg = [...stats].sort((a, b) => a.grossTotal - b.grossTotal)[0]
    if (lg) { const tp = lg.grossTotal - 72; spots.push({ emoji: '🏆', title: 'Round of the Day', player: dn(lg.player), stat: `${lg.grossTotal} gross (${tp === 0 ? 'E' : tp > 0 ? `+${tp}` : tp})`, flavor: tp <= 0 ? `${dn(lg.player)} posted the low round at ${tp === 0 ? 'even' : tp}. That's how it's done.` : `${dn(lg.player)} led the field with a ${lg.grossTotal} — not pretty, but it's the best out there.` }) }
    const bk = [...stats].sort((a, b) => b.bogeys - a.bogeys)[0]
    if (bk && bk.bogeys >= 5) spots.push({ emoji: '🚂', title: 'Bogey Machine', player: dn(bk.player), stat: `${bk.bogeys} bogeys`, flavor: `${dn(bk.player)} was consistent today — consistently bogey. ${bk.bogeys} of them. The train never stopped.` })
    const hg = [...stats].sort((a, b) => b.grossTotal - a.grossTotal)[0]
    if (hg && lg && hg.grossTotal > lg.grossTotal + 8) { const tp = hg.grossTotal - 72; spots.push({ emoji: '😬', title: 'Rough Day Award', player: dn(hg.player), stat: `${hg.grossTotal} gross (+${tp})`, flavor: `${dn(hg.player)} had a day to forget. +${tp} and a lot of explaining to do at the bar.` }) }
    const dk = [...stats].sort((a, b) => b.doubles - a.doubles)[0]
    if (dk && dk.doubles >= 3) spots.push({ emoji: '😱', title: 'Double Trouble', player: dn(dk.player), stat: `${dk.doubles} doubles+`, flavor: `${dn(dk.player)} found trouble in bulk today. ${dk.doubles} double bogeys or worse. The course won this round.` })
    const pm = [...stats].sort((a, b) => b.pars - a.pars)[0]
    if (pm && pm.pars >= 12 && lg && pm.player.id !== lg.player.id) spots.push({ emoji: '🤖', title: 'Par Machine', player: dn(pm.player), stat: `${pm.pars} pars`, flavor: `${dn(pm.player)} was the picture of consistency — ${pm.pars} pars. Not spectacular, not disastrous. Just there.` })

    setData({ matchSummaries: summaries, skins, cumulativeShafts: cumShafts, cumulativeBalls: cumBalls, allPlayers, mvp, spotlights: spots })
    setLoading(false)
  }, [day])

  useEffect(() => { loadDay() }, [loadDay])

  if (loading) return <div className="text-center text-gray-400 py-8 text-sm">Loading Day {day}…</div>
  if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Day {day} data unavailable</div>

  const { matchSummaries, skins, cumulativeShafts, cumulativeBalls, allPlayers, mvp, spotlights } = data
  const dayShafts = matchSummaries.reduce((s, m) => s + m.shaftsTotal, 0)
  const dayBalls  = matchSummaries.reduce((s, m) => s + m.ballsTotal,  0)
  const cumLeader = cumulativeShafts > cumulativeBalls
    ? `TEAM SHAFT LEADS ${cumulativeShafts.toFixed(1)} — ${cumulativeBalls.toFixed(1)}`
    : cumulativeBalls > cumulativeShafts
    ? `TEAM BALLS LEADS ${cumulativeBalls.toFixed(1)} — ${cumulativeShafts.toFixed(1)}`
    : `ALL SQUARE — ${cumulativeShafts.toFixed(1)} APIECE`

  return (
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
        <div className="text-center text-sm font-bold text-yellow-400 tracking-widest py-2 bg-yellow-900/20 rounded-lg border border-yellow-800">{cumLeader}</div>
      </section>

      {/* Match Results */}
      <section>
        <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ Day {day} Match Results ━━━</div>
        <div className="space-y-2">
          {matchSummaries.map((ms, i) => {
            const { shaftsTotal: s, ballsTotal: b, match: m } = ms
            const t1Names = m.team1_players.map((n: string) => allPlayers.find(p => p.name === n)?.first_name ?? n)
            const t2Names = m.team2_players.map((n: string) => allPlayers.find(p => p.name === n)?.first_name ?? n)
            const shaftNames = ms.team1IsShafts ? t1Names : t2Names
            const ballNames  = ms.team1IsShafts ? t2Names : t1Names
            const shaftWon = s > b; const ballWon = b > s
            return (
              <div key={m.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-2.5 text-sm">
                <span className="text-gray-500 w-6 shrink-0">G{i+1}</span>
                <span className={`flex-1 ${shaftWon ? 'text-blue-300 font-semibold' : 'text-gray-300'}`}>{shaftNames.join(' & ')}</span>
                <span className="text-xs text-gray-500">vs</span>
                <span className={`flex-1 text-right ${ballWon ? 'text-red-300 font-semibold' : 'text-gray-300'}`}>{ballNames.join(' & ')}</span>
                <span className="text-xs font-bold w-16 text-right">
                  {s === b ? <span className="text-gray-400">HALVED</span>
                   : shaftWon ? <span className="text-blue-400">{s}–{b} S</span>
                   : <span className="text-red-400">{b}–{s} B</span>}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Skins */}
      {skins && (
        <section>
          <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">━━━ Skins — Day {day} ━━━</div>
          <div className="text-center bg-green-900/30 border border-green-800 rounded-lg py-2 mb-3 text-sm">
            <span className="text-green-400 font-bold">$200 pot</span><span className="text-gray-400 mx-2">·</span>
            <span className="text-white">{skins.totalSkinsWon} skins</span><span className="text-gray-400 mx-2">·</span>
            <span className="text-yellow-400 font-bold">${skins.payoutPerSkin.toFixed(2)}/skin</span>
          </div>
          <div className="mb-3">
            <div className="text-xs text-gray-500 uppercase mb-1.5">Gross — {skins.totalGrossWon} won</div>
            {skins.holes.filter(h => h.grossWinner).map(h => {
              const p = allPlayers.find(pl => pl.id === h.grossWinner!.id)
              return (
                <div key={h.hole} className="flex items-center gap-2 text-sm py-1 border-b border-gray-800">
                  <span className="text-gray-500 w-14 shrink-0">Hole {h.hole}</span>
                  <span className="text-green-300 font-semibold flex-1">{p?.first_name ?? h.grossWinner!.name}</span>
                  <span className="text-gray-400">{h.grossScore !== undefined ? scoreLabel(h.grossScore, h.par) : ''} ({h.grossScore})</span>
                  <span className="text-yellow-400 font-bold w-16 text-right">${skins.payoutPerSkin.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
          <div className="mb-3">
            <div className="text-xs text-gray-500 uppercase mb-1.5">Net — {skins.totalNetWon} won</div>
            {skins.holes.filter(h => h.netWinner).map(h => {
              const p = allPlayers.find(pl => pl.id === h.netWinner!.id)
              return (
                <div key={h.hole} className="flex items-center gap-2 text-sm py-1 border-b border-gray-800">
                  <span className="text-gray-500 w-14 shrink-0">Hole {h.hole}</span>
                  <span className="text-[#7dd3e8] font-semibold flex-1">{p?.first_name ?? h.netWinner!.name}</span>
                  <span className="text-gray-400">Net {h.netScore}</span>
                  <span className="text-yellow-400 font-bold w-16 text-right">${skins.payoutPerSkin.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
          {skins.totalSkinsWon > 0 && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase mb-2">Skins Leaders</div>
              {[...Object.values(skins.grossByPlayer).map(e => ({ ...e, type: 'Gross' })), ...Object.values(skins.netByPlayer).map(e => ({ ...e, type: 'Net' }))].sort((a, b) => b.count - a.count).map((e, i) => {
                const p = allPlayers.find(pl => pl.id === e.player.id)
                return (
                  <div key={i} className="flex items-center justify-between text-sm py-0.5">
                    <span className="text-white">{p?.first_name ?? e.player.name}</span>
                    <span className="text-gray-400 text-xs">{e.count} {e.type.toLowerCase()} skin{e.count !== 1 ? 's' : ''}</span>
                    <span className="text-yellow-400 font-bold">${(e.count * skins.payoutPerSkin).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Spotlights */}
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

      {/* MVP */}
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

      <div className="text-center text-xs text-gray-600 border-t border-gray-800 pt-4">
        ABTOW 2026 Open · Official Day {day} Summary · abtow.golf
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PressReleasePage() {
  const [publishedDays, setPublishedDays] = useState<Set<number>>(new Set())
  const [loadingLocks, setLoadingLocks] = useState(true)

  useEffect(() => {
    supabase
      .from('game_day_locks')
      .select('day, locked')
      .eq('game_id', 'press-release')
      .then(({ data }) => {
        const pub = new Set<number>()
        for (const row of data ?? []) {
          if (row.locked === false) pub.add(row.day)
        }
        setPublishedDays(pub)
        setLoadingLocks(false)
      })
  }, [])

  return (
    <Layout>
      <div className="min-h-screen bg-gray-950 text-white p-4 pb-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8 pt-2">
            <div className="text-xs text-gray-500 tracking-widest uppercase mb-1">ABTOW 2026 Open</div>
            <h1 className="text-2xl font-bold tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>📰 Press Release</h1>
            <p className="text-sm text-gray-400 mt-1">Official tournament recaps</p>
          </div>

          {loadingLocks ? (
            <div className="text-center text-gray-500 py-12 text-sm">Loading…</div>
          ) : (
            <div className="space-y-6">
              {[1, 2, 3].map(day => {
                const info = DAY_INFO[day]
                const isPublished = publishedDays.has(day)
                return (
                  <div key={day}>
                    {isPublished ? (
                      <DaySection day={day} />
                    ) : (
                      <div className="bg-gray-900 rounded-2xl p-8 text-center border border-gray-800">
                        <div className="text-4xl mb-3">🔒</div>
                        <div className="text-lg font-bold text-gray-300">Day {day} Press Release</div>
                        <div className="text-sm text-gray-500 mt-1">{info.name} · {info.date}</div>
                        <div className="text-xs text-gray-600 mt-3">Coming soon</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
