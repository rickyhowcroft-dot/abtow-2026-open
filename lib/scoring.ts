export interface Player {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  avatar_url?: string | null;
  avatar_position?: string | null;
  avatar_scale?: number | null;
  team: 'Shaft' | 'Balls';
  raw_handicap: number;
  playing_handicap: number;
  venmo_handle?: string | null;
}

export interface Course {
  id: string;
  name: string;
  day: number;
  tees: string;
  par_data: {
    total_par: number;
    [key: string]: any;
  };
}

export interface Match {
  id: string;
  day: number;
  group_number: number;
  format: string;
  team1_players: string[];
  team2_players: string[];
  course_id: string;
  group_access_token: string;
  course?: Course;
}

export interface Score {
  id?: string;
  match_id: string;
  player_id: string;
  hole_number: number;
  gross_score: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface HoleData {
  par: number;
  handicap: number;
}

export interface PlayerScore extends Player {
  scores: { [hole: number]: number | null };
}

export interface MatchResult {
  match_id: string;
  team1_front: number;
  team1_back: number;
  team1_total: number;
  team2_front: number;
  team2_back: number;
  team2_total: number;
  status: 'upcoming' | 'in_progress' | 'completed';
}

// Calculate net score for a player on a hole
export function calculateNetScore(
  grossScore: number,
  playerHandicap: number,
  holeHandicap: number
): number {
  const strokesReceived = Math.floor(playerHandicap / 18) + 
    (holeHandicap <= (playerHandicap % 18) ? 1 : 0);
  return grossScore - strokesReceived;
}

// Calculate Stableford points from net score and par
export function calculateStablefordPoints(netScore: number, par: number): number {
  const diff = netScore - par;
  if (diff >= 2) return 0; // Double Bogey or worse
  if (diff === 1) return 1; // Bogey
  if (diff === 0) return 2; // Par
  if (diff === -1) return 3; // Birdie
  if (diff === -2) return 4; // Eagle
  if (diff <= -3) return 5; // Albatross or better
  return 0;
}

// Calculate match results for Best Ball format (Day 1)
export function calculateBestBallResults(
  match: Match,
  allScores: Score[],
  players: Player[],
  course: Course
): MatchResult {
  const matchScores = allScores.filter(s => s.match_id === match.id);
  const team1Players = players.filter(p => match.team1_players.includes(p.name));
  const team2Players = players.filter(p => match.team2_players.includes(p.name));
  
  let team1Front = 0, team1Back = 0, team2Front = 0, team2Back = 0;
  
  for (let hole = 1; hole <= 18; hole++) {
    const holeData: HoleData = course.par_data[`hole_${hole}`];
    if (!holeData) continue;
    
    // Get best net score for each team
    let team1Best = Infinity;
    let team2Best = Infinity;
    
    // Team 1
    for (const player of team1Players) {
      const score = matchScores.find(s => s.player_id === player.id && s.hole_number === hole);
      if (score?.gross_score) {
        const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
        team1Best = Math.min(team1Best, netScore);
      }
    }
    
    // Team 2
    for (const player of team2Players) {
      const score = matchScores.find(s => s.player_id === player.id && s.hole_number === hole);
      if (score?.gross_score) {
        const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
        team2Best = Math.min(team2Best, netScore);
      }
    }
    
    // Award point to winning team
    if (team1Best < team2Best) {
      if (hole <= 9) team1Front += 1;
      else team1Back += 1;
    } else if (team2Best < team1Best) {
      if (hole <= 9) team2Front += 1;
      else team2Back += 1;
    } else {
      // Tie - half point each
      if (hole <= 9) {
        team1Front += 0.5;
        team2Front += 0.5;
      } else {
        team1Back += 0.5;
        team2Back += 0.5;
      }
    }
  }
  
  // Calculate total points
  const team1Total = team1Front + team1Back;
  const team2Total = team2Front + team2Back;
  
  // Determine overall match points (3 points total: front, back, overall)
  let finalTeam1 = 0, finalTeam2 = 0;
  
  if (team1Front > team2Front) finalTeam1 += 1;
  else if (team2Front > team1Front) finalTeam2 += 1;
  else { finalTeam1 += 0.5; finalTeam2 += 0.5; }
  
  if (team1Back > team2Back) finalTeam1 += 1;
  else if (team2Back > team1Back) finalTeam2 += 1;
  else { finalTeam1 += 0.5; finalTeam2 += 0.5; }
  
  if (team1Total > team2Total) finalTeam1 += 1;
  else if (team2Total > team1Total) finalTeam2 += 1;
  else { finalTeam1 += 0.5; finalTeam2 += 0.5; }
  
  return {
    match_id: match.id,
    team1_front: finalTeam1 >= 1 ? 1 : (team1Front > team2Front ? 1 : team1Front === team2Front ? 0.5 : 0),
    team1_back: finalTeam1 >= 2 ? 1 : (team1Back > team2Back ? 1 : team1Back === team2Back ? 0.5 : 0),
    team1_total: finalTeam1,
    team2_front: finalTeam2 >= 1 ? 1 : (team2Front > team1Front ? 1 : team2Front === team1Front ? 0.5 : 0),
    team2_back: finalTeam2 >= 2 ? 1 : (team2Back > team1Back ? 1 : team2Back === team1Back ? 0.5 : 0),
    team2_total: finalTeam2,
    status: matchScores.length > 0 ? 'in_progress' : 'upcoming'
  };
}

// Calculate match results for Stableford format (Day 2)
export function calculateStablefordResults(
  match: Match,
  allScores: Score[],
  players: Player[],
  course: Course
): MatchResult {
  const matchScores = allScores.filter(s => s.match_id === match.id);
  const team1Players = players.filter(p => match.team1_players.includes(p.name));
  const team2Players = players.filter(p => match.team2_players.includes(p.name));
  
  let team1FrontPoints = 0, team1BackPoints = 0;
  let team2FrontPoints = 0, team2BackPoints = 0;
  
  for (let hole = 1; hole <= 18; hole++) {
    const holeData: HoleData = course.par_data[`hole_${hole}`];
    if (!holeData) continue;
    
    let team1HolePoints = 0, team2HolePoints = 0;
    
    // Calculate Stableford points for each player
    for (const player of team1Players) {
      const score = matchScores.find(s => s.player_id === player.id && s.hole_number === hole);
      if (score?.gross_score) {
        const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
        team1HolePoints += calculateStablefordPoints(netScore, holeData.par);
      }
    }
    
    for (const player of team2Players) {
      const score = matchScores.find(s => s.player_id === player.id && s.hole_number === hole);
      if (score?.gross_score) {
        const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
        team2HolePoints += calculateStablefordPoints(netScore, holeData.par);
      }
    }
    
    // Add to front or back totals
    if (hole <= 9) {
      team1FrontPoints += team1HolePoints;
      team2FrontPoints += team2HolePoints;
    } else {
      team1BackPoints += team1HolePoints;
      team2BackPoints += team2HolePoints;
    }
  }
  
  // Determine match points
  let finalTeam1 = 0, finalTeam2 = 0;
  
  if (team1FrontPoints > team2FrontPoints) finalTeam1 += 1;
  else if (team2FrontPoints > team1FrontPoints) finalTeam2 += 1;
  else { finalTeam1 += 0.5; finalTeam2 += 0.5; }
  
  if (team1BackPoints > team2BackPoints) finalTeam1 += 1;
  else if (team2BackPoints > team1BackPoints) finalTeam2 += 1;
  else { finalTeam1 += 0.5; finalTeam2 += 0.5; }
  
  const team1Total = team1FrontPoints + team1BackPoints;
  const team2Total = team2FrontPoints + team2BackPoints;
  
  if (team1Total > team2Total) finalTeam1 += 1;
  else if (team2Total > team1Total) finalTeam2 += 1;
  else { finalTeam1 += 0.5; finalTeam2 += 0.5; }
  
  return {
    match_id: match.id,
    team1_front: team1FrontPoints > team2FrontPoints ? 1 : team1FrontPoints === team2FrontPoints ? 0.5 : 0,
    team1_back: team1BackPoints > team2BackPoints ? 1 : team1BackPoints === team2BackPoints ? 0.5 : 0,
    team1_total: finalTeam1,
    team2_front: team2FrontPoints > team1FrontPoints ? 1 : team2FrontPoints === team1FrontPoints ? 0.5 : 0,
    team2_back: team2BackPoints > team1BackPoints ? 1 : team2BackPoints === team1BackPoints ? 0.5 : 0,
    team2_total: finalTeam2,
    status: matchScores.length > 0 ? 'in_progress' : 'upcoming'
  };
}

// Calculate strokes received for individual match play (off low man)
// Returns strokes per hole for the higher handicap player (0 for low man)
export function calculateMatchPlayStrokes(
  playerHandicap: number,
  opponentHandicap: number,
  course: Course
): { [hole: number]: number } {
  const strokes: { [hole: number]: number } = {};
  const delta = playerHandicap - opponentHandicap;
  
  // Initialize all holes to 0
  for (let h = 1; h <= 18; h++) strokes[h] = 0;
  
  // If this player is the low man or equal, they get no strokes
  if (delta <= 0) return strokes;
  
  // Sort holes by handicap index (lowest = hardest = gets strokes first)
  const holesRanked: { hole: number; handicap: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    const hd = course.par_data[`hole_${h}`];
    if (hd) holesRanked.push({ hole: h, handicap: hd.handicap });
  }
  holesRanked.sort((a, b) => a.handicap - b.handicap);
  
  // Distribute strokes: full passes through 18 holes, then remainder
  let remaining = delta;
  while (remaining > 0) {
    for (const hr of holesRanked) {
      if (remaining <= 0) break;
      strokes[hr.hole] += 1;
      remaining--;
    }
  }
  
  return strokes;
}

// Calculate match results for Individual format (Day 3)
export function calculateIndividualResults(
  match: Match,
  allScores: Score[],
  players: Player[],
  course: Course
): MatchResult {
  const matchScores = allScores.filter(s => s.match_id === match.id);
  const team1Players = players.filter(p => match.team1_players.includes(p.name));
  const team2Players = players.filter(p => match.team2_players.includes(p.name));
  
  let totalTeam1Points = 0;
  let totalTeam2Points = 0;
  
  for (let i = 0; i < Math.min(team1Players.length, team2Players.length); i++) {
    const player1 = team1Players[i];
    const player2 = team2Players[i];
    
    // Calculate strokes off low man for each player
    const p1Strokes = calculateMatchPlayStrokes(player1.playing_handicap, player2.playing_handicap, course);
    const p2Strokes = calculateMatchPlayStrokes(player2.playing_handicap, player1.playing_handicap, course);
    
    let p1Front = 0, p1Back = 0, p2Front = 0, p2Back = 0;
    
    for (let hole = 1; hole <= 18; hole++) {
      const p1Score = matchScores.find(s => s.player_id === player1.id && s.hole_number === hole);
      const p2Score = matchScores.find(s => s.player_id === player2.id && s.hole_number === hole);
      
      if (p1Score?.gross_score && p2Score?.gross_score) {
        const p1Net = p1Score.gross_score - p1Strokes[hole];
        const p2Net = p2Score.gross_score - p2Strokes[hole];
        
        if (p1Net < p2Net) {
          if (hole <= 9) p1Front += 1;
          else p1Back += 1;
        } else if (p2Net < p1Net) {
          if (hole <= 9) p2Front += 1;
          else p2Back += 1;
        }
      }
    }
    
    if (p1Front > p2Front) totalTeam1Points += 1;
    else if (p2Front > p1Front) totalTeam2Points += 1;
    else { totalTeam1Points += 0.5; totalTeam2Points += 0.5; }
    
    if (p1Back > p2Back) totalTeam1Points += 1;
    else if (p2Back > p1Back) totalTeam2Points += 1;
    else { totalTeam1Points += 0.5; totalTeam2Points += 0.5; }
    
    const p1Total = p1Front + p1Back;
    const p2Total = p2Front + p2Back;
    
    if (p1Total > p2Total) totalTeam1Points += 1;
    else if (p2Total > p1Total) totalTeam2Points += 1;
    else { totalTeam1Points += 0.5; totalTeam2Points += 0.5; }
  }
  
  return {
    match_id: match.id,
    team1_front: 0,
    team1_back: 0,
    team1_total: totalTeam1Points,
    team2_front: 0,
    team2_back: 0,
    team2_total: totalTeam2Points,
    status: matchScores.length > 0 ? 'in_progress' : 'upcoming'
  };
}