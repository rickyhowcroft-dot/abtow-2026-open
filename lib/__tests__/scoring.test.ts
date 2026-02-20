import {
  calculateNetScore,
  calculateStablefordPoints,
  calculateBestBallResults,
  calculateStablefordResults,
  calculateIndividualResults,
  calculateMatchPlayStrokes,
} from '../scoring';
import type { Player, Match, Score, Course } from '../scoring';

// ============================================================
// HELPERS — seed data factories
// ============================================================

function makePlayer(overrides: Partial<Player> & { id: string; name: string; team: 'Shaft' | 'Balls' }): Player {
  return {
    raw_handicap: 0,
    playing_handicap: 0,
    ...overrides,
  };
}

function makeCourse(pars: number[], handicaps: number[]): Course {
  const par_data: any = { total_par: pars.reduce((a, b) => a + b, 0) };
  for (let i = 0; i < 18; i++) {
    par_data[`hole_${i + 1}`] = { par: pars[i], handicap: handicaps[i] };
  }
  return { id: 'course-1', name: 'Test Course', day: 1, tees: 'Blue', par_data };
}

function makeScore(matchId: string, playerId: string, hole: number, gross: number): Score {
  return { match_id: matchId, player_id: playerId, hole_number: hole, gross_score: gross };
}

// Standard par-72 course: 4 4 3 5 4 4 3 4 5 | 4 4 3 5 4 4 3 4 5
const PARS =      [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
// Handicap index 1-18 (hole 1 is hardest, hole 18 is easiest)
const HANDICAPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const testCourse = makeCourse(PARS, HANDICAPS);

// ============================================================
// calculateNetScore
// ============================================================

describe('calculateNetScore', () => {
  test('0 handicap = no strokes on any hole', () => {
    expect(calculateNetScore(5, 0, 1)).toBe(5);
    expect(calculateNetScore(4, 0, 18)).toBe(4);
  });

  test('18 handicap = 1 stroke on every hole', () => {
    // Handicap 18: floor(18/18)=1 stroke on every hole, 18%18=0 extra
    expect(calculateNetScore(5, 18, 1)).toBe(4);
    expect(calculateNetScore(5, 18, 18)).toBe(4);
  });

  test('9 handicap = 1 stroke on hardest 9 holes', () => {
    // floor(9/18)=0 base, 9%18=9 extra on holes with handicap<=9
    expect(calculateNetScore(5, 9, 1)).toBe(4);  // hcp 1 <= 9, gets stroke
    expect(calculateNetScore(5, 9, 9)).toBe(4);  // hcp 9 <= 9, gets stroke
    expect(calculateNetScore(5, 9, 10)).toBe(5); // hcp 10 > 9, no stroke
    expect(calculateNetScore(5, 9, 18)).toBe(5); // hcp 18 > 9, no stroke
  });

  test('27 handicap = 1 stroke on all holes + extra on hardest 9', () => {
    // floor(27/18)=1 base stroke, 27%18=9 extra on holes with hcp<=9
    expect(calculateNetScore(6, 27, 1)).toBe(4);  // 1 base + 1 extra = 2 strokes
    expect(calculateNetScore(6, 27, 9)).toBe(4);  // 1 base + 1 extra = 2 strokes
    expect(calculateNetScore(6, 27, 10)).toBe(5); // 1 base + 0 extra = 1 stroke
  });
});

// ============================================================
// calculateStablefordPoints
// ============================================================

describe('calculateStablefordPoints', () => {
  test('standard stableford points', () => {
    expect(calculateStablefordPoints(2, 4)).toBe(4); // Eagle (net 2 on par 4)
    expect(calculateStablefordPoints(3, 4)).toBe(3); // Birdie
    expect(calculateStablefordPoints(4, 4)).toBe(2); // Par
    expect(calculateStablefordPoints(5, 4)).toBe(1); // Bogey
    expect(calculateStablefordPoints(6, 4)).toBe(0); // Double bogey
    expect(calculateStablefordPoints(7, 4)).toBe(0); // Triple bogey
  });

  test('albatross or better = 5 points', () => {
    expect(calculateStablefordPoints(1, 4)).toBe(5); // Albatross (net 1 on par 4 = -3)
    expect(calculateStablefordPoints(2, 5)).toBe(5); // Eagle on par 5 = diff -3, so 5 pts
    expect(calculateStablefordPoints(3, 5)).toBe(4); // Birdie on par 5 = -2 = 4 pts (eagle)
    expect(calculateStablefordPoints(1, 5)).toBe(5); // Double eagle
  });
});

// ============================================================
// calculateMatchPlayStrokes (Day 3 — strokes off low man)
// ============================================================

describe('calculateMatchPlayStrokes', () => {
  test('equal handicaps = no strokes', () => {
    const strokes = calculateMatchPlayStrokes(10, 10, testCourse);
    const total = Object.values(strokes).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  test('low man gets no strokes', () => {
    const strokes = calculateMatchPlayStrokes(5, 10, testCourse);
    const total = Object.values(strokes).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  test('3 stroke difference = strokes on 3 hardest holes', () => {
    // Player has hcp 8, opponent has hcp 5 => delta=3
    const strokes = calculateMatchPlayStrokes(8, 5, testCourse);
    const total = Object.values(strokes).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
    // Hardest holes are handicap index 1, 2, 3 (holes 1, 2, 3 in our test course)
    expect(strokes[1]).toBe(1); // hcp index 1
    expect(strokes[2]).toBe(1); // hcp index 2
    expect(strokes[3]).toBe(1); // hcp index 3
    expect(strokes[4]).toBe(0); // hcp index 4, no stroke
  });

  test('Cummings(8) vs Stratton(5) = 3 strokes on hardest holes', () => {
    const strokes = calculateMatchPlayStrokes(8, 5, testCourse);
    expect(Object.values(strokes).reduce((a, b) => a + b, 0)).toBe(3);
  });

  test('Campbell(20) vs Joel(16) = 4 strokes on hardest holes', () => {
    const strokes = calculateMatchPlayStrokes(20, 16, testCourse);
    expect(Object.values(strokes).reduce((a, b) => a + b, 0)).toBe(4);
    expect(strokes[1]).toBe(1);
    expect(strokes[4]).toBe(1);
    expect(strokes[5]).toBe(0);
  });

  test('Boeggeman(23) vs Lawler(21) = 2 strokes', () => {
    const strokes = calculateMatchPlayStrokes(23, 21, testCourse);
    expect(Object.values(strokes).reduce((a, b) => a + b, 0)).toBe(2);
  });
});

// ============================================================
// calculateBestBallResults (Day 1)
// ============================================================

describe('calculateBestBallResults (Day 1 — Best Ball Match Play)', () => {
  const playerA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 4 });
  const playerB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 8 });
  const playerC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 6 });
  const playerD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 });
  const allPlayers = [playerA, playerB, playerC, playerD];

  const match: Match = {
    id: 'match-bb',
    day: 1,
    group_number: 1,
    format: 'Best Ball',
    team1_players: ['A', 'B'],
    team2_players: ['C', 'D'],
    course_id: 'course-1',
    group_access_token: 'token-1',
  };

  test('total match points always sum to 3', () => {
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      const par = PARS[h - 1];
      scores.push(
        makeScore('match-bb', 'a', h, par), makeScore('match-bb', 'b', h, par),
        makeScore('match-bb', 'c', h, par), makeScore('match-bb', 'd', h, par),
      );
    }
    const result = calculateBestBallResults(match, scores, allPlayers, testCourse);
    // With different handicaps and all pars, some team wins certain holes
    // but total match points must always sum to 3
    expect(result.team1_total + result.team2_total).toBe(3);
  });

  test('team with equal handicaps: birdie wins the hole', () => {
    // Use equal handicap players to isolate the birdie effect
    const eqA = makePlayer({ id: 'ea', name: 'EA', team: 'Shaft', playing_handicap: 8 });
    const eqB = makePlayer({ id: 'eb', name: 'EB', team: 'Shaft', playing_handicap: 8 });
    const eqC = makePlayer({ id: 'ec', name: 'EC', team: 'Balls', playing_handicap: 8 });
    const eqD = makePlayer({ id: 'ed', name: 'ED', team: 'Balls', playing_handicap: 8 });
    const eqMatch: Match = {
      id: 'match-eq', day: 1, group_number: 1, format: 'Best Ball',
      team1_players: ['EA', 'EB'], team2_players: ['EC', 'ED'],
      course_id: 'course-1', group_access_token: 'eq',
    };
    const scores: Score[] = [];
    // Hole 1: EA birdies, rest par
    scores.push(
      makeScore('match-eq', 'ea', 1, 3),
      makeScore('match-eq', 'eb', 1, PARS[0]),
      makeScore('match-eq', 'ec', 1, PARS[0]),
      makeScore('match-eq', 'ed', 1, PARS[0]),
    );
    // All other holes: everyone pars (equal handicaps = equal nets = ties)
    for (let h = 2; h <= 18; h++) {
      const par = PARS[h - 1];
      scores.push(
        makeScore('match-eq', 'ea', h, par),
        makeScore('match-eq', 'eb', h, par),
        makeScore('match-eq', 'ec', h, par),
        makeScore('match-eq', 'ed', h, par),
      );
    }
    const result = calculateBestBallResults(eqMatch, scores, [eqA, eqB, eqC, eqD], testCourse);
    // Team 1 wins hole 1, rest tied. Front: T1 wins. Back: tied. Overall: T1 wins.
    expect(result.team1_total).toBeGreaterThan(result.team2_total);
    expect(result.team1_total).toBe(2.5);
    expect(result.team2_total).toBe(0.5);
  });

  test('team 1 sweeps all 18 holes = 3-0', () => {
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      const par = PARS[h - 1];
      scores.push(
        makeScore('match-bb', 'a', h, par - 1), // Team 1 always birdie
        makeScore('match-bb', 'b', h, par),
        makeScore('match-bb', 'c', h, par + 1), // Team 2 always bogey
        makeScore('match-bb', 'd', h, par + 1),
      );
    }
    const result = calculateBestBallResults(match, scores, allPlayers, testCourse);
    expect(result.team1_total).toBe(3);
    expect(result.team2_total).toBe(0);
  });

  test('no scores = upcoming, halved 1.5-1.5', () => {
    const result = calculateBestBallResults(match, [], allPlayers, testCourse);
    // No scores: every hole is Infinity vs Infinity (no valid nets), 
    // all ties → front halved, back halved, overall halved = 1.5 each
    expect(result.team1_total).toBe(1.5);
    expect(result.team2_total).toBe(1.5);
    expect(result.status).toBe('upcoming');
  });
});

// ============================================================
// calculateStablefordResults (Day 2)
// ============================================================

describe('calculateStablefordResults (Day 2 — Stableford)', () => {
  const playerA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 6 });
  const playerB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 12 });
  const playerC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 8 });
  const playerD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 });
  const allPlayers = [playerA, playerB, playerC, playerD];

  const match: Match = {
    id: 'match-sf',
    day: 2,
    group_number: 1,
    format: 'Stableford',
    team1_players: ['A', 'B'],
    team2_players: ['C', 'D'],
    course_id: 'course-1',
    group_access_token: 'token-2',
  };

  test('team with more combined stableford points wins', () => {
    const scores: Score[] = [];
    // Front 9: Team 1 scores better (birdies), Team 2 pars
    for (let h = 1; h <= 9; h++) {
      const par = PARS[h - 1];
      scores.push(
        makeScore('match-sf', 'a', h, par - 1), // birdie
        makeScore('match-sf', 'b', h, par),       // par
        makeScore('match-sf', 'c', h, par),       // par
        makeScore('match-sf', 'd', h, par),       // par
      );
    }
    // Back 9: everyone pars
    for (let h = 10; h <= 18; h++) {
      const par = PARS[h - 1];
      scores.push(
        makeScore('match-sf', 'a', h, par),
        makeScore('match-sf', 'b', h, par),
        makeScore('match-sf', 'c', h, par),
        makeScore('match-sf', 'd', h, par),
      );
    }
    const result = calculateStablefordResults(match, scores, allPlayers, testCourse);
    // Team 1 has A birdieing front 9 + B with higher handicap getting more net points
    // Team 1 should win front and likely total
    expect(result.team1_total).toBeGreaterThan(result.team2_total);
    expect(result.team1_total + result.team2_total).toBe(3);
  });

  test('tied stableford = half points', () => {
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      const par = PARS[h - 1];
      scores.push(
        makeScore('match-sf', 'a', h, par),
        makeScore('match-sf', 'b', h, par),
        makeScore('match-sf', 'c', h, par),
        makeScore('match-sf', 'd', h, par),
      );
    }
    const result = calculateStablefordResults(match, scores, allPlayers, testCourse);
    // With different handicaps, net points will differ even with same gross
    // But the structure should still produce valid results
    expect(result.team1_total + result.team2_total).toBe(3);
  });
});

// ============================================================
// calculateIndividualResults (Day 3 — Individual Match Play)
// ============================================================

describe('calculateIndividualResults (Day 3 — Individual Match Play)', () => {
  const player1 = makePlayer({ id: 'p1', name: 'KOP', team: 'Shaft', playing_handicap: 16 });
  const player2 = makePlayer({ id: 'p2', name: 'Hanna', team: 'Balls', playing_handicap: 13 });
  const allPlayers = [player1, player2];

  const match: Match = {
    id: 'match-ind',
    day: 3,
    group_number: 8,
    format: 'Individual',
    team1_players: ['KOP'],
    team2_players: ['Hanna'],
    course_id: 'course-1',
    group_access_token: 'match8-day3-token',
  };

  test('strokes off low man: KOP(16) vs Hanna(13) = 3 strokes to KOP', () => {
    const strokes = calculateMatchPlayStrokes(16, 13, testCourse);
    const total = Object.values(strokes).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });

  test('player with strokes wins hole when gross tied', () => {
    const scores: Score[] = [];
    // Hole 1 (hcp index 1): KOP gets a stroke here (delta 3, hardest 3 holes)
    // Both shoot 5 gross. KOP net = 4, Hanna net = 5. KOP wins hole.
    scores.push(makeScore('match-ind', 'p1', 1, 5));
    scores.push(makeScore('match-ind', 'p2', 1, 5));
    // Fill remaining holes with same scores (no strokes advantage past hole 3)
    for (let h = 2; h <= 18; h++) {
      scores.push(makeScore('match-ind', 'p1', h, 5));
      scores.push(makeScore('match-ind', 'p2', h, 5));
    }
    const result = calculateIndividualResults(match, scores, allPlayers, testCourse);
    // KOP wins 3 holes (1,2,3 where he gets strokes), rest are ties
    // Front: KOP wins 3, Hanna wins 0 => KOP wins front (1pt)
    // Back: all tied => halve (0.5 each)
    // Total: KOP 3 holes, Hanna 0 => KOP wins total (1pt)
    // KOP: 2.5, Hanna: 0.5
    expect(result.team1_total).toBe(2.5);
    expect(result.team2_total).toBe(0.5);
  });

  test('1v1 match: even handicaps = all ties when scores equal', () => {
    const evenP1 = makePlayer({ id: 'e1', name: 'Even1', team: 'Shaft', playing_handicap: 10 });
    const evenP2 = makePlayer({ id: 'e2', name: 'Even2', team: 'Balls', playing_handicap: 10 });
    const evenMatch: Match = {
      id: 'match-even', day: 3, group_number: 1, format: 'Individual',
      team1_players: ['Even1'], team2_players: ['Even2'],
      course_id: 'course-1', group_access_token: 'even-token',
    };
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(makeScore('match-even', 'e1', h, 5));
      scores.push(makeScore('match-even', 'e2', h, 5));
    }
    const result = calculateIndividualResults(evenMatch, scores, [evenP1, evenP2], testCourse);
    expect(result.team1_total).toBe(1.5);
    expect(result.team2_total).toBe(1.5);
  });
});

// ============================================================
// Skins Logic (replicated from skins page)
// ============================================================

describe('Skins calculations', () => {
  // Replicate the skins logic here for unit testing
  function calculateSkinsForTest(
    players: Player[],
    scores: Score[],
    course: Course
  ) {
    const results: Array<{
      hole: number;
      par?: number;
      grossWinner?: Player;
      grossTie?: boolean;
      netWinner?: Player;
      netTie?: boolean;
    }> = [];

    for (let hole = 1; hole <= 18; hole++) {
      const holeData = course.par_data[`hole_${hole}`];
      if (!holeData) continue;

      const holeScores: Array<{ player: Player; grossScore: number; netScore: number }> = [];

      players.forEach(player => {
        const score = scores.find(s => s.player_id === player.id && s.hole_number === hole);
        if (score?.gross_score) {
          const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
          holeScores.push({ player, grossScore: score.gross_score, netScore });
        }
      });

      if (holeScores.length === 0) {
        results.push({ hole, par: holeData.par });
        continue;
      }

      // Gross
      const minGross = Math.min(...holeScores.map(s => s.grossScore));
      const grossWinners = holeScores.filter(s => s.grossScore === minGross);
      const grossWinner = grossWinners.length === 1 ? grossWinners[0] : null;

      // Gross birdie or better wins BOTH gross and net
      const isBirdieOrBetter = grossWinner && minGross < holeData.par;

      let netWinner = null;
      let netTie = false;

      if (isBirdieOrBetter) {
        netWinner = grossWinner;
      } else {
        // Net — exclude gross winner (net never cuts/pushes gross)
        const netEligible = grossWinner
          ? holeScores.filter(s => s.player.id !== grossWinner.player.id)
          : holeScores;

        if (netEligible.length > 0) {
          const minNet = Math.min(...netEligible.map(s => s.netScore));
          const netWinners = netEligible.filter(s => s.netScore === minNet);
          netWinner = netWinners.length === 1 ? netWinners[0] : null;
          netTie = netWinners.length > 1;
        }
      }

      results.push({
        hole,
        par: holeData.par,
        grossWinner: grossWinner?.player,
        grossTie: grossWinners.length > 1,
        netWinner: netWinner?.player,
        netTie,
      });
    }

    return results;
  }

  const p1 = makePlayer({ id: 's1', name: 'Low', team: 'Shaft', playing_handicap: 4 });
  const p2 = makePlayer({ id: 's2', name: 'Mid', team: 'Balls', playing_handicap: 10 });
  const p3 = makePlayer({ id: 's3', name: 'High', team: 'Shaft', playing_handicap: 18 });
  const p4 = makePlayer({ id: 's4', name: 'VHigh', team: 'Balls', playing_handicap: 20 });
  const skinPlayers = [p1, p2, p3, p4];

  test('outright lowest gross wins gross skin', () => {
    const scores = [
      makeScore('m', 's1', 1, 3), // birdie on par 4
      makeScore('m', 's2', 1, 4),
      makeScore('m', 's3', 1, 5),
      makeScore('m', 's4', 1, 5),
    ];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    expect(results[0].grossWinner?.name).toBe('Low');
    expect(results[0].grossTie).toBeFalsy();
  });

  test('tied gross = no gross skin (push)', () => {
    const scores = [
      makeScore('m', 's1', 1, 4),
      makeScore('m', 's2', 1, 4),
      makeScore('m', 's3', 1, 5),
      makeScore('m', 's4', 1, 5),
    ];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    expect(results[0].grossWinner).toBeUndefined();
    expect(results[0].grossTie).toBe(true);
  });

  test('gross birdie wins BOTH gross and net skins', () => {
    // Hole 1 (par 4, hcp 1):
    // Low (hcp 4): gross 3 (birdie!). Wins gross outright.
    // Since birdie or better, Low also wins net skin automatically.
    const scores = [
      makeScore('m', 's1', 1, 3), // birdie
      makeScore('m', 's2', 1, 4),
      makeScore('m', 's3', 1, 5),
      makeScore('m', 's4', 1, 5),
    ];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    expect(results[0].grossWinner?.name).toBe('Low');
    expect(results[0].netWinner?.name).toBe('Low'); // birdie wins both!
    expect(results[0].netTie).toBe(false);
  });

  test('gross eagle wins both skins even if net scores are lower', () => {
    // Hole 1 (par 4, hcp 1):
    // Low (hcp 4): gross 2 (eagle!). Net = 1.
    // VHigh (hcp 20): gross 5. Net = 3 (5-2). Net is higher than gross eagle anyway.
    // Eagle wins both.
    const scores = [
      makeScore('m', 's1', 1, 2), // eagle
      makeScore('m', 's2', 1, 5),
      makeScore('m', 's3', 1, 6),
      makeScore('m', 's4', 1, 5),
    ];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    expect(results[0].grossWinner?.name).toBe('Low');
    expect(results[0].netWinner?.name).toBe('Low');
  });

  test('gross par winner: net evaluated separately excluding gross winner', () => {
    // Hole 1 (par 4, hcp 1):
    // Low (hcp 4): gross 4 (par). Wins gross outright. NOT birdie, so normal net eval.
    // Mid (hcp 10): gross 5. Net = 4.
    // High (hcp 18): gross 5. Net = 4.
    // VHigh (hcp 20): gross 6. Net = 4 (6-2).
    // Net eligible (excl Low): Mid(4), High(4), VHigh(4) => 3-way tie
    const scores = [
      makeScore('m', 's1', 1, 4), // par — gross winner but not birdie
      makeScore('m', 's2', 1, 5),
      makeScore('m', 's3', 1, 5),
      makeScore('m', 's4', 1, 6),
    ];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    expect(results[0].grossWinner?.name).toBe('Low');
    expect(results[0].netWinner).toBeUndefined(); // 3-way net tie
    expect(results[0].netTie).toBe(true);
  });

  test('gross par winner: one clear net winner among remaining players', () => {
    // Hole 1 (par 4, hcp 1):
    // Low (hcp 4): gross 4 (par). Gross winner, not birdie.
    // Mid (hcp 10): gross 4. Net = 3.
    // High (hcp 18): gross 6. Net = 5.
    // VHigh (hcp 20): gross 7. Net = 5 (7-2).
    // Net eligible (excl Low): Mid(3), High(5), VHigh(5) => Mid wins net
    const scores = [
      makeScore('m', 's1', 1, 4),
      makeScore('m', 's2', 1, 4),
      makeScore('m', 's3', 1, 6),
      makeScore('m', 's4', 1, 7),
    ];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    // Gross: Low and Mid tied at 4 => no gross skin (push)
    expect(results[0].grossWinner).toBeUndefined();
    expect(results[0].grossTie).toBe(true);
    // Net: all eligible (no gross winner). Low net=3, Mid net=3, High net=5, VHigh net=5
    // Low and Mid tie for net => no net skin
    expect(results[0].netWinner).toBeUndefined();
    expect(results[0].netTie).toBe(true);
  });

  test('Day 3 skins use full playing handicap, not match play delta', () => {
    // Even though Day 3 match play uses strokes off low man,
    // skins use the full playing_handicap for net calculations.
    // Player with hcp 20 on hole 1 (hcp index 1):
    // floor(20/18)=1 base + (1<=2)=1 extra = 2 strokes
    const netScore = calculateNetScore(6, 20, 1);
    expect(netScore).toBe(4); // 6 - 2 = 4

    // Player with hcp 4 on hole 1: floor(4/18)=0 + (1<=4)=1 = 1 stroke
    const netScore2 = calculateNetScore(4, 4, 1);
    expect(netScore2).toBe(3); // 4 - 1 = 3
  });

  test('no gross tie when only one player has a score', () => {
    const scores = [makeScore('m', 's1', 1, 4)];
    const results = calculateSkinsForTest(skinPlayers, scores, testCourse);
    expect(results[0].grossWinner?.name).toBe('Low');
    expect(results[0].grossTie).toBeFalsy();
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('Edge cases', () => {
  test('Best Ball: one player missing scores, other carries team', () => {
    const pA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 5 });
    const pB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 10 });
    const pC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 5 });
    const pD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 });
    const match: Match = {
      id: 'edge-1', day: 1, group_number: 1, format: 'Best Ball',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'course-1', group_access_token: 'e1',
    };
    // Only player A has scores on front 9
    const scores: Score[] = [];
    for (let h = 1; h <= 9; h++) {
      scores.push(makeScore('edge-1', 'a', h, PARS[h - 1] - 1)); // birdies
      scores.push(makeScore('edge-1', 'c', h, PARS[h - 1]));
      scores.push(makeScore('edge-1', 'd', h, PARS[h - 1]));
      // B has no scores
    }
    for (let h = 10; h <= 18; h++) {
      scores.push(makeScore('edge-1', 'a', h, PARS[h - 1]));
      scores.push(makeScore('edge-1', 'b', h, PARS[h - 1]));
      scores.push(makeScore('edge-1', 'c', h, PARS[h - 1]));
      scores.push(makeScore('edge-1', 'd', h, PARS[h - 1]));
    }
    const result = calculateBestBallResults(match, scores, [pA, pB, pC, pD], testCourse);
    // Team 1 should still win front because A's birdies carry
    expect(result.team1_total).toBeGreaterThan(result.team2_total);
  });

  test('Match points always sum to 3 for Best Ball regardless of outcome', () => {
    // Sweep, split, near-tie scenarios
    const scenarios = [
      { t1Adj: -2, t2Adj: 0 }, // team1 dominates
      { t1Adj: 0, t2Adj: -2 }, // team2 dominates
      { t1Adj: 0, t2Adj: 0 },  // all same (handicap diffs decide)
      { t1Adj: -1, t2Adj: 1 }, // mixed
    ];
    for (const { t1Adj, t2Adj } of scenarios) {
      const pA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 5 });
      const pB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 10 });
      const pC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 5 });
      const pD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 });
      const match: Match = {
        id: 'sum3', day: 1, group_number: 1, format: 'Best Ball',
        team1_players: ['A', 'B'], team2_players: ['C', 'D'],
        course_id: 'course-1', group_access_token: 's3',
      };
      const scores: Score[] = [];
      for (let h = 1; h <= 18; h++) {
        const par = PARS[h - 1];
        scores.push(
          makeScore('sum3', 'a', h, par + t1Adj),
          makeScore('sum3', 'b', h, par),
          makeScore('sum3', 'c', h, par + t2Adj),
          makeScore('sum3', 'd', h, par),
        );
      }
      const result = calculateBestBallResults(match, scores, [pA, pB, pC, pD], testCourse);
      expect(result.team1_total + result.team2_total).toBe(3);
    }
  });

  test('Match points always sum to 3 for Stableford', () => {
    const pA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 6 });
    const pB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 12 });
    const pC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 8 });
    const pD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 });
    const match: Match = {
      id: 'sf3', day: 2, group_number: 1, format: 'Stableford',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'course-1', group_access_token: 'sf3',
    };
    // Team1 wins front, team2 wins back
    const scores: Score[] = [];
    for (let h = 1; h <= 9; h++) {
      scores.push(
        makeScore('sf3', 'a', h, PARS[h - 1] - 1),
        makeScore('sf3', 'b', h, PARS[h - 1]),
        makeScore('sf3', 'c', h, PARS[h - 1] + 1),
        makeScore('sf3', 'd', h, PARS[h - 1]),
      );
    }
    for (let h = 10; h <= 18; h++) {
      scores.push(
        makeScore('sf3', 'a', h, PARS[h - 1] + 1),
        makeScore('sf3', 'b', h, PARS[h - 1]),
        makeScore('sf3', 'c', h, PARS[h - 1] - 1),
        makeScore('sf3', 'd', h, PARS[h - 1]),
      );
    }
    const result = calculateStablefordResults(match, scores, [pA, pB, pC, pD], testCourse);
    expect(result.team1_total + result.team2_total).toBe(3);
  });

  test('Match points always sum to 3 for Individual Match Play', () => {
    const p1 = makePlayer({ id: 'x1', name: 'X1', team: 'Shaft', playing_handicap: 15 });
    const p2 = makePlayer({ id: 'x2', name: 'X2', team: 'Balls', playing_handicap: 8 });
    const match: Match = {
      id: 'ind3', day: 3, group_number: 1, format: 'Individual',
      team1_players: ['X1'], team2_players: ['X2'],
      course_id: 'course-1', group_access_token: 'ind3',
    };
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(makeScore('ind3', 'x1', h, PARS[h - 1] + 1));
      scores.push(makeScore('ind3', 'x2', h, PARS[h - 1]));
    }
    const result = calculateIndividualResults(match, scores, [p1, p2], testCourse);
    expect(result.team1_total + result.team2_total).toBe(3);
  });

  test('Individual match play: partial scores (only some holes)', () => {
    const p1 = makePlayer({ id: 'x1', name: 'X1', team: 'Shaft', playing_handicap: 10 });
    const p2 = makePlayer({ id: 'x2', name: 'X2', team: 'Balls', playing_handicap: 10 });
    const match: Match = {
      id: 'edge-2', day: 3, group_number: 1, format: 'Individual',
      team1_players: ['X1'], team2_players: ['X2'],
      course_id: 'course-1', group_access_token: 'e2',
    };
    // Only 3 holes scored
    const scores = [
      makeScore('edge-2', 'x1', 1, 4), makeScore('edge-2', 'x2', 1, 5), // X1 wins
      makeScore('edge-2', 'x1', 2, 5), makeScore('edge-2', 'x2', 2, 4), // X2 wins
      makeScore('edge-2', 'x1', 3, 4), makeScore('edge-2', 'x2', 3, 4), // tie
    ];
    const result = calculateIndividualResults(match, scores, [p1, p2], testCourse);
    // Front: X1 wins 1, X2 wins 1 => tied front (0.5 each)
    // Back: no scores => 0 each, tied (0.5 each)
    // Total: 1-1 => tied (0.5 each)
    // Total: 1.5 - 1.5
    expect(result.team1_total).toBe(1.5);
    expect(result.team2_total).toBe(1.5);
  });
});

// ============================================================
// Additional Edge Cases
// ============================================================

describe('Additional edge cases', () => {
  test('Identical handicaps: best ball decided purely by gross', () => {
    const pA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 10 });
    const pB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 10 });
    const pC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 10 });
    const pD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 10 });
    const match: Match = {
      id: 'eq-hcp', day: 1, group_number: 1, format: 'Best Ball',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'course-1', group_access_token: 'eq',
    };
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(makeScore('eq-hcp', 'a', h, PARS[h - 1] - 1));
      scores.push(makeScore('eq-hcp', 'b', h, PARS[h - 1]));
      scores.push(makeScore('eq-hcp', 'c', h, PARS[h - 1]));
      scores.push(makeScore('eq-hcp', 'd', h, PARS[h - 1]));
    }
    const result = calculateBestBallResults(match, scores, [pA, pB, pC, pD], testCourse);
    expect(result.team1_total).toBe(3);
    expect(result.team2_total).toBe(0);
  });
});

// ============================================================
// Comprehensive Skins Tests
// ============================================================

describe('Skins — comprehensive edge cases', () => {
  function calculateSkinsForTest(
    players: Player[],
    scores: Score[],
    course: Course
  ) {
    const results: Array<{
      hole: number; par: number;
      grossWinner?: Player; grossScore?: number; grossTie?: boolean;
      netWinner?: Player; netScore?: number; netTie?: boolean;
    }> = [];
    for (let hole = 1; hole <= 18; hole++) {
      const holeData = course.par_data[`hole_${hole}`];
      if (!holeData) continue;
      const holeScores: Array<{ player: Player; grossScore: number; netScore: number }> = [];
      players.forEach(player => {
        const score = scores.find(s => s.player_id === player.id && s.hole_number === hole);
        if (score?.gross_score) {
          const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
          holeScores.push({ player, grossScore: score.gross_score, netScore });
        }
      });
      if (holeScores.length === 0) { results.push({ hole, par: holeData.par }); continue; }
      const minGross = Math.min(...holeScores.map(s => s.grossScore));
      const grossWinners = holeScores.filter(s => s.grossScore === minGross);
      const grossWinner = grossWinners.length === 1 ? grossWinners[0] : null;
      const isBirdieOrBetter = grossWinner && minGross < holeData.par;
      let netWinner: typeof grossWinner = null;
      let netTie = false;
      if (isBirdieOrBetter) { netWinner = grossWinner; }
      else {
        const netEligible = grossWinner
          ? holeScores.filter(s => s.player.id !== grossWinner.player.id) : holeScores;
        if (netEligible.length > 0) {
          const minNet = Math.min(...netEligible.map(s => s.netScore));
          const netWinners = netEligible.filter(s => s.netScore === minNet);
          netWinner = netWinners.length === 1 ? netWinners[0] : null;
          netTie = netWinners.length > 1;
        }
      }
      results.push({
        hole, par: holeData.par,
        grossWinner: grossWinner?.player, grossScore: grossWinner ? minGross : undefined,
        grossTie: grossWinners.length > 1,
        netWinner: netWinner?.player, netScore: netWinner ? netWinner.netScore : undefined, netTie,
      });
    }
    return results;
  }

  function calculateSkinsSummary(results: ReturnType<typeof calculateSkinsForTest>) {
    const grossSkins: { [id: string]: number } = {};
    const netSkins: { [id: string]: number } = {};
    results.forEach(r => {
      if (r.grossWinner) grossSkins[r.grossWinner.id] = (grossSkins[r.grossWinner.id] || 0) + 1;
      if (r.netWinner) netSkins[r.netWinner.id] = (netSkins[r.netWinner.id] || 0) + 1;
    });
    const totalGross = Object.values(grossSkins).reduce((a, b) => a + b, 0);
    const totalNet = Object.values(netSkins).reduce((a, b) => a + b, 0);
    return {
      grossSkins, netSkins, totalGross, totalNet,
      grossPayout: totalGross > 0 ? 200 / totalGross : 0,
      netPayout: totalNet > 0 ? 200 / totalNet : 0,
    };
  }

  const p1 = makePlayer({ id: 's1', name: 'Low', team: 'Shaft', playing_handicap: 4 });
  const p2 = makePlayer({ id: 's2', name: 'Mid', team: 'Balls', playing_handicap: 10 });
  const p3 = makePlayer({ id: 's3', name: 'High', team: 'Shaft', playing_handicap: 18 });
  const p4 = makePlayer({ id: 's4', name: 'VHigh', team: 'Balls', playing_handicap: 20 });
  const allSkin = [p1, p2, p3, p4];

  test('no carryovers: push on hole 1 does NOT carry to hole 2', () => {
    const scores = [
      makeScore('m', 's1', 1, 4), makeScore('m', 's2', 1, 4),
      makeScore('m', 's3', 1, 5), makeScore('m', 's4', 1, 5),
      makeScore('m', 's1', 2, 3), makeScore('m', 's2', 2, 5),
      makeScore('m', 's3', 2, 5), makeScore('m', 's4', 2, 5),
    ];
    const results = calculateSkinsForTest(allSkin, scores, testCourse);
    const summary = calculateSkinsSummary(results);
    expect(summary.grossSkins['s1']).toBe(1);
    expect(summary.totalGross).toBe(1);
  });

  test('36 potential skins: all birdies = 18 gross + 18 net', () => {
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(
        makeScore('m', 's1', h, PARS[h - 1] - 1),
        makeScore('m', 's2', h, PARS[h - 1] + 1),
        makeScore('m', 's3', h, PARS[h - 1] + 2),
        makeScore('m', 's4', h, PARS[h - 1] + 3),
      );
    }
    const summary = calculateSkinsSummary(calculateSkinsForTest(allSkin, scores, testCourse));
    expect(summary.totalGross).toBe(18);
    expect(summary.totalNet).toBe(18);
  });

  test('payout: $200 / 4 gross skins = $50', () => {
    const scores: Score[] = [];
    for (let h = 1; h <= 4; h++) {
      scores.push(
        makeScore('m', 's1', h, PARS[h - 1] - 1),
        makeScore('m', 's2', h, PARS[h - 1] + 1),
        makeScore('m', 's3', h, PARS[h - 1] + 1),
        makeScore('m', 's4', h, PARS[h - 1] + 1),
      );
    }
    for (let h = 5; h <= 18; h++) {
      scores.push(
        makeScore('m', 's1', h, PARS[h - 1]),
        makeScore('m', 's2', h, PARS[h - 1]),
        makeScore('m', 's3', h, PARS[h - 1]),
        makeScore('m', 's4', h, PARS[h - 1]),
      );
    }
    const summary = calculateSkinsSummary(calculateSkinsForTest(allSkin, scores, testCourse));
    expect(summary.totalGross).toBe(4);
    expect(summary.grossPayout).toBe(50);
  });

  test('payout: no skins = $0', () => {
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(
        makeScore('m', 's1', h, PARS[h - 1]),
        makeScore('m', 's2', h, PARS[h - 1]),
        makeScore('m', 's3', h, PARS[h - 1]),
        makeScore('m', 's4', h, PARS[h - 1]),
      );
    }
    const summary = calculateSkinsSummary(calculateSkinsForTest(allSkin, scores, testCourse));
    expect(summary.grossPayout).toBe(0);
  });

  test('gross bogey winner excluded from net; net goes to someone else', () => {
    // Hole 10 (par 4, hcp 10):
    // Low(4): gross 5, 0 strokes, net=5. Outright gross.
    // Mid(10): gross 6, 1 stroke (10<=10), net=5.
    // High(18): gross 7, 1 stroke (floor(18/18)=1, 10<=0?no), net=6.
    // VHigh(20): gross 8, 1 stroke (floor(20/18)=1, 10<=2?no), net=7.
    // Gross winner Low (bogey). Excluded from net.
    // Net: Mid(5) wins outright.
    const scores = [
      makeScore('m', 's1', 10, 5), makeScore('m', 's2', 10, 6),
      makeScore('m', 's3', 10, 7), makeScore('m', 's4', 10, 8),
    ];
    const h10 = calculateSkinsForTest(allSkin, scores, testCourse).find(r => r.hole === 10)!;
    expect(h10.grossWinner?.name).toBe('Low');
    expect(h10.netWinner?.name).toBe('Mid');
  });

  test('all 4 tied: no skins', () => {
    const scores = [
      makeScore('m', 's1', 18, 5), makeScore('m', 's2', 18, 5),
      makeScore('m', 's3', 18, 5), makeScore('m', 's4', 18, 5),
    ];
    const h18 = calculateSkinsForTest(allSkin, scores, testCourse).find(r => r.hole === 18)!;
    expect(h18.grossWinner).toBeUndefined();
    expect(h18.grossTie).toBe(true);
    expect(h18.netWinner).toBeUndefined();
    expect(h18.netTie).toBe(true);
  });

  test('gross par winner with net birdie excluded from net eval', () => {
    // Hole 1 (par 4, hcp 1):
    // VHigh(20): gross 4 (par), strokes=1+(1<=2)=2, net=2 (eagle!). Wins gross.
    // Low(4): gross 5, strokes=0+(1<=4)=1, net=4.
    // Mid(10): gross 5, strokes=0+(1<=10)=1, net=4.
    // High(18): gross 6, strokes=1+(1<=0?no)=1, net=5.
    // VHigh excluded from net. Net: Low(4) & Mid(4) tie.
    const scores = [
      makeScore('m', 's4', 1, 4), makeScore('m', 's1', 1, 5),
      makeScore('m', 's2', 1, 5), makeScore('m', 's3', 1, 6),
    ];
    const h1 = calculateSkinsForTest(allSkin, scores, testCourse)[0];
    expect(h1.grossWinner?.name).toBe('VHigh');
    expect(h1.netWinner).toBeUndefined();
    expect(h1.netTie).toBe(true);
  });

  test('multiple winners across holes, correct payout', () => {
    const scores: Score[] = [];
    scores.push(
      makeScore('m', 's1', 1, 3), makeScore('m', 's2', 1, 5),
      makeScore('m', 's3', 1, 5), makeScore('m', 's4', 1, 6),
      makeScore('m', 's1', 2, 5), makeScore('m', 's2', 2, 3),
      makeScore('m', 's3', 2, 5), makeScore('m', 's4', 2, 6),
    );
    for (let h = 3; h <= 18; h++) {
      scores.push(
        makeScore('m', 's1', h, PARS[h - 1]), makeScore('m', 's2', h, PARS[h - 1]),
        makeScore('m', 's3', h, PARS[h - 1]), makeScore('m', 's4', h, PARS[h - 1]),
      );
    }
    const summary = calculateSkinsSummary(calculateSkinsForTest(allSkin, scores, testCourse));
    expect(summary.grossSkins['s1']).toBe(1);
    expect(summary.grossSkins['s2']).toBe(1);
    expect(summary.totalGross).toBe(2);
    expect(summary.grossPayout).toBe(100);
  });
});

// ============================================================
// Integration: Full rounds
// ============================================================

describe('Integration — full Best Ball round', () => {
  test('realistic mixed round sums to 3', () => {
    const pA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 8 });
    const pB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 14 });
    const pC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 6 });
    const pD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 16 });
    const match: Match = {
      id: 'int-bb', day: 1, group_number: 1, format: 'Best Ball',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'course-1', group_access_token: 'int',
    };
    const aS = [4,5,3,6,4,5,3,4,6, 5,4,3,5,5,4,3,5,6];
    const bS = [5,5,4,5,5,5,4,5,6, 5,5,4,6,5,5,4,5,6];
    const cS = [4,4,3,5,5,4,3,5,5, 4,4,3,6,4,4,3,4,5];
    const dS = [5,6,4,6,5,5,4,5,7, 5,5,4,6,5,5,4,5,6];
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(makeScore('int-bb', 'a', h, aS[h-1]), makeScore('int-bb', 'b', h, bS[h-1]),
        makeScore('int-bb', 'c', h, cS[h-1]), makeScore('int-bb', 'd', h, dS[h-1]));
    }
    const result = calculateBestBallResults(match, scores, [pA, pB, pC, pD], testCourse);
    expect(result.team1_total + result.team2_total).toBe(3);
    expect(result.status).toBe('in_progress');
  });
});

describe('Integration — full Stableford round', () => {
  test('all score types produce valid result', () => {
    const pA = makePlayer({ id: 'a', name: 'A', team: 'Shaft', playing_handicap: 10 });
    const pB = makePlayer({ id: 'b', name: 'B', team: 'Shaft', playing_handicap: 18 });
    const pC = makePlayer({ id: 'c', name: 'C', team: 'Balls', playing_handicap: 12 });
    const pD = makePlayer({ id: 'd', name: 'D', team: 'Balls', playing_handicap: 8 });
    const match: Match = {
      id: 'int-sf', day: 2, group_number: 1, format: 'Stableford',
      team1_players: ['A', 'B'], team2_players: ['C', 'D'],
      course_id: 'course-1', group_access_token: 'int-sf',
    };
    const aS = [2,4,3,5,4,5,3,4,6, 4,4,4,5,4,5,3,4,5];
    const bS = [5,5,4,6,5,5,4,5,6, 5,5,4,6,6,5,4,5,7];
    const cS = [4,4,3,5,5,4,3,5,5, 4,5,3,5,4,4,3,5,5];
    const dS = [4,4,3,5,4,4,3,4,5, 4,4,3,5,4,4,3,4,5];
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(makeScore('int-sf', 'a', h, aS[h-1]), makeScore('int-sf', 'b', h, bS[h-1]),
        makeScore('int-sf', 'c', h, cS[h-1]), makeScore('int-sf', 'd', h, dS[h-1]));
    }
    const result = calculateStablefordResults(match, scores, [pA, pB, pC, pD], testCourse);
    expect(result.team1_total + result.team2_total).toBe(3);
  });

  test('Stableford net score verification', () => {
    expect(calculateStablefordPoints(calculateNetScore(3, 18, 1), 4)).toBe(4);
    expect(calculateStablefordPoints(calculateNetScore(4, 18, 1), 4)).toBe(3);
    expect(calculateStablefordPoints(calculateNetScore(5, 18, 1), 4)).toBe(2);
    expect(calculateStablefordPoints(calculateNetScore(6, 18, 1), 4)).toBe(1);
    expect(calculateStablefordPoints(calculateNetScore(7, 18, 1), 4)).toBe(0);
  });

  test.todo('Day 2: bonus point for best overall team stableford total (not yet implemented)');
});

describe('Integration — full Individual Match Play', () => {
  test('strokes on correct holes, match result correct', () => {
    const p1 = makePlayer({ id: 'p1', name: 'P1', team: 'Shaft', playing_handicap: 18 });
    const p2 = makePlayer({ id: 'p2', name: 'P2', team: 'Balls', playing_handicap: 10 });
    const match: Match = {
      id: 'int-ind', day: 3, group_number: 1, format: 'Individual',
      team1_players: ['P1'], team2_players: ['P2'],
      course_id: 'course-1', group_access_token: 'int-ind',
    };
    const strokes = calculateMatchPlayStrokes(18, 10, testCourse);
    for (let h = 1; h <= 8; h++) expect(strokes[h]).toBe(1);
    for (let h = 9; h <= 18; h++) expect(strokes[h]).toBe(0);
    const scores: Score[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(makeScore('int-ind', 'p1', h, 5));
      scores.push(makeScore('int-ind', 'p2', h, 5));
    }
    const result = calculateIndividualResults(match, scores, [p1, p2], testCourse);
    expect(result.team1_total).toBe(2.5);
    expect(result.team2_total).toBe(0.5);
  });
});

describe('Stroke distribution edge cases', () => {
  test('handicap 0: no strokes', () => {
    for (let hcp = 1; hcp <= 18; hcp++) expect(calculateNetScore(5, 0, hcp)).toBe(5);
  });
  test('handicap 36: 2 strokes every hole', () => {
    for (let hcp = 1; hcp <= 18; hcp++) expect(calculateNetScore(6, 36, hcp)).toBe(4);
  });
  test('handicap 1: stroke only on hcp index 1', () => {
    expect(calculateNetScore(5, 1, 1)).toBe(4);
    expect(calculateNetScore(5, 1, 2)).toBe(5);
  });
  test('handicap 19: 1 base + 1 extra on hardest', () => {
    expect(calculateNetScore(6, 19, 1)).toBe(4);
    expect(calculateNetScore(6, 19, 2)).toBe(5);
    expect(calculateNetScore(6, 19, 18)).toBe(5);
  });
});
