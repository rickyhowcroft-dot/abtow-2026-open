import {
  calculateSettlementSegments,
  calculateNetScore,
  calculateStablefordPoints,
} from '../scoring'
import { teamEffectiveHcp, formatMoneyline } from '../monte-carlo'
import type { Player, Match, Score, Course } from '../scoring'

// ── Helpers ──────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> & { id: string; name: string; team: 'Shaft' | 'Balls' }): Player {
  return { raw_handicap: 0, playing_handicap: 0, ...overrides }
}
function makeCourse(pars: number[], handicaps: number[]): Course {
  const par_data: any = {}
  for (let i = 0; i < 18; i++) {
    par_data[`hole_${i + 1}`] = { par: pars[i], handicap: handicaps[i] }
  }
  return { id: 'c1', name: 'Test', day: 1, tees: 'Blue', par_data }
}
function makeScore(matchId: string, playerId: string, hole: number, gross: number): Score {
  return { match_id: matchId, player_id: playerId, hole_number: hole, gross_score: gross }
}

const PARS      = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
const HANDICAPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
const course    = makeCourse(PARS, HANDICAPS)

// ── Settlement helper (mirrors /api/bets/settle logic) ────────

function settleBet(raw1: number, raw2: number, tease: number): 'side1_won' | 'side2_won' | 'push' {
  const adj1 = raw1 + tease
  if (adj1 > raw2) return 'side1_won'
  if (raw2 > adj1) return 'side2_won'
  return 'push'
}

// ── Best Ball settlement ──────────────────────────────────────

describe('Settlement — Best Ball (Day 1)', () => {
  const p1 = makePlayer({ id: 'a', name: 'Hallimen', team: 'Shaft', playing_handicap: 4  })
  const p2 = makePlayer({ id: 'b', name: 'KOP',      team: 'Shaft', playing_handicap: 16 })
  const p3 = makePlayer({ id: 'c', name: 'Stewart',  team: 'Balls', playing_handicap: 8  })
  const p4 = makePlayer({ id: 'd', name: 'Howcroft', team: 'Balls', playing_handicap: 11 })
  const players = [p1, p2, p3, p4]

  const match: Match = {
    id: 'm1', day: 1, group_number: 3, format: 'Best Ball',
    team1_players: ['Hallimen', 'KOP'],
    team2_players: ['Stewart', 'Howcroft'],
    course_id: 'c1', group_access_token: 'tok',
  }

  function allScores(t1Adj = 0, t2Adj = 0): Score[] {
    const s: Score[] = []
    for (let h = 1; h <= 18; h++) {
      s.push(makeScore('m1', 'a', h, PARS[h-1] + t1Adj))
      s.push(makeScore('m1', 'b', h, PARS[h-1] + 2))     // KOP always double
      s.push(makeScore('m1', 'c', h, PARS[h-1] + t2Adj))
      s.push(makeScore('m1', 'd', h, PARS[h-1] + 2))     // Howcroft always double
    }
    return s
  }

  test('overall = front + back always', () => {
    const segs = calculateSettlementSegments(match, allScores(), players, course)
    expect(segs.team1Overall).toBe(segs.team1Front + segs.team1Back)
    expect(segs.team2Overall).toBe(segs.team2Front + segs.team2Back)
  })

  test('team1 birdies all 18 vs team2 pars → team1 wins 16, team2 gets 2 (tied holes)', () => {
    // Hallimen(hcp4) birdies every hole vs Stewart(hcp8) pars every hole.
    // SI 1–4: both get a stroke (SI <= hcp). Hallimen net = par-2, Stewart net = par-1. Team1 wins (4 holes).
    // SI 5–8: only Stewart gets a stroke (SI 5-8 > hcp4 but <= hcp8). Both net = par-1. TIE — 0.5 each (4 holes).
    // SI 9–18: neither gets a stroke. Hallimen net = par-1, Stewart net = par. Team1 wins (10 holes).
    // team1Overall = 14 + 4×0.5 = 16, team2Overall = 4×0.5 = 2
    const segs = calculateSettlementSegments(match, allScores(-1, 0), players, course)
    expect(segs.team1Overall).toBe(16)
    expect(segs.team2Overall).toBe(2)
  })

  test('team2 birdies all 18 → wins all 18 holes', () => {
    const segs = calculateSettlementSegments(match, allScores(0, -1), players, course)
    expect(segs.team2Overall).toBe(18)
    expect(segs.team1Overall).toBe(0)
  })

  test('split: team1 birdies front, team2 birdies back', () => {
    const s: Score[] = []
    for (let h = 1; h <= 9; h++) {
      s.push(makeScore('m1','a',h, PARS[h-1]-1), makeScore('m1','b',h, PARS[h-1]+2))
      s.push(makeScore('m1','c',h, PARS[h-1]),   makeScore('m1','d',h, PARS[h-1]+2))
    }
    for (let h = 10; h <= 18; h++) {
      s.push(makeScore('m1','a',h, PARS[h-1]),   makeScore('m1','b',h, PARS[h-1]+2))
      s.push(makeScore('m1','c',h, PARS[h-1]-1), makeScore('m1','d',h, PARS[h-1]+2))
    }
    const segs = calculateSettlementSegments(match, s, players, course)
    // Front: Hallimen(hcp4) birdies vs Stewart(hcp8) pars.
    //   SI 1–4: both get stroke → Hallimen net=par-2, Stewart net=par-1. Team1 wins (4).
    //   SI 5–8: only Stewart gets stroke → both net=par-1. TIE 0.5 each (4 holes).
    //   SI 9: neither gets stroke → Hallimen net=par-1, Stewart net=par. Team1 wins (1).
    //   team1Front = 5 + 4×0.5 = 7, team2Front = 4×0.5 = 2
    expect(segs.team1Front).toBe(7)
    // Back: Stewart(hcp8) birdies vs Hallimen(hcp4) pars. SI 10–18 > hcp8 — no strokes.
    //   Stewart net=par-1, Hallimen net=par → Team2 wins all 9.
    expect(segs.team2Back).toBe(9)
    expect(segs.team1Back).toBe(0)
    expect(segs.team2Front).toBe(2)
  })

  test('no scores → all zeros', () => {
    const segs = calculateSettlementSegments(match, [], players, course)
    expect(segs.team1Overall).toBe(0)
    expect(segs.team2Overall).toBe(0)
  })
})

// ── Stableford settlement ─────────────────────────────────────

describe('Settlement — Stableford (Day 2)', () => {
  const p1 = makePlayer({ id: 'a', name: 'Cook',  team: 'Shaft', playing_handicap: 9  })
  const p2 = makePlayer({ id: 'b', name: 'KOP',   team: 'Shaft', playing_handicap: 16 })
  const p3 = makePlayer({ id: 'c', name: 'Riley', team: 'Balls', playing_handicap: 4  })
  const p4 = makePlayer({ id: 'd', name: 'Boeg',  team: 'Balls', playing_handicap: 23 })
  const players = [p1, p2, p3, p4]

  const match: Match = {
    id: 'm2', day: 2, group_number: 1, format: 'Stableford',
    team1_players: ['Cook', 'KOP'],
    team2_players: ['Riley', 'Boeg'],
    course_id: 'c1', group_access_token: 'tok2',
  }

  test('overall = front + back', () => {
    const s: Score[] = []
    for (let h = 1; h <= 18; h++) {
      s.push(makeScore('m2','a',h,PARS[h-1]), makeScore('m2','b',h,PARS[h-1]))
      s.push(makeScore('m2','c',h,PARS[h-1]), makeScore('m2','d',h,PARS[h-1]))
    }
    const segs = calculateSettlementSegments(match, s, players, course)
    expect(segs.team1Overall).toBe(segs.team1Front + segs.team1Back)
    expect(segs.team2Overall).toBe(segs.team2Front + segs.team2Back)
  })

  test('team1 birdies front → higher front pts than team2', () => {
    const s: Score[] = []
    for (let h = 1; h <= 9; h++) {
      s.push(makeScore('m2','a',h,PARS[h-1]-1), makeScore('m2','b',h,PARS[h-1]))
      s.push(makeScore('m2','c',h,PARS[h-1]),   makeScore('m2','d',h,PARS[h-1]))
    }
    for (let h = 10; h <= 18; h++) {
      s.push(makeScore('m2','a',h,PARS[h-1]), makeScore('m2','b',h,PARS[h-1]))
      s.push(makeScore('m2','c',h,PARS[h-1]), makeScore('m2','d',h,PARS[h-1]))
    }
    const segs = calculateSettlementSegments(match, s, players, course)
    expect(segs.team1Front).toBeGreaterThan(segs.team2Front)
  })

  test('stableford uses NET score for points (handicap strokes matter)', () => {
    // Hole 1 (par 4, SI 1):
    // Cook (hcp9): gets stroke (SI1<=9), gross 5 → net 4 → 2 pts (par)
    // Riley (hcp4): gets stroke (SI1<=4), gross 5 → net 4 → 2 pts (par)
    const cookNet  = calculateNetScore(5, 9, 1)   // = 4
    const rileyNet = calculateNetScore(5, 4, 1)   // = 4
    expect(calculateStablefordPoints(cookNet, 4)).toBe(2)
    expect(calculateStablefordPoints(rileyNet, 4)).toBe(2)

    // KOP (hcp16): gross 5, SI1<=16 → net 4 → 2 pts
    const kopNet = calculateNetScore(5, 16, 1)    // = 4
    expect(calculateStablefordPoints(kopNet, 4)).toBe(2)

    // High hcp on hard hole gets more strokes
    // Boeg (hcp23): floor(23/18)=1 + (1<=5)=1 = 2 strokes, gross 5 → net 3 → 3 pts (birdie)
    const boegNet = calculateNetScore(5, 23, 1)   // = 3
    expect(calculateStablefordPoints(boegNet, 4)).toBe(3)
  })
})

// ── Individual settlement ─────────────────────────────────────

describe('Settlement — Individual (Day 3)', () => {
  const p1 = makePlayer({ id: 'a', name: 'KOP',   team: 'Shaft', playing_handicap: 16 })
  const p2 = makePlayer({ id: 'b', name: 'Hanna', team: 'Balls', playing_handicap: 13 })
  const players = [p1, p2]

  const match: Match = {
    id: 'm3', day: 3, group_number: 8, format: 'Individual',
    team1_players: ['KOP'],
    team2_players: ['Hanna'],
    course_id: 'c1', group_access_token: 'tok3',
  }

  test('KOP(16) vs Hanna(13): KOP gets 3 strokes on holes 1,2,3', () => {
    // Both shoot same gross — KOP net wins 3 holes (SI 1,2,3)
    const s: Score[] = []
    for (let h = 1; h <= 18; h++) {
      s.push(makeScore('m3', 'a', h, 5))
      s.push(makeScore('m3', 'b', h, 5))
    }
    const segs = calculateSettlementSegments(match, s, players, course)
    // Holes 1–3 (SI 1–3): KOP gets delta stroke → KOP net=4, Hanna net=5. KOP wins (3 holes).
    // Holes 4–9 (SI 4–9): no delta strokes, both net=5. TIE — 0.5 each (6 holes).
    // team1Front = 3 + 6×0.5 = 6, team2Front = 6×0.5 = 3
    expect(segs.team1Front).toBe(6)
    expect(segs.team2Front).toBe(3)
    // Holes 10–18: no delta strokes, all tied → 0.5 each (9 holes)
    expect(segs.team1Back).toBe(4.5)
    expect(segs.team1Overall).toBe(10.5)
  })

  test('equal handicaps + equal scores = all tied → 9/9 split', () => {
    const ep1 = makePlayer({ id: 'e1', name: 'Even1', team: 'Shaft', playing_handicap: 10 })
    const ep2 = makePlayer({ id: 'e2', name: 'Even2', team: 'Balls', playing_handicap: 10 })
    const em: Match = {
      id: 'me', day: 3, group_number: 1, format: 'Individual',
      team1_players: ['Even1'], team2_players: ['Even2'],
      course_id: 'c1', group_access_token: 'te',
    }
    const s: Score[] = []
    for (let h = 1; h <= 18; h++) {
      s.push(makeScore('me','e1',h,5), makeScore('me','e2',h,5))
    }
    const segs = calculateSettlementSegments(em, s, [ep1,ep2], course)
    expect(segs.team1Overall).toBe(segs.team2Overall) // all tied
  })

  test('overall = front + back', () => {
    const s: Score[] = []
    for (let h = 1; h <= 18; h++) {
      s.push(makeScore('m3','a',h,4), makeScore('m3','b',h,5))
    }
    const segs = calculateSettlementSegments(match, s, players, course)
    expect(segs.team1Overall).toBe(segs.team1Front + segs.team1Back)
    expect(segs.team2Overall).toBe(segs.team2Front + segs.team2Back)
  })
})

// ── Tease application ─────────────────────────────────────────

describe('Tease adjustment', () => {
  test('+1 tease: tied raw → side1_won', () => {
    expect(settleBet(5, 5, 1)).toBe('side1_won')
  })
  test('+0 tease: side2 higher raw → side2_won', () => {
    expect(settleBet(4, 5, 0)).toBe('side2_won')
  })
  test('+0 tease: side1 higher raw → side1_won', () => {
    expect(settleBet(6, 5, 0)).toBe('side1_won')
  })
  test('-2 tease: adj1=3, raw2=5 → side2_won', () => {
    expect(settleBet(5, 5, -2)).toBe('side2_won')
  })
  test('exact push after tease', () => {
    expect(settleBet(7, 5, -2)).toBe('push')   // adj1=5, raw2=5
  })
  test('+3 tease: side1 raw=0, side2 raw=2 → side1_won (0+3>2)', () => {
    expect(settleBet(0, 2, 3)).toBe('side1_won')
  })
  test('tease does not affect side2 raw', () => {
    // tease only adds to side1
    const r1 = settleBet(5, 8, 0)  // side2_won (5 < 8)
    const r2 = settleBet(5, 8, 3)  // push (5+3=8)
    const r3 = settleBet(5, 8, 4)  // side1_won (5+4=9 > 8)
    expect(r1).toBe('side2_won')
    expect(r2).toBe('push')
    expect(r3).toBe('side1_won')
  })
})

// ── Auto-cancellation ─────────────────────────────────────────

describe('Auto-cancellation on match lock', () => {
  test('pending bets cancelled, active bets settled', () => {
    const bets = [
      { id: 'b1', status: 'pending' },
      { id: 'b2', status: 'active'  },
      { id: 'b3', status: 'active'  },
      { id: 'b4', status: 'pending' },
    ]
    const settlements = [
      { betId: 'b2', status: 'side1_won' },
      { betId: 'b3', status: 'push'      },
    ]
    const cancelled = bets.filter(b => b.status === 'pending').map(b => b.id)
    const settled   = settlements.map(s => s.betId)
    expect(cancelled).toEqual(['b1', 'b4'])
    expect(settled).toEqual(['b2', 'b3'])
    expect(settlements.find(s => s.betId === 'b2')?.status).toBe('side1_won')
    expect(settlements.find(s => s.betId === 'b3')?.status).toBe('push')
  })

  test('match with no active bets produces empty settlements array', () => {
    const bets = [
      { id: 'b1', status: 'pending' },
      { id: 'b2', status: 'pending' },
    ]
    const active = bets.filter(b => b.status === 'active')
    expect(active.length).toBe(0)
  })
})

// ── Team effective handicap ───────────────────────────────────

describe('teamEffectiveHcp', () => {
  test('Hallimen(4) + KOP(16) = round(2.4+6.4) = 9', () => {
    expect(teamEffectiveHcp([4, 16])).toBe(9)
  })
  test('Cook(9) + Joel(16) = round(5.4+6.4) = 12', () => {
    expect(teamEffectiveHcp([9, 16])).toBe(12)
  })
  test('Cummings(8) + Lawler(21) = round(4.8+8.4) = 13', () => {
    expect(teamEffectiveHcp([8, 21])).toBe(13)
  })
  test('Riley(4) + Boeggeman(23) = round(2.4+9.2) = 12', () => {
    expect(teamEffectiveHcp([4, 23])).toBe(12)
  })
  test('Short(8) + Leone(11) = round(4.8+4.4) = 9', () => {
    expect(teamEffectiveHcp([8, 11])).toBe(9)
  })
  test('order does not matter', () => {
    expect(teamEffectiveHcp([16, 4])).toBe(teamEffectiveHcp([4, 16]))
    expect(teamEffectiveHcp([21, 8])).toBe(teamEffectiveHcp([8, 21]))
  })
  test('equal handicaps → same value', () => {
    expect(teamEffectiveHcp([10, 10])).toBe(10)
  })
})

// ── Moneyline display ─────────────────────────────────────────

describe('formatMoneyline', () => {
  test('negative ML shown with minus sign', () => {
    expect(formatMoneyline(-150)).toBe('-150')
    expect(formatMoneyline(-200)).toBe('-200')
  })
  test('positive ML shown with plus sign', () => {
    expect(formatMoneyline(130)).toBe('+130')
    expect(formatMoneyline(250)).toBe('+250')
  })
  test('±100 and ±105 shown as EVEN', () => {
    expect(formatMoneyline(-100)).toBe('EVEN')
    expect(formatMoneyline(100)).toBe('EVEN')
    expect(formatMoneyline(-105)).toBe('EVEN')
    expect(formatMoneyline(105)).toBe('EVEN')
  })
})

// ── Integration: full round settlement ───────────────────────

describe('Integration — full round settlement', () => {
  test('Best Ball: team1 wins front, team2 wins back → overall bet could go either way', () => {
    const p1 = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 8  })
    const p2 = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 12 })
    const p3 = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 6  })
    const p4 = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 })
    const m: Match = {
      id: 'mi', day: 1, group_number: 1, format: 'Best Ball',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'c1', group_access_token: 'ti',
    }
    const s: Score[] = []
    for (let h = 1; h <= 9; h++) {
      s.push(makeScore('mi','a',h,PARS[h-1]-1), makeScore('mi','b',h,PARS[h-1]+2))
      s.push(makeScore('mi','c',h,PARS[h-1]+1), makeScore('mi','d',h,PARS[h-1]+2))
    }
    for (let h = 10; h <= 18; h++) {
      s.push(makeScore('mi','a',h,PARS[h-1]+2), makeScore('mi','b',h,PARS[h-1]+2))
      s.push(makeScore('mi','c',h,PARS[h-1]-1), makeScore('mi','d',h,PARS[h-1]+2))
    }
    const segs = calculateSettlementSegments(m, s, [p1,p2,p3,p4], course)
    expect(segs.team1Front).toBeGreaterThan(0)
    expect(segs.team2Back).toBeGreaterThan(0)
    expect(segs.team1Overall + segs.team2Overall).toBeGreaterThan(0)

    // Front bet: side1_won if team1 mapped to side1
    expect(settleBet(segs.team1Front, segs.team2Front, 0)).toBe('side1_won')
    // Back bet: side2_won
    expect(settleBet(segs.team1Back, segs.team2Back, 0)).toBe('side2_won')
  })

  test('Stableford: overall = sum of front + back points', () => {
    const p1 = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 9  })
    const p2 = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 16 })
    const p3 = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 4  })
    const p4 = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 23 })
    const m: Match = {
      id: 'm4', day: 2, group_number: 1, format: 'Stableford',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'c1', group_access_token: 't4',
    }
    const s: Score[] = []
    for (let h = 1; h <= 18; h++) {
      s.push(makeScore('m4','a',h,PARS[h-1]), makeScore('m4','b',h,PARS[h-1]))
      s.push(makeScore('m4','c',h,PARS[h-1]), makeScore('m4','d',h,PARS[h-1]))
    }
    const segs = calculateSettlementSegments(m, s, [p1,p2,p3,p4], course)
    expect(segs.team1Overall).toBe(segs.team1Front + segs.team1Back)
    expect(segs.team2Overall).toBe(segs.team2Front + segs.team2Back)
    expect(segs.team1Overall + segs.team2Overall).toBeGreaterThan(0)
  })
})
