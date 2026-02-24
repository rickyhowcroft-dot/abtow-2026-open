'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import PostRoundProcessor from '@/lib/post-round-processor';
import type { Player, Match, Score, Course } from '@/lib/scoring';
import { calculateMatchPlayStrokes, calculateStablefordPoints, calculateNetScore, calculateBestBallResults, calculateStablefordResults, calculateIndividualResults } from '@/lib/scoring';

const ADMIN_KEY = 'abtow_admin_auth';
const ADMIN_PASSWORD = 'FuckCalder';

export default function ScoreEntry() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = params.token as string;
  
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [scores, setScores] = useState<{ [playerId: string]: { [hole: number]: number | null } }>({});
  const [currentHole, setCurrentHole] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ [playerId: string]: { [hole: number]: boolean } }>({});
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    // Check for admin override: needs both the query param AND a valid admin session
    const params = new URLSearchParams(window.location.search);
    const override = params.get('adminOverride') === '1';
    const hasAdminSession = sessionStorage.getItem(ADMIN_KEY) === ADMIN_PASSWORD;
    if (override && hasAdminSession) setIsAdminMode(true);
    if (token) fetchMatchData();
  }, [token]);

  async function fetchMatchData() {
    try {
      // Fetch match by access token
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('group_access_token', token)
        .single();

      if (matchError) {
        console.error('Match not found:', matchError);
        return;
      }

      setMatch(matchData);

      // Fetch course data
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', matchData.course_id)
        .single();

      if (courseData) setCourse(courseData);

      // Fetch players in this match
      const allPlayerNames = [...matchData.team1_players, ...matchData.team2_players];
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .in('name', allPlayerNames);

      if (playersData) {
        setPlayers(playersData);
        
        // Initialize scores structure
        const initialScores: { [playerId: string]: { [hole: number]: number | null } } = {};
        playersData.forEach(player => {
          initialScores[player.id] = {};
          for (let hole = 1; hole <= 18; hole++) {
            initialScores[player.id][hole] = null;
          }
        });
        setScores(initialScores);

        // Fetch existing scores
        const { data: scoresData } = await supabase
          .from('scores')
          .select('*')
          .eq('match_id', matchData.id);

        if (scoresData) {
          const updatedScores = { ...initialScores };
          scoresData.forEach(score => {
            if (updatedScores[score.player_id]) {
              updatedScores[score.player_id][score.hole_number] = score.gross_score;
            }
          });
          setScores(updatedScores);
        }
      }
    } catch (error) {
      console.error('Error fetching match data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveScore(playerId: string, hole: number, score: number | null) {
    if (!match) return;

    setSaving(true);
    try {
      if (score === null) {
        // Delete score if it exists
        await supabase
          .from('scores')
          .delete()
          .eq('match_id', match.id)
          .eq('player_id', playerId)
          .eq('hole_number', hole);
      } else {
        // Upsert score
        await supabase
          .from('scores')
          .upsert({
            match_id: match.id,
            player_id: playerId,
            hole_number: hole,
            gross_score: score
          }, { onConflict: 'match_id,player_id,hole_number' });

        // Trigger stats processing (non-blocking) — processes when all 18 holes complete
        PostRoundProcessor.checkAndProcessRound(playerId, match.id).catch(err =>
          console.error('Stats processing error:', err)
        );
      }

      // Update local state
      setScores(prev => ({
        ...prev,
        [playerId]: {
          ...prev[playerId],
          [hole]: score
        }
      }));
    } catch (error) {
      console.error('Error saving score:', error);
    } finally {
      setSaving(false);
    }
  }

  function handleScoreInput(playerId: string, value: string) {
    const score = value === '' ? null : parseInt(value);
    if (score !== null && (score < 1 || score > 15)) return; // Reasonable bounds
    
    saveScore(playerId, currentHole, score);
  }

  function goToNextHole() {
    if (currentHole < 18) {
      setCurrentHole(currentHole + 1);
    }
  }

  function goToPreviousHole() {
    if (currentHole > 1) {
      setCurrentHole(currentHole - 1);
    }
  }

  function getHoleData(hole: number) {
    if (!course) return { par: 4, handicap: 1 };
    return course.par_data[`hole_${hole}`] || { par: 4, handicap: 1 };
  }

  function getStrokesOnHole(player: Player, holeNumber: number): number {
    if (!match || !course) return 0;
    
    // Day 3: Individual match play — strokes off low man
    if (match.format === 'Individual') {
      // Find this player's opponent
      const isTeam1 = match.team1_players.includes(player.name);
      const team1Idx = match.team1_players.indexOf(player.name);
      const team2Idx = match.team2_players.indexOf(player.name);
      const opponentName = isTeam1 
        ? match.team2_players[team1Idx] 
        : match.team1_players[team2Idx];
      const opponent = players.find(p => p.name === opponentName);
      if (!opponent) return 0;
      
      const strokeMap = calculateMatchPlayStrokes(player.playing_handicap, opponent.playing_handicap, course);
      return strokeMap[holeNumber] || 0;
    }
    
    // Day 1 & 2: Full handicap strokes
    const holeData = getHoleData(holeNumber);
    const fullStrokes = Math.floor(player.playing_handicap / 18);
    const extra = holeData.handicap <= (player.playing_handicap % 18) ? 1 : 0;
    return fullStrokes + extra;
  }

  function renderStrokeDots(count: number) {
    if (count === 0) return null;
    return (
      <span className="ml-1 inline-flex gap-0.5">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="inline-block w-2 h-2 bg-black rounded-full"></span>
        ))}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl">Loading scorecard...</div>
      </div>
    );
  }

  if (!match || !course) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl text-red-600">Match not found or access denied</div>
      </div>
    );
  }

  // Locked state — admin override bypasses this
  if ((match as any).scores_locked && !isAdminMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 px-6 text-center gap-4">
        <div className="text-5xl">🔒</div>
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>Scores Locked</h2>
        <p className="text-gray-500 max-w-xs">Scoring for this round has been closed by the tournament admin.</p>
        <Link href="/" className="btn-primary mt-2">Back to Leaderboard</Link>
      </div>
    );
  }

  // Admin mode banner
  const AdminBanner = isAdminMode ? (
    <div className="bg-orange-100 border border-orange-300 text-orange-800 text-sm font-medium px-4 py-2 rounded-lg mb-4 text-center">
      ✏️ Admin Override — Editing locked scorecard
    </div>
  ) : null;

  const holeData = getHoleData(currentHole);
  const isFront9 = currentHole <= 9;

  // Calculate current match score
  function getMatchScore() {
    // Build scores array in the format the scoring functions expect
    const scoresArray: Score[] = [];
    Object.entries(scores).forEach(([playerId, holes]) => {
      Object.entries(holes).forEach(([hole, gross]) => {
        if (gross !== null) {
          scoresArray.push({
            id: `${playerId}-${hole}`,
            match_id: match!.id,
            player_id: playerId,
            hole_number: parseInt(hole),
            gross_score: gross,
          } as Score);
        }
      });
    });

    switch (match!.format) {
      case 'Best Ball':
        return calculateBestBallResults(match!, scoresArray, players, course!);
      case 'Stableford':
        return calculateStablefordResults(match!, scoresArray, players, course!);
      case 'Individual':
        return calculateIndividualResults(match!, scoresArray, players, course!);
      default:
        return { team1_front: 0, team1_back: 0, team1_total: 0, team2_front: 0, team2_back: 0, team2_total: 0, status: 'upcoming' as const, match_id: match!.id };
    }
  }

  const matchScore = getMatchScore();
  const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
  const team1Label = team1IsShafts ? 'Shaft' : 'Balls';
  const team2Label = team1IsShafts ? 'Balls' : 'Shaft';
  const team1Color = team1IsShafts ? 'text-blue-600' : 'text-red-600';
  const team2Color = team1IsShafts ? 'text-red-600' : 'text-blue-600';

  return (
    <div className="min-h-screen bg-gray-50">
      {AdminBanner && <div className="px-4 pt-3">{AdminBanner}</div>}
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 py-3">
          <div className="flex justify-center mb-2">
            <Link href="/" className="text-sm font-bold text-white bg-blue-600 px-5 py-2 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm">
              ← Leaderboard
            </Link>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">Group {match.group_number} - Day {match.day}</h1>
            <p className="text-sm text-gray-600">{course.name} ({course.tees})</p>
            <p className="text-xs text-gray-500">{match.format}</p>
          </div>
        </div>
      </div>

      {/* Match Status */}
      <div className="bg-white border-b px-3 py-3">
        {(match.format === 'Best Ball' || match.format === 'Individual') && (() => {
          // Hole-by-hole match play status
          const team1Dot = team1IsShafts ? 'bg-blue-500' : 'bg-red-500';
          const team2Dot = team1IsShafts ? 'bg-red-500' : 'bg-blue-500';

          function getHoleWinner(hole: number): 'team1' | 'team2' | 'tie' | null {
            if (match!.format === 'Best Ball') {
              const t1Players = players.filter(p => match!.team1_players.includes(p.name));
              const t2Players = players.filter(p => match!.team2_players.includes(p.name));
              const t1Nets = t1Players.map(p => {
                const s = scores[p.id]?.[hole];
                return s ? s - getStrokesOnHole(p, hole) : null;
              }).filter(n => n !== null) as number[];
              const t2Nets = t2Players.map(p => {
                const s = scores[p.id]?.[hole];
                return s ? s - getStrokesOnHole(p, hole) : null;
              }).filter(n => n !== null) as number[];
              if (t1Nets.length === 0 || t2Nets.length === 0) return null;
              const best1 = Math.min(...t1Nets);
              const best2 = Math.min(...t2Nets);
              if (best1 < best2) return 'team1';
              if (best2 < best1) return 'team2';
              return 'tie';
            } else {
              // Individual match play
              const t1Players = players.filter(p => match!.team1_players.includes(p.name));
              const t2Players = players.filter(p => match!.team2_players.includes(p.name));
              const p1 = t1Players[0], p2 = t2Players[0];
              if (!p1 || !p2) return null;
              const s1 = scores[p1.id]?.[hole], s2 = scores[p2.id]?.[hole];
              if (!s1 || !s2) return null;
              const n1 = s1 - getStrokesOnHole(p1, hole);
              const n2 = s2 - getStrokesOnHole(p2, hole);
              if (n1 < n2) return 'team1';
              if (n2 < n1) return 'team2';
              return 'tie';
            }
          }

          const frontNine = [1,2,3,4,5,6,7,8,9];
          const backNine = [10,11,12,13,14,15,16,17,18];
          let frontT1 = 0, frontT2 = 0, backT1 = 0, backT2 = 0;
          frontNine.forEach(h => { const w = getHoleWinner(h); if (w === 'team1') frontT1++; if (w === 'team2') frontT2++; });
          backNine.forEach(h => { const w = getHoleWinner(h); if (w === 'team1') backT1++; if (w === 'team2') backT2++; });

          return (
            <div>
              {/* Points summary */}
              <div className="flex justify-center items-center gap-4 mb-2">
                <div className={`text-sm font-bold ${team1Color}`}>{team1Label}</div>
                <div className="text-center px-3 py-1 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold">
                    <span className={team1Color}>{matchScore.team1_total}</span>
                    <span className="text-gray-400 mx-1">-</span>
                    <span className={team2Color}>{matchScore.team2_total}</span>
                  </div>
                </div>
                <div className={`text-sm font-bold ${team2Color}`}>{team2Label}</div>
              </div>
              {/* Hole-by-hole dots */}
              {/* Running match status */}
              <div className="space-y-1">
                <div className="flex items-center gap-0.5 justify-center">
                  <span className="text-[9px] text-gray-400 w-6 text-right mr-1">F</span>
                  {frontNine.map(h => {
                    const w = getHoleWinner(h);
                    const isCurrent = h === currentHole;
                    // Calculate running status through this hole
                    let t1W = 0, t2W = 0;
                    for (let i = 1; i <= h; i++) { const r = getHoleWinner(i); if (r === 'team1') t1W++; if (r === 'team2') t2W++; }
                    const diff = t1W - t2W;
                    const statusLabel = w === null ? null : diff === 0 ? 'AS' : diff > 0 ? `${diff}UP` : `${Math.abs(diff)}UP`;
                    const statusColor = diff === 0 ? 'text-gray-500' : diff > 0 ? (team1IsShafts ? 'text-blue-600' : 'text-red-600') : (team1IsShafts ? 'text-red-600' : 'text-blue-600');
                    return (
                      <div key={h} className={`w-5 h-5 flex items-center justify-center rounded ${isCurrent ? 'ring-2 ring-gray-400' : ''}`}>
                        {w === null ? <span className="text-[9px] text-gray-300">{h}</span> :
                         <span className={`text-[7px] font-bold ${statusColor}`}>{statusLabel}</span>}
                      </div>
                    );
                  })}
                  <span className="text-[9px] font-bold text-gray-500 ml-1">{frontT1}-{frontT2}</span>
                </div>
                <div className="flex items-center gap-0.5 justify-center">
                  <span className="text-[9px] text-gray-400 w-6 text-right mr-1">B</span>
                  {backNine.map(h => {
                    const w = getHoleWinner(h);
                    const isCurrent = h === currentHole;
                    let t1W = 0, t2W = 0;
                    for (let i = 1; i <= h; i++) { const r = getHoleWinner(i); if (r === 'team1') t1W++; if (r === 'team2') t2W++; }
                    const diff = t1W - t2W;
                    const statusLabel = w === null ? null : diff === 0 ? 'AS' : diff > 0 ? `${diff}UP` : `${Math.abs(diff)}UP`;
                    const statusColor = diff === 0 ? 'text-gray-500' : diff > 0 ? (team1IsShafts ? 'text-blue-600' : 'text-red-600') : (team1IsShafts ? 'text-red-600' : 'text-blue-600');
                    return (
                      <div key={h} className={`w-5 h-5 flex items-center justify-center rounded ${isCurrent ? 'ring-2 ring-gray-400' : ''}`}>
                        {w === null ? <span className="text-[9px] text-gray-300">{h}</span> :
                         <span className={`text-[7px] font-bold ${statusColor}`}>{statusLabel}</span>}
                      </div>
                    );
                  })}
                  <span className="text-[9px] font-bold text-gray-500 ml-1">{backT1}-{backT2}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {match.format === 'Stableford' && (() => {
          // Cumulative stableford points per team through each hole
          const t1Players = players.filter(p => match!.team1_players.includes(p.name));
          const t2Players = players.filter(p => match!.team2_players.includes(p.name));

          function teamPtsForHole(teamPlayers: Player[], hole: number): number {
            let pts = 0;
            teamPlayers.forEach(p => {
              const s = scores[p.id]?.[hole];
              if (s) {
                const net = s - getStrokesOnHole(p, hole);
                const hd = getHoleData(hole);
                pts += calculateStablefordPoints(net, hd.par);
              }
            });
            return pts;
          }

          let cumT1 = 0, cumT2 = 0;
          const holesPlayed: { hole: number; t1Hole: number; t2Hole: number; t1Cum: number; t2Cum: number }[] = [];
          for (let h = 1; h <= 18; h++) {
            const t1Hole = teamPtsForHole(t1Players, h);
            const t2Hole = teamPtsForHole(t2Players, h);
            cumT1 += t1Hole;
            cumT2 += t2Hole;
            holesPlayed.push({ hole: h, t1Hole, t2Hole, t1Cum: cumT1, t2Cum: cumT2 });
          }

          const frontNine = holesPlayed.slice(0, 9);
          const backNine = holesPlayed.slice(9, 18);
          const frontT1 = frontNine[8]?.t1Cum || 0;
          const frontT2 = frontNine[8]?.t2Cum || 0;
          const backT1 = (holesPlayed[17]?.t1Cum || 0) - frontT1;
          const backT2 = (holesPlayed[17]?.t2Cum || 0) - frontT2;
          const totalT1 = holesPlayed[17]?.t1Cum || 0;
          const totalT2 = holesPlayed[17]?.t2Cum || 0;

          return (
            <div>
              {/* Points summary */}
              <div className="flex justify-center items-center gap-4 mb-2">
                <div className={`text-sm font-bold ${team1Color}`}>{team1Label}</div>
                <div className="text-center px-3 py-1 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold">
                    <span className={team1Color}>{totalT1}</span>
                    <span className="text-gray-400 mx-1">-</span>
                    <span className={team2Color}>{totalT2}</span>
                  </div>
                  <div className="text-[9px] text-gray-400">Stableford Pts</div>
                </div>
                <div className={`text-sm font-bold ${team2Color}`}>{team2Label}</div>
              </div>
              {/* Per-hole points (shows this hole's pts, totals at end of each nine) */}
              <div className="space-y-1">
                <div className="flex items-center gap-0.5 justify-center">
                  <span className="text-[9px] text-gray-400 w-6 text-right mr-1">F</span>
                  {frontNine.map(({ hole, t1Hole, t2Hole }) => {
                    const isCurrent = hole === currentHole;
                    const hasScores = t1Hole > 0 || t2Hole > 0;
                    const leader = t1Hole > t2Hole ? 'team1' : t2Hole > t1Hole ? 'team2' : 'tie';
                    const dotColor = team1IsShafts
                      ? (leader === 'team1' ? 'text-blue-600' : leader === 'team2' ? 'text-red-600' : 'text-gray-400')
                      : (leader === 'team1' ? 'text-red-600' : leader === 'team2' ? 'text-blue-600' : 'text-gray-400');
                    return (
                      <div key={hole} className={`w-7 h-5 flex items-center justify-center rounded ${isCurrent ? 'ring-2 ring-gray-400' : ''}`}>
                        {!hasScores ? <span className="text-[9px] text-gray-300">{hole}</span> :
                         <span className={`text-[9px] font-bold ${dotColor}`}>{t1Hole}-{t2Hole}</span>}
                      </div>
                    );
                  })}
                  <span className="text-[9px] font-bold text-gray-500 ml-1">{frontT1}-{frontT2}</span>
                </div>
                <div className="flex items-center gap-0.5 justify-center">
                  <span className="text-[9px] text-gray-400 w-6 text-right mr-1">B</span>
                  {backNine.map(({ hole, t1Hole, t2Hole }) => {
                    const isCurrent = hole === currentHole;
                    const hasScores = t1Hole > 0 || t2Hole > 0;
                    const leader = t1Hole > t2Hole ? 'team1' : t2Hole > t1Hole ? 'team2' : 'tie';
                    const dotColor = team1IsShafts
                      ? (leader === 'team1' ? 'text-blue-600' : leader === 'team2' ? 'text-red-600' : 'text-gray-400')
                      : (leader === 'team1' ? 'text-red-600' : leader === 'team2' ? 'text-blue-600' : 'text-gray-400');
                    return (
                      <div key={hole} className={`w-7 h-5 flex items-center justify-center rounded ${isCurrent ? 'ring-2 ring-gray-400' : ''}`}>
                        {!hasScores ? <span className="text-[9px] text-gray-300">{hole}</span> :
                         <span className={`text-[9px] font-bold ${dotColor}`}>{t1Hole}-{t2Hole}</span>}
                      </div>
                    );
                  })}
                  <span className="text-[9px] font-bold text-gray-500 ml-1">{backT1}-{backT2}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Hole Navigation */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPreviousHole}
            disabled={currentHole === 1}
            className={`px-5 py-3 rounded-lg font-semibold text-base mobile-tap-target ${
              currentHole === 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400 active:bg-gray-500'
            }`}
          >
            ← Prev
          </button>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">Hole {currentHole}</div>
            <div className="text-sm text-gray-600">
              Par {holeData.par} • HCP {holeData.handicap} • {isFront9 ? 'Front 9' : 'Back 9'}
            </div>
          </div>
          
          <button
            onClick={goToNextHole}
            disabled={currentHole === 18}
            className={`px-5 py-3 rounded-lg font-semibold text-base mobile-tap-target ${
              currentHole === 18
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Score Entry */}
      <div className="p-4 space-y-4">
        {(() => {
          // Group players by team, team1 first then team2
          const team1Players = players.filter(p => match.team1_players.includes(p.name));
          const team2Players = players.filter(p => match.team2_players.includes(p.name));
          const groupedPlayers = [...team1Players, ...team2Players];
          return groupedPlayers;
        })().map((player, idx, arr) => {
          const isShaftsPlayer = player.team === 'Shaft';
          const isTeam1 = match.team1_players.includes(player.name);
          // Show divider between teams
          const prevPlayer = idx > 0 ? arr[idx - 1] : null;
          const showDivider = prevPlayer && match.team1_players.includes(prevPlayer.name) !== isTeam1;
          
          return (
            <div key={player.id}>
            {showDivider && (
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 border-t-2 border-gray-300"></div>
                <span className="text-xs font-bold text-gray-400 uppercase">vs</span>
                <div className="flex-1 border-t-2 border-gray-300"></div>
              </div>
            )}
            <div
              className={`bg-white rounded-lg border-2 p-4 ${
                isShaftsPlayer ? 'border-blue-200' : 'border-red-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className={`font-bold text-lg ${
                    isShaftsPlayer ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {player.name}
                    {renderStrokeDots(getStrokesOnHole(player, currentHole))}
                  </div>
                  <div className="text-sm text-gray-600">
                    {player.team} • HCP {player.playing_handicap}
                    {getStrokesOnHole(player, currentHole) > 0 && (
                      <span className="ml-1 text-green-600 font-semibold">
                        ({getStrokesOnHole(player, currentHole)} stroke{getStrokesOnHole(player, currentHole) > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Current Score</div>
                  <div className="font-bold">
                    {scores[player.id][currentHole] || '—'}
                  </div>
                  {match.format === 'Stableford' && scores[player.id][currentHole] && (
                    <div className="text-xs mt-1">
                      {(() => {
                        const gross = scores[player.id][currentHole]!;
                        const strokes = getStrokesOnHole(player, currentHole);
                        const net = gross - strokes;
                        const pts = calculateStablefordPoints(net, holeData.par);
                        return (
                          <span className={`font-bold px-2 py-0.5 rounded ${
                            pts >= 3 ? 'bg-green-200 text-green-800' :
                            pts === 2 ? 'bg-blue-100 text-blue-800' :
                            pts === 1 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {pts} pt{pts !== 1 ? 's' : ''}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Score Input */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={scores[player.id][currentHole] || ''}
                  onChange={(e) => handleScoreInput(player.id, e.target.value)}
                  className="score-input mobile-tap-target"
                  placeholder="Score"
                />
                <button
                  onClick={() => saveScore(player.id, currentHole, null)}
                  className="bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 mobile-tap-target"
                >
                  Clear
                </button>
              </div>
              
              {/* Quick Score Buttons */}
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                  <button
                    key={score}
                    onClick={() => {
                      saveScore(player.id, currentHole, score);
                    }}
                    className={`py-3 px-1 text-base font-semibold rounded-lg mobile-tap-target ${
                      scores[player.id][currentHole] === score
                        ? isShaftsPlayer
                          ? 'bg-blue-600 text-white'
                          : 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400'
                    }`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
            </div>
          );
        })}
      </div>

      {/* Hole Selector */}
      <div className="bg-white border-t p-4">
        <div className="text-center mb-3">
          <div className="text-sm font-semibold text-gray-700">Jump to Hole</div>
        </div>
        <div className="grid grid-cols-9 gap-1.5 mb-1">
          {Array.from({ length: 9 }, (_, i) => i + 1).map(hole => (
            <button
              key={hole}
              onClick={() => setCurrentHole(hole)}
              className={`py-2.5 px-0.5 text-sm font-semibold rounded-lg mobile-tap-target ${
                currentHole === hole
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400'
              }`}
            >
              {hole}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-9 gap-1.5">
          {Array.from({ length: 9 }, (_, i) => i + 10).map(hole => (
            <button
              key={hole}
              onClick={() => setCurrentHole(hole)}
              className={`py-2.5 px-0.5 text-sm font-semibold rounded-lg mobile-tap-target ${
                currentHole === hole
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400'
              }`}
            >
              {hole}
            </button>
          ))}
        </div>
      </div>

      {/* Save Status */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          Saving...
        </div>
      )}

      {/* Navigation Footer */}
      <div className="bg-white border-t p-4">
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="btn-secondary text-sm"
          >
            Leaderboard
          </button>
          <button
            onClick={() => router.push(`/match/${match.id}`)}
            className="btn-primary text-sm"
          >
            Scorecard
          </button>
        </div>
      </div>
    </div>
  );
}