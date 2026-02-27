// lib/monte-carlo.ts
// Monte Carlo simulation data — ABTOW 2026 Open
// 5,000 simulations per matchup | Player handicap set: {4,5,8,9,10,11,12,13,16,20,21,23}
// Key: higher hcp wins more often (receives more net strokes)

export interface MatchupOdds {
  playerAHcp: number
  playerBHcp: number
  aWinPct: number   // normalized 0–100, draws excluded
  bWinPct: number
  aMoneyline: number
  bMoneyline: number
}

// [lowerHcp, higherHcp, lowerWin%, higherWin%, draw%]
const RAW_DATA: [number, number, number, number, number][] = [
  [4, 5, 41.64, 52.36, 6.0],
  [4, 8, 25.96, 68.7, 5.34],
  [4, 9, 21.94, 73.56, 4.5],
  [4, 10, 17.44, 78.4, 4.16],
  [4, 11, 15.18, 80.38, 4.44],
  [4, 12, 11.56, 84.88, 3.56],
  [4, 13, 8.84, 88.22, 2.94],
  [4, 16, 3.72, 94.6, 1.68],
  [4, 20, 1.02, 98.44, 0.54],
  [4, 21, 0.8, 98.86, 0.34],
  [4, 23, 0.24, 99.58, 0.18],
  [5, 8, 30.88, 63.66, 5.46],
  [5, 9, 26.76, 67.32, 5.92],
  [5, 10, 22.0, 73.16, 4.84],
  [5, 11, 18.54, 77.38, 4.08],
  [5, 12, 14.96, 81.02, 4.02],
  [5, 13, 11.56, 85.58, 2.86],
  [5, 16, 5.48, 92.36, 2.16],
  [5, 20, 1.34, 98.12, 0.54],
  [5, 21, 1.08, 98.36, 0.56],
  [5, 23, 0.3, 99.44, 0.26],
  [8, 9, 42.18, 51.8, 6.02],
  [8, 10, 35.82, 58.38, 5.8],
  [8, 11, 32.18, 61.82, 6.0],
  [8, 12, 26.12, 68.48, 5.4],
  [8, 13, 22.12, 73.04, 4.84],
  [8, 16, 11.98, 84.56, 3.46],
  [8, 20, 4.14, 94.32, 1.54],
  [8, 21, 3.26, 95.62, 1.12],
  [8, 23, 1.6, 97.56, 0.84],
  [9, 10, 41.16, 52.9, 5.94],
  [9, 11, 36.22, 57.96, 5.82],
  [9, 12, 30.46, 63.72, 5.82],
  [9, 13, 25.98, 69.44, 4.58],
  [9, 16, 14.58, 81.82, 3.6],
  [9, 20, 5.38, 93.0, 1.62],
  [9, 21, 4.16, 94.36, 1.48],
  [9, 23, 1.9, 97.02, 1.08],
  [10, 11, 42.28, 51.16, 6.56],
  [10, 12, 37.1, 57.38, 5.52],
  [10, 13, 31.58, 62.98, 5.44],
  [10, 16, 19.12, 75.98, 4.9],
  [10, 20, 7.22, 90.12, 2.66],
  [10, 21, 5.94, 92.06, 2.0],
  [10, 23, 3.16, 95.62, 1.22],
  [11, 12, 41.92, 52.26, 5.82],
  [11, 13, 35.68, 58.76, 5.56],
  [11, 16, 22.7, 72.88, 4.42],
  [11, 20, 9.42, 87.92, 2.66],
  [11, 21, 7.5, 90.02, 2.48],
  [11, 23, 4.24, 94.18, 1.58],
  [12, 13, 41.14, 53.1, 5.76],
  [12, 16, 27.0, 67.62, 5.38],
  [12, 20, 11.82, 85.2, 2.98],
  [12, 21, 9.64, 87.5, 2.86],
  [12, 23, 5.7, 92.12, 2.18],
  [13, 16, 32.0, 62.8, 5.2],
  [13, 20, 15.26, 80.66, 4.08],
  [13, 21, 13.12, 83.56, 3.32],
  [13, 23, 7.7, 89.66, 2.64],
  [16, 20, 26.1, 68.86, 5.04],
  [16, 21, 22.66, 72.56, 4.78],
  [16, 23, 14.34, 81.96, 3.7],
  [20, 21, 42.6, 51.44, 5.96],
  [20, 23, 33.0, 61.52, 5.48],
  [21, 23, 35.1, 59.1, 5.8],
]

const HCP_SET = [4, 5, 8, 9, 10, 11, 12, 13, 16, 20, 21, 23]

function nearestHcp(hcp: number): number {
  return HCP_SET.reduce((prev, curr) =>
    Math.abs(curr - hcp) < Math.abs(prev - hcp) ? curr : prev
  )
}

function rawToMoneyline(winPct: number): number {
  if (winPct >= 50) {
    return Math.round(-(winPct / (100 - winPct)) * 100 / 5) * 5
  }
  return Math.round(((100 - winPct) / winPct) * 100 / 5) * 5
}

/** 18-hole pre-match odds from Monte Carlo data (snaps to nearest data point). */
export function getOdds(hcpA: number, hcpB: number): MatchupOdds {
  if (hcpA === hcpB) {
    return { playerAHcp: hcpA, playerBHcp: hcpB, aWinPct: 50, bWinPct: 50, aMoneyline: -105, bMoneyline: -105 }
  }
  const nA = nearestHcp(hcpA)
  const nB = nearestHcp(hcpB)
  if (nA === nB) {
    return { playerAHcp: hcpA, playerBHcp: hcpB, aWinPct: 50, bWinPct: 50, aMoneyline: -105, bMoneyline: -105 }
  }
  const lower = Math.min(nA, nB)
  const higher = Math.max(nA, nB)
  const row = RAW_DATA.find(r => r[0] === lower && r[1] === higher)
  if (!row) {
    return { playerAHcp: hcpA, playerBHcp: hcpB, aWinPct: 50, bWinPct: 50, aMoneyline: -105, bMoneyline: -105 }
  }
  const [, , rawLower, rawHigher] = row
  const total = rawLower + rawHigher
  const lowerNorm = (rawLower / total) * 100
  const higherNorm = (rawHigher / total) * 100
  const aIsLower = nA === lower
  const aWinPct = aIsLower ? lowerNorm : higherNorm
  const bWinPct = aIsLower ? higherNorm : lowerNorm
  return {
    playerAHcp: hcpA, playerBHcp: hcpB, aWinPct, bWinPct,
    aMoneyline: rawToMoneyline(aWinPct), bMoneyline: rawToMoneyline(bWinPct),
  }
}

/**
 * 18-hole odds with interpolation + boundary extrapolation.
 * - Within data range (hcp 4–23): linearly interpolates between bracketing data points.
 * - Below hcp 4: extrapolates using the hcp4→hcp5 slope (down to hcp -1).
 * - Above hcp 23: extrapolates using the hcp21→hcp23 slope (up to hcp 28).
 * Ensures every whole-stroke tease step (±5) produces a distinct, meaningful line.
 */
function getOddsSmooth(hcpA: number, hcpB: number): MatchupOdds {
  const minH = HCP_SET[0]                       // 4
  const maxH = HCP_SET[HCP_SET.length - 1]      // 23

  const clampedWin = (aWin: number, base: MatchupOdds): MatchupOdds => {
    const a = Math.max(2, Math.min(98, aWin))
    return { ...base, aWinPct: a, bWinPct: 100 - a, aMoneyline: rawToMoneyline(a), bMoneyline: rawToMoneyline(100 - a) }
  }

  if (hcpA < minH) {
    // Extrapolate below minimum: slope from hcp4 → hcp5
    const base = getOdds(minH, hcpB)
    const next = getOdds(HCP_SET[1], hcpB)
    const slope = (next.aWinPct - base.aWinPct) / (HCP_SET[1] - minH)
    return clampedWin(base.aWinPct + slope * (hcpA - minH), base)
  }

  if (hcpA > maxH) {
    // Extrapolate above maximum: slope from hcp21 → hcp23
    const base = getOdds(maxH, hcpB)
    const prev = getOdds(HCP_SET[HCP_SET.length - 2], hcpB)
    const slope = (base.aWinPct - prev.aWinPct) / (maxH - HCP_SET[HCP_SET.length - 2])
    return clampedWin(base.aWinPct + slope * (hcpA - maxH), base)
  }

  // Within range: interpolate between bracketing data points
  const belowA = [...HCP_SET].filter(h => h <= hcpA).pop() ?? minH
  const aboveA = HCP_SET.find(h => h >= hcpA) ?? maxH
  if (belowA === aboveA) return getOdds(belowA, hcpB)

  const t = (hcpA - belowA) / (aboveA - belowA)
  const lo = getOdds(belowA, hcpB)
  const hi = getOdds(aboveA, hcpB)
  const aWinPct = lo.aWinPct + t * (hi.aWinPct - lo.aWinPct)
  return clampedWin(aWinPct, lo)
}

/**
 * 9-hole odds (front or back).
 * With half the holes, handicap advantage is halved and variance increases.
 * Approximation: win% regresses ~55% toward 50/50 vs 18-hole.
 */
export function getNineHoleOdds(hcpA: number, hcpB: number): MatchupOdds {
  const full = getOdds(hcpA, hcpB)
  const aWinPct = 50 + (full.aWinPct - 50) * 0.55
  const bWinPct = 100 - aWinPct
  return {
    ...full,
    aWinPct,
    bWinPct,
    aMoneyline: rawToMoneyline(aWinPct),
    bMoneyline: rawToMoneyline(bWinPct),
  }
}

/** Best Ball team effective handicap: round(lower×0.6 + higher×0.4) */
export function teamEffectiveHcp(hcps: number[]): number {
  const sorted = [...hcps].sort((a, b) => a - b)
  return Math.round(sorted[0] * 0.6 + sorted[1] * 0.4)
}

/**
 * Stroke-adjusted odds.
 * strokes > 0 = extra strokes given to side A (their effective hcp increases → better odds).
 * strokes < 0 = extra strokes given to side B.
 * Uses the actual MC lookup so adjustments are grounded in simulation data.
 * Range: -5 to +5 whole strokes.
 */
export function teaseOdds(
  hcpA: number,
  hcpB: number,
  strokes: number,
  betType: 'front' | 'back' | 'overall',
): [number, number] {
  const adjA = hcpA + strokes
  // Use smooth interpolation so every stroke step produces a distinct line
  const base = getOddsSmooth(adjA, hcpB)
  if (betType === 'overall') return [base.aMoneyline, base.bMoneyline]
  // 9-hole: regress 55% toward 50/50 (same factor as getNineHoleOdds)
  const aWin = 50 + (base.aWinPct - 50) * 0.55
  const bWin = 100 - aWin
  return [rawToMoneyline(aWin), rawToMoneyline(bWin)]
}

/** @deprecated Use teaseOdds() — this operates on raw moneylines, not stroke math */
export function applyTease(side1Ml: number, side2Ml: number, tease: number): [number, number] {
  const adj1 = Math.round((side1Ml + tease) / 5) * 5
  const adj2 = Math.round((side2Ml - tease) / 5) * 5
  return [adj1, adj2]
}

/** Format moneyline for display: +130, -150, EVEN */
export function formatMoneyline(ml: number): string {
  if (Math.abs(ml) === 100 || Math.abs(ml) === 105) return 'EVEN'
  return ml > 0 ? `+${ml}` : `${ml}`
}

/**
 * Live win probability — Bayesian blend of Monte Carlo prior + current score evidence.
 * @param baseAWinPct  Pre-match win% for side A (0–100)
 * @param aLead        Net strokes side A is ahead (positive = A winning)
 * @param holesPlayed  0 to totalHoles
 * @param totalHoles   9 or 18
 */
export function liveWinProb(
  baseAWinPct: number,
  aLead: number,
  holesPlayed: number,
  totalHoles = 18
): number {
  if (holesPlayed <= 0) return baseAWinPct
  if (holesPlayed >= totalHoles) {
    return aLead > 0 ? 99 : aLead < 0 ? 1 : 50
  }
  const remaining = totalHoles - holesPlayed
  // σ ≈ 1.3 net strokes per hole remaining
  const sigma = Math.sqrt(remaining) * 1.3
  // Normal CDF approximation
  const normCdf = (x: number) => 1 / (1 + Math.exp(-1.7 * x))
  const livePct = normCdf(aLead / sigma) * 100
  // Live evidence weight grows as match progresses; fully dominant after ~40% of holes
  const liveWeight = Math.min(holesPlayed / (totalHoles * 0.4), 1)
  const blended = (1 - liveWeight) * baseAWinPct + liveWeight * livePct
  return Math.max(2, Math.min(98, blended))
}

/** Player name → playing handicap lookup */
export const PLAYER_HCPS: Record<string, number> = {
  Boeggeman: 23, Campbell: 20, Chantra: 9, Cook: 9, Cummings: 8,
  Hallimen: 4, Hanna: 13, Horeth: 10, Howcroft: 11, Joel: 16,
  KOP: 16, Krasinski: 12, Lawler: 21, Leone: 11, Riley: 4,
  Short: 8, Stewart: 8, Stratton: 5, Sturgis: 12, Yurus: 12,
}
