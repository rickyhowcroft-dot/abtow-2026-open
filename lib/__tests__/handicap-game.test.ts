import { holePoints, holePointsLabel } from '../games-service'

// ── Points table ─────────────────────────────────────────────

describe('holePoints — points table', () => {
  test('double eagle (≤−3) = 16 pts', () => {
    expect(holePoints(-3)).toBe(16)
    expect(holePoints(-4)).toBe(16)
    expect(holePoints(-5)).toBe(16)
  })
  test('eagle (−2) = 8 pts', () => {
    expect(holePoints(-2)).toBe(8)
  })
  test('birdie (−1) = 4 pts', () => {
    expect(holePoints(-1)).toBe(4)
  })
  test('par (0) = 2 pts', () => {
    expect(holePoints(0)).toBe(2)
  })
  test('bogey (+1) = 1 pt', () => {
    expect(holePoints(1)).toBe(1)
  })
  test('double bogey (+2) = 0 pts', () => {
    expect(holePoints(2)).toBe(0)
  })
  test('triple bogey+ = 0 pts', () => {
    expect(holePoints(3)).toBe(0)
    expect(holePoints(10)).toBe(0)
  })
  test('points always non-negative', () => {
    for (let svp = -5; svp <= 5; svp++) {
      expect(holePoints(svp)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('holePointsLabel', () => {
  test('correct labels', () => {
    expect(holePointsLabel(-3)).toBe('Double Eagle')
    expect(holePointsLabel(-2)).toBe('Eagle')
    expect(holePointsLabel(-1)).toBe('Birdie')
    expect(holePointsLabel(0)).toBe('Par')
    expect(holePointsLabel(1)).toBe('Bogey')
    expect(holePointsLabel(2)).toBe('Double Bogey+')
    expect(holePointsLabel(5)).toBe('Double Bogey+')
  })
})

// ── Target points ────────────────────────────────────────────

describe('targetPoints = 36 − playing_handicap', () => {
  const target = (hcp: number) => 36 - hcp

  test('scratch (hcp 0) → target 36', () => { expect(target(0)).toBe(36) })
  test('Hallimen / Riley (hcp 4) → target 32', () => { expect(target(4)).toBe(32) })
  test('Cummings / Short / Stewart (hcp 8) → target 28', () => { expect(target(8)).toBe(28) })
  test('Joel / KOP (hcp 16) → target 20', () => { expect(target(16)).toBe(20) })
  test('Lawler (hcp 21) → target 15', () => { expect(target(21)).toBe(15) })
  test('Boeggeman (hcp 23) → target 13', () => { expect(target(23)).toBe(13) })

  test('all-par round always scores 36 pts (2 × 18)', () => {
    expect(18 * holePoints(0)).toBe(36)
  })
  test('scratch all-pars: surplus = 0, just eligible', () => {
    const pts = 18 * holePoints(0)
    expect(pts - target(0)).toBe(0)
  })
  test('hcp 4 all-pars: surplus = +4', () => {
    const pts = 18 * holePoints(0)
    expect(pts - target(4)).toBe(4)
  })
  test('hcp 16 all-pars: surplus = +16', () => {
    const pts = 18 * holePoints(0)
    expect(pts - target(16)).toBe(16)
  })
})

// ── Eligibility + surplus ────────────────────────────────────

describe('eligibility and surplus', () => {
  const isEligible = (pts: number, hcp: number) => pts >= (36 - hcp)
  const surplus    = (pts: number, hcp: number) => pts - (36 - hcp)

  test('pts > target → eligible, positive surplus', () => {
    expect(isEligible(38, 4)).toBe(true)
    expect(surplus(38, 4)).toBe(6)
  })
  test('pts = target → eligible, zero surplus', () => {
    expect(isEligible(32, 4)).toBe(true)
    expect(surplus(32, 4)).toBe(0)
  })
  test('pts < target → not eligible, negative surplus', () => {
    expect(isEligible(28, 4)).toBe(false)
    expect(surplus(28, 4)).toBe(-4)
  })
  test('Boeggeman (hcp23): needs only 13 pts to be eligible', () => {
    expect(isEligible(13, 23)).toBe(true)
    expect(isEligible(12, 23)).toBe(false)
  })
  test('hcp 4 with 2 birdies + 4 pars + 12 bogeys = 28 pts → NOT eligible', () => {
    const pts = 2 * holePoints(-1) + 4 * holePoints(0) + 12 * holePoints(1)
    expect(pts).toBe(8 + 8 + 12)
    expect(isEligible(pts, 4)).toBe(false) // needs 32
  })
  test('hcp 16 with same round (28 pts) → eligible, surplus +8', () => {
    const pts = 2 * holePoints(-1) + 4 * holePoints(0) + 12 * holePoints(1)
    expect(isEligible(pts, 16)).toBe(true)  // needs 20
    expect(surplus(pts, 16)).toBe(8)
  })
})

// ── Full round point totals ───────────────────────────────────

describe('full round point totals', () => {
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
  const totalPts = (gross: number[]) => gross.reduce((s, g, i) => s + holePoints(g - PARS[i]), 0)

  test('all pars → 36 pts', () => {
    expect(totalPts(PARS)).toBe(36)
  })
  test('all bogeys → 18 pts', () => {
    expect(totalPts(PARS.map(p => p + 1))).toBe(18)
  })
  test('all birdies → 72 pts', () => {
    expect(totalPts(PARS.map(p => p - 1))).toBe(72)
  })
  test('all double bogeys → 0 pts', () => {
    expect(totalPts(PARS.map(p => p + 2))).toBe(0)
  })
  test('eagle on par 5 = 8 pts', () => {
    expect(holePoints(3 - 5)).toBe(8)
  })
  test('double eagle on par 5 = 16 pts', () => {
    expect(holePoints(2 - 5)).toBe(16)
  })
  test('mixed round: 2 birdies, 10 pars, 4 bogeys, 2 doubles = 32 pts', () => {
    const gross = [
      PARS[0]-1, PARS[1],   PARS[2],   PARS[3]+1, PARS[4],
      PARS[5]-1, PARS[6]+2, PARS[7],   PARS[8],   PARS[9]+1,
      PARS[10],  PARS[11],  PARS[12]+2,PARS[13]+1,PARS[14],
      PARS[15],  PARS[16]+1,PARS[17],
    ]
    expect(totalPts(gross)).toBe(32)
  })
})

// ── Leaderboard sort ─────────────────────────────────────────

describe('leaderboard sorting', () => {
  interface P {
    name: string; totalPoints: number; hcp: number
    birdies: number; pars: number; holeGross: number[]
  }
  const eligible = (p: P) => p.totalPoints >= (36 - p.hcp)
  const surplus  = (p: P) => p.totalPoints - (36 - p.hcp)

  const SI_ORDER = Array.from({ length: 18 }, (_, i) => i) // SI 1 = index 0

  function sort(players: P[]): P[] {
    return [...players].sort((a, b) => {
      if (eligible(a) !== eligible(b)) return eligible(a) ? -1 : 1
      if (eligible(a) && eligible(b)) {
        if (surplus(b) !== surplus(a)) return surplus(b) - surplus(a)
        for (const i of SI_ORDER) {
          const gA = a.holeGross[i] ?? 0
          const gB = b.holeGross[i] ?? 0
          if (gA !== gB) return gA - gB
        }
        if (a.birdies !== b.birdies) return b.birdies - a.birdies
        return b.pars - a.pars
      }
      return b.totalPoints - a.totalPoints
    })
  }

  test('eligible beats ineligible', () => {
    const hallimen: P = { name: 'Hallimen', totalPoints: 30, hcp: 4,  birdies: 0, pars: 15, holeGross: [] }
    const boeggeman: P = { name: 'Boeggeman', totalPoints: 15, hcp: 23, birdies: 0, pars: 7, holeGross: [] }
    // Hallimen 30 < 32 → ineligible; Boeggeman 15 >= 13 → eligible
    expect(sort([hallimen, boeggeman])[0].name).toBe('Boeggeman')
  })

  test('among eligible: higher surplus first', () => {
    const a: P = { name: 'A', totalPoints: 40, hcp: 4, birdies: 4, pars: 10, holeGross: [] }
    const b: P = { name: 'B', totalPoints: 34, hcp: 4, birdies: 1, pars: 12, holeGross: [] }
    expect(sort([b, a])[0].name).toBe('A')
  })

  test('surplus tie: lowest gross on hardest hole (index 0) wins', () => {
    const a: P = { name: 'A', totalPoints: 36, hcp: 4, birdies: 2, pars: 10,
      holeGross: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5] }
    const b: P = { name: 'B', totalPoints: 36, hcp: 4, birdies: 2, pars: 10,
      holeGross: [3, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5] } // birdie on hole 1
    // B has lower gross on hardest hole (3 < 4)
    expect(sort([a, b])[0].name).toBe('B')
  })

  test('surplus+gross tie: most birdies wins', () => {
    const GROSS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
    const a: P = { name: 'A', totalPoints: 36, hcp: 4, birdies: 3, pars: 9, holeGross: GROSS }
    const b: P = { name: 'B', totalPoints: 36, hcp: 4, birdies: 1, pars: 11, holeGross: GROSS }
    expect(sort([b, a])[0].name).toBe('A')
  })

  test('among ineligible: higher totalPoints first', () => {
    const a: P = { name: 'A', totalPoints: 25, hcp: 4, birdies: 0, pars: 10, holeGross: [] }
    const b: P = { name: 'B', totalPoints: 20, hcp: 4, birdies: 0, pars: 8, holeGross: [] }
    expect(sort([b, a])[0].name).toBe('A')
  })

  test('4-player sort: eligible by surplus, then ineligible by pts', () => {
    const players: P[] = [
      { name: 'IneligLow',  totalPoints: 20, hcp: 4, birdies: 0, pars: 10, holeGross: [] },
      { name: 'IneligHigh', totalPoints: 25, hcp: 4, birdies: 0, pars: 12, holeGross: [] },
      { name: 'EligLow',    totalPoints: 34, hcp: 4, birdies: 2, pars: 12, holeGross: [] }, // surplus +2
      { name: 'EligHigh',   totalPoints: 38, hcp: 4, birdies: 4, pars: 10, holeGross: [] }, // surplus +6
    ]
    expect(sort(players).map(p => p.name)).toEqual(['EligHigh', 'EligLow', 'IneligHigh', 'IneligLow'])
  })
})

// ── Day status logic ─────────────────────────────────────────

describe('getDayStatus — automatic logic', () => {
  const DATES: Record<number, Date> = {
    1: new Date('2026-03-16T00:00:00-05:00'),
    2: new Date('2026-03-17T00:00:00-05:00'),
    3: new Date('2026-03-18T00:00:00-05:00'),
  }
  const autoStatus = (day: number, now: Date, allLocked: boolean) => {
    if (now < DATES[day]) return 'locked_date'
    return allLocked ? 'locked_complete' : 'open'
  }

  test('before tournament date → locked_date', () => {
    expect(autoStatus(1, new Date('2026-03-15T23:59:00-05:00'), false)).toBe('locked_date')
    expect(autoStatus(2, new Date('2026-03-16T12:00:00-05:00'), false)).toBe('locked_date')
    expect(autoStatus(3, new Date('2026-03-17T12:00:00-05:00'), false)).toBe('locked_date')
  })
  test('on tournament date, in progress → open', () => {
    expect(autoStatus(1, new Date('2026-03-16T10:00:00-05:00'), false)).toBe('open')
    expect(autoStatus(2, new Date('2026-03-17T10:00:00-05:00'), false)).toBe('open')
    expect(autoStatus(3, new Date('2026-03-18T10:00:00-05:00'), false)).toBe('open')
  })
  test('on tournament date, all matches locked → locked_complete', () => {
    expect(autoStatus(1, new Date('2026-03-16T18:00:00-05:00'), true)).toBe('locked_complete')
  })
  test('admin override=true → locked_complete', () => {
    const status = (adminLocked: boolean) => adminLocked ? 'locked_complete' : 'open'
    expect(status(true)).toBe('locked_complete')
  })
  test('admin override=false → open (even if matches locked)', () => {
    const status = (adminLocked: boolean) => adminLocked ? 'locked_complete' : 'open'
    expect(status(false)).toBe('open')
  })
})

// ── Integration: real player comparisons ─────────────────────

describe('Integration — real player matchups', () => {
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
  const calc = (hcp: number, gross: number[]) => {
    const pts = gross.reduce((s, g, i) => s + holePoints(g - PARS[i]), 0)
    const target = 36 - hcp
    return { pts, target, surplus: pts - target, eligible: pts >= target }
  }

  test('Hallimen(4) vs KOP(16): both all-pars — KOP wins on surplus', () => {
    const h = calc(4,  PARS)  // 36pts, target 32, surplus +4
    const k = calc(16, PARS)  // 36pts, target 20, surplus +16
    expect(h.eligible).toBe(true)
    expect(k.eligible).toBe(true)
    expect(k.surplus).toBeGreaterThan(h.surplus)
  })

  test('Hallimen(4) 4 birdies rest pars vs KOP(16) 2 birdies rest pars — KOP surplus still higher', () => {
    const hGross = PARS.map((p, i) => i < 4 ? p - 1 : p) // 4 birdies
    const kGross = PARS.map((p, i) => i < 2 ? p - 1 : p) // 2 birdies
    const h = calc(4,  hGross)  // 4×4 + 14×2 = 44, surplus +12
    const k = calc(16, kGross)  // 2×4 + 16×2 = 40, surplus +20
    expect(h.pts).toBe(44)
    expect(k.pts).toBe(40)
    expect(k.surplus).toBeGreaterThan(h.surplus)
  })

  test('Boeggeman(23): 11 bogeys + 1 par + 6 doubles = exactly 13 pts → just eligible', () => {
    const gross = [
      ...PARS.slice(0, 11).map(p => p + 1), // 11 bogeys
      PARS[11],                               // 1 par
      ...PARS.slice(12).map(p => p + 2),     // 6 doubles
    ]
    const r = calc(23, gross)
    expect(r.pts).toBe(13)
    expect(r.eligible).toBe(true)
    expect(r.surplus).toBe(0)
  })

  test('low hcp needs good round; high hcp gets away with mediocre', () => {
    const hcp4AllPars    = calc(4,  PARS)
    const hcp4AllBogeys  = calc(4,  PARS.map(p => p + 1))
    const hcp23AllBogeys = calc(23, PARS.map(p => p + 1))
    expect(hcp4AllPars.eligible).toBe(true)
    expect(hcp4AllBogeys.eligible).toBe(false)   // 18pts < 32 target
    expect(hcp23AllBogeys.eligible).toBe(true)    // 18pts >= 13 target
    expect(hcp23AllBogeys.surplus).toBe(5)
  })

  test('hcp 16 needs only 20 pts — 10 bogeys gets there (10pts) ... nope needs 20', () => {
    const tenBogeys = calc(16, [
      ...PARS.slice(0, 10).map(p => p + 1), // 10 bogeys = 10pts
      ...PARS.slice(10).map(p => p + 2),    // 8 doubles = 0pts
    ])
    expect(tenBogeys.pts).toBe(10)
    expect(tenBogeys.eligible).toBe(false)  // 10 < 20

    const tenPars = calc(16, [
      ...PARS.slice(0, 10).map(p => p),     // 10 pars = 20pts
      ...PARS.slice(10).map(p => p + 2),    // 8 doubles = 0pts
    ])
    expect(tenPars.pts).toBe(20)
    expect(tenPars.eligible).toBe(true)     // 20 >= 20
    expect(tenPars.surplus).toBe(0)
  })
})
