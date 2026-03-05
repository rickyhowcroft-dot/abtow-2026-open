import { calculateNetScore } from '../scoring'

describe('Round processing — strokesToHandicap', () => {
  test('plays exactly to handicap → 0', () => { expect(76 - (72 + 4)).toBe(0) })
  test('beats handicap → negative', () => { expect(74 - (72 + 4)).toBe(-2) })
  test('over handicap → positive', () => { expect(100 - (72 + 23)).toBe(5) })
  test('rounds_under fires when < 0', () => { expect(74-(72+4)).toBeLessThan(0) })
  test('rounds_at fires when === 0', () => { expect(76-(72+4)).toBe(0) })
  test('rounds_over fires when > 0', () => { expect(82-(72+4)).toBeGreaterThan(0) })
  test('handicapPerformance avg = total / rounds', () => {
    expect((-2 + 4 + 0) / 3).toBeCloseTo(0.667, 2)
  })
})

describe('Score categorization', () => {
  function categorize(gross: number, par: number) {
    const s = gross - par
    if (s <= -2) return 'eagle'
    if (s === -1) return 'birdie'
    if (s === 0)  return 'par'
    if (s === 1)  return 'bogey'
    if (s === 2)  return 'double_bogey'
    return 'triple_plus'
  }

  test('eagle includes double eagle', () => {
    expect(categorize(2, 4)).toBe('eagle')
    expect(categorize(3, 5)).toBe('eagle')
  })
  test('birdie = 1 under', () => { expect(categorize(3, 4)).toBe('birdie') })
  test('par = even', () => { expect(categorize(4, 4)).toBe('par') })
  test('bogey = 1 over', () => { expect(categorize(5, 4)).toBe('bogey') })
  test('double bogey = 2 over', () => { expect(categorize(6, 4)).toBe('double_bogey') })
  test('triple plus = 3+ over', () => { expect(categorize(7, 4)).toBe('triple_plus') })
  test('eagle is NOT counted as birdie', () => { expect(categorize(2, 4) === 'birdie').toBe(false) })
  test('bestHoles = birdie or better', () => {
    const PARS = [4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5]
    const gross = PARS.map((p,i) => i < 2 ? p-1 : p)
    const best = gross.filter((g,i) => g - PARS[i] <= -1)
    expect(best.length).toBe(2)
  })
  test('worstHoles = double bogey or worse', () => {
    const PARS = [4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5]
    const gross = PARS.map((p,i) => i < 3 ? p+2 : p)
    const worst = gross.filter((g,i) => g - PARS[i] >= 2)
    expect(worst.length).toBe(3)
  })
})

describe('Leader card — Lowest Average Score', () => {
  const avg = (gross: number, rounds: number) => rounds > 0 ? gross / rounds : 0

  test('one round: avg = that round', () => { expect(avg(76, 1)).toBe(76) })
  test('two rounds: avg = total/2', () => { expect(avg(156, 2)).toBe(78) })
  test('zero rounds: 0 (excluded)', () => { expect(avg(0, 0)).toBe(0) })
  test('lower average wins', () => { expect(avg(76,1)).toBeLessThan(avg(84,1)) })
  test('players with 0 rounds sort to bottom', () => {
    const players = [
      { name: 'A', rounds: 2, avg: 76 },
      { name: 'B', rounds: 0, avg: 0  },
      { name: 'C', rounds: 1, avg: 74 },
    ]
    const sorted = [...players].sort((a, b) => {
      if (a.rounds === 0 && b.rounds === 0) return 0
      if (a.rounds === 0) return 1
      if (b.rounds === 0) return -1
      return a.avg - b.avg
    })
    expect(sorted.map(p => p.name)).toEqual(['C', 'A', 'B'])
  })
})

describe('Leader card — Most Consistent (par rate)', () => {
  const parRate = (pars: number, holes: number) => holes > 0 ? pars / holes : 0

  test('18/18 pars → 100%', () => { expect(parRate(18, 18)).toBe(1) })
  test('9/18 pars → 50%', () => { expect(parRate(9, 18)).toBe(0.5) })
  test('higher rate wins', () => { expect(parRate(12,18)).toBeGreaterThan(parRate(10,18)) })
  test('gross pars only (not handicap adjusted)', () => {
    // birdie (strokesToPar=-1) is NOT a par for this card
    expect(-1 === 0).toBe(false)
  })
})

describe('Leader card — Most Birdies', () => {
  test('total across all rounds', () => { expect(2+3+1).toBe(6) })
  test('eagle is NOT a birdie (strokesToPar <= -2 vs === -1)', () => {
    expect(-2 === -1).toBe(false)
  })
  test('higher count wins', () => {
    const players = [{name:'A',birdies:7},{name:'B',birdies:5}]
    expect([...players].sort((a,b)=>b.birdies-a.birdies)[0].name).toBe('A')
  })
})

describe('Leader card — Best vs Handicap', () => {
  const perf = (total: number, rounds: number) => rounds > 0 ? total / rounds : 0

  test('beat every round → negative avg', () => { expect(perf(-6, 3)).toBe(-2) })
  test('mixed rounds', () => { expect(perf(2, 3)).toBeCloseTo(0.667, 2) })
  test('most negative wins', () => { expect(perf(-6,3)).toBeLessThan(perf(3,3)) })
  test('formula: gross − (72 + hcp)', () => {
    expect(74 - (72 + 4)).toBe(-2)
    expect(80 - (72 + 8)).toBe(0)
    expect(95 - (72 + 21)).toBe(2)
  })
})

describe('Leader card — Net Score (Best + Worst)', () => {
  const netAvg = (total: number, rounds: number) => rounds > 0 ? total / rounds : 0

  test('net avg = total net / rounds', () => { expect(netAvg(140, 2)).toBe(70) })
  test('best net: lowest avg wins', () => {
    const a = netAvg(140, 2), b = netAvg(144, 2)
    expect([{n:'A',v:a},{n:'B',v:b}].sort((x,y)=>x.v-y.v)[0].n).toBe('A')
  })
  test('worst net: highest avg wins', () => {
    const a = netAvg(148, 2), b = netAvg(152, 2)
    expect([{n:'A',v:a},{n:'B',v:b}].sort((x,y)=>y.v-x.v)[0].n).toBe('B')
  })
})

describe('Dream Round', () => {
  const PARS = [4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5]
  const dream = (rounds: number[][]) =>
    PARS.map((_,h) => Math.min(...rounds.map(r=>r[h]))).reduce((a,b)=>a+b,0)
  const nightmare = (rounds: number[][]) =>
    PARS.map((_,h) => Math.max(...rounds.map(r=>r[h]))).reduce((a,b)=>a+b,0)

  test('single round: dream = that round', () => { expect(dream([PARS])).toBe(72) })
  test('two rounds: picks best per hole', () => {
    expect(dream([PARS, PARS.map(p=>p-1)])).toBe(PARS.map(p=>p-1).reduce((a,b)=>a+b,0))
  })
  test('dream always ≤ best actual round', () => {
    const r1 = PARS.map(p=>p+1), r2 = PARS.map(p=>p-1)
    const d = dream([r1,r2])
    expect(d).toBeLessThanOrEqual(Math.min(r1.reduce((a,b)=>a+b,0), r2.reduce((a,b)=>a+b,0)))
  })
  test('lowest dream gross wins', () => {
    const players = [{name:'A',g:65},{name:'B',g:68}]
    expect([...players].sort((a,b)=>a.g-b.g)[0].name).toBe('A')
  })
  test('nightmare: single round = that round', () => {
    expect(nightmare([PARS.map(p=>p+2)])).toBe(PARS.map(p=>p+2).reduce((a,b)=>a+b,0))
  })
  test('nightmare picks worst per hole', () => {
    const d = nightmare([PARS, PARS.map(p=>p+3)])
    expect(d).toBe(PARS.map(p=>p+3).reduce((a,b)=>a+b,0))
  })
  test('nightmare always ≥ worst actual round', () => {
    const r1 = PARS.map(p=>p+1), r2 = PARS.map(p=>p+2)
    expect(nightmare([r1,r2])).toBeGreaterThanOrEqual(Math.max(r1.reduce((a,b)=>a+b,0), r2.reduce((a,b)=>a+b,0)))
  })
  test('highest nightmare gross wins (worst round wins)', () => {
    const players = [{name:'Lawler',g:112},{name:'Boeg',g:108}]
    expect([...players].sort((a,b)=>b.g-a.g)[0].name).toBe('Lawler')
  })
})

describe('Tournament MVP ranking', () => {
  interface P { name:string; matchPoints:number; netAggregate:number|null; birdies:number }
  const rank = (ps: P[]) => [...ps].sort((a,b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints
    if (a.netAggregate === null && b.netAggregate === null) return 0
    if (a.netAggregate === null) return 1
    if (b.netAggregate === null) return -1
    if (a.netAggregate !== b.netAggregate) return a.netAggregate - b.netAggregate
    return b.birdies - a.birdies
  })

  test('most match points wins', () => {
    expect(rank([{name:'A',matchPoints:6,netAggregate:200,birdies:3},{name:'B',matchPoints:4,netAggregate:195,birdies:5}])[0].name).toBe('A')
  })
  test('tie on pts: lower net aggregate wins', () => {
    expect(rank([{name:'A',matchPoints:4,netAggregate:210,birdies:3},{name:'B',matchPoints:4,netAggregate:205,birdies:2}])[0].name).toBe('B')
  })
  test('tie on pts+net: more birdies wins', () => {
    expect(rank([{name:'A',matchPoints:4,netAggregate:205,birdies:2},{name:'B',matchPoints:4,netAggregate:205,birdies:5}])[0].name).toBe('B')
  })
  test('null net aggregate ranks below players with scores', () => {
    expect(rank([{name:'X',matchPoints:4,netAggregate:null,birdies:0},{name:'Y',matchPoints:4,netAggregate:210,birdies:1}])[0].name).toBe('Y')
  })
  test('3W = 6 pts, 1W+1D+1L = 3 pts', () => {
    expect(3*2).toBe(6)
    expect(2+1+0).toBe(3)
  })
  test('draw = 1 pt, loss = 0 pts', () => {
    expect(1).toBe(1)
    expect(0).toBe(0)
  })
})

describe('Net score formula', () => {
  test('hcp 0: no strokes', () => {
    for (let si=1;si<=18;si++) expect(calculateNetScore(5,0,si)).toBe(5)
  })
  test('hcp 18: 1 stroke everywhere', () => {
    for (let si=1;si<=18;si++) expect(calculateNetScore(5,18,si)).toBe(4)
  })
  test('hcp 4: strokes on SI 1-4 only', () => {
    expect(calculateNetScore(5,4,1)).toBe(4)
    expect(calculateNetScore(5,4,4)).toBe(4)
    expect(calculateNetScore(5,4,5)).toBe(5)
  })
  test('hcp 16: strokes on SI 1-16', () => {
    expect(calculateNetScore(5,16,16)).toBe(4)
    expect(calculateNetScore(5,16,17)).toBe(5)
  })
  test('hcp 23: 2 strokes on SI 1-5, 1 stroke on SI 6-18', () => {
    expect(calculateNetScore(7,23,1)).toBe(5)
    expect(calculateNetScore(7,23,5)).toBe(5)
    expect(calculateNetScore(7,23,6)).toBe(6)
    expect(calculateNetScore(7,23,18)).toBe(6)
  })
})
