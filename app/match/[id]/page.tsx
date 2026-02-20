'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculateNetScore, calculateStablefordPoints, calculateBestBallResults, calculateStablefordResults, calculateIndividualResults, calculateMatchPlayStrokes } from '@/lib/scoring';
import type { Player, Match, Score, Course, MatchResult } from '@/lib/scoring';

export default function MatchDetail() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (matchId) {
      fetchMatchData();
    }
  }, [matchId]);

  useEffect(() => {
    if (matchId) {
      const subscription = supabase
        .channel(`match_${matchId}_scores`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: `match_id=eq.${matchId}`
        }, () => {
          fetchScores();
        })
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [matchId]);

  async function fetchMatchData() {
    try {
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchError) {
        console.error('Match not found:', matchError);
        return;
      }

      setMatch(matchData);

      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', matchData.course_id)
        .single();

      if (courseData) setCourse(courseData);

      const allPlayerNames = [...matchData.team1_players, ...matchData.team2_players];
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .in('name', allPlayerNames);

      if (playersData) {
        // Sort: team1 players first, then team2
        const sorted = [
          ...playersData.filter(p => matchData.team1_players.includes(p.name))
            .sort((a, b) => matchData.team1_players.indexOf(a.name) - matchData.team1_players.indexOf(b.name)),
          ...playersData.filter(p => matchData.team2_players.includes(p.name))
            .sort((a, b) => matchData.team2_players.indexOf(a.name) - matchData.team2_players.indexOf(b.name)),
        ];
        setPlayers(sorted);
      }

      await fetchScores();
    } catch (error) {
      console.error('Error fetching match data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchScores() {
    const { data: scoresData } = await supabase
      .from('scores')
      .select('*')
      .eq('match_id', matchId);

    if (scoresData) setScores(scoresData);
  }

  function getPlayerScore(playerId: string, hole: number): number | null {
    const score = scores.find(s => s.player_id === playerId && s.hole_number === hole);
    return score?.gross_score || null;
  }

  function getHoleData(hole: number) {
    if (!course) return { par: 4, handicap: 1 };
    return course.par_data[`hole_${hole}`] || { par: 4, handicap: 1 };
  }

  function getStrokesOnHole(player: Player, holeNumber: number): number {
    if (!match || !course) return 0;
    
    if (match.format === 'Individual') {
      const isTeam1 = match.team1_players.includes(player.name);
      const idx = isTeam1 ? match.team1_players.indexOf(player.name) : match.team2_players.indexOf(player.name);
      const opponentName = isTeam1 ? match.team2_players[idx] : match.team1_players[idx];
      const opponent = players.find(p => p.name === opponentName);
      if (!opponent) return 0;
      const strokeMap = calculateMatchPlayStrokes(player.playing_handicap, opponent.playing_handicap, course);
      return strokeMap[holeNumber] || 0;
    }
    
    const holeData = getHoleData(holeNumber);
    const fullStrokes = Math.floor(player.playing_handicap / 18);
    const extra = holeData.handicap <= (player.playing_handicap % 18) ? 1 : 0;
    return fullStrokes + extra;
  }

  function calculatePlayerTotal(playerId: string, holes: number[]): number {
    let total = 0;
    for (const hole of holes) {
      const score = getPlayerScore(playerId, hole);
      if (score) total += score;
    }
    return total;
  }

  function getMatchResult(): MatchResult | null {
    if (!match || !course) return null;
    switch (match.format) {
      case 'Best Ball':
        return calculateBestBallResults(match, scores, players, course);
      case 'Stableford':
        return calculateStablefordResults(match, scores, players, course);
      case 'Individual':
        return calculateIndividualResults(match, scores, players, course);
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl">Loading match...</div>
      </div>
    );
  }

  if (!match || !course) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl text-red-600">Match not found</div>
      </div>
    );
  }

  const result = getMatchResult();
  const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
  const frontNine = Array.from({ length: 9 }, (_, i) => i + 1);
  const backNine = Array.from({ length: 9 }, (_, i) => i + 10);

  return (
    <div className="container mx-auto px-4 py-6 min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      {/* Breadcrumb */}
      <div className="mb-4 text-sm">
        <Link href="/" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Home</Link>
        <span className="text-gray-400 mx-2">›</span>
        <Link href={`/day/${match.day}`} className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Day {match.day}</Link>
        <span className="text-gray-400 mx-2">›</span>
        <span className="text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>Match {match.group_number}</span>
      </div>

      {/* Match Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="text-center">
          <h1 className="text-3xl mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Group {match.group_number} - Day {match.day}
          </h1>
          <p className="text-lg text-gray-600">{course.name} ({course.tees})</p>
          <p className="text-gray-500">{match.format}</p>
          
          {result && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-lg font-semibold mb-2">Match Result</div>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-6">
                <div className={`text-center p-3 rounded w-full sm:w-auto ${team1IsShafts ? 'bg-blue-100' : 'bg-red-100'}`}>
                  <div className="font-semibold text-sm sm:text-base">{match.team1_players.join(' & ')}</div>
                  <div className="text-sm text-gray-600">{team1IsShafts ? 'Shaft' : 'Balls'}</div>
                  <div className="text-2xl font-bold">{result.team1_total}</div>
                </div>
                <div className="text-2xl font-light text-gray-400">vs</div>
                <div className={`text-center p-3 rounded w-full sm:w-auto ${!team1IsShafts ? 'bg-blue-100' : 'bg-red-100'}`}>
                  <div className="font-semibold text-sm sm:text-base">{match.team2_players.join(' & ')}</div>
                  <div className="text-sm text-gray-600">{!team1IsShafts ? 'Shaft' : 'Balls'}</div>
                  <div className="text-2xl font-bold">{result.team2_total}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scorecard */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              {/* Hole numbers */}
              <tr className="bg-newspaper-dark text-white">
                <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-newspaper-dark z-10 min-w-[100px]">Hole</th>
                {frontNine.map(hole => (
                  <th key={hole} className="px-1 py-2 text-center min-w-[32px]">{hole}</th>
                ))}
                <th className="px-2 py-2 text-center bg-yellow-600 font-bold">OUT</th>
                {backNine.map(hole => (
                  <th key={hole} className="px-1 py-2 text-center min-w-[32px]">{hole}</th>
                ))}
                <th className="px-2 py-2 text-center bg-yellow-600 font-bold">IN</th>
                <th className="px-2 py-2 text-center bg-green-700 font-bold">TOT</th>
              </tr>
              
              {/* Par Row */}
              <tr className="bg-gray-100 border-b">
                <td className="px-2 py-1 font-semibold sticky left-0 bg-gray-100 z-10">Par</td>
                {frontNine.map(hole => (
                  <td key={hole} className="px-1 py-1 text-center font-semibold">{getHoleData(hole).par}</td>
                ))}
                <td className="px-2 py-1 text-center font-bold bg-yellow-50">
                  {frontNine.reduce((sum, hole) => sum + getHoleData(hole).par, 0)}
                </td>
                {backNine.map(hole => (
                  <td key={hole} className="px-1 py-1 text-center font-semibold">{getHoleData(hole).par}</td>
                ))}
                <td className="px-2 py-1 text-center font-bold bg-yellow-50">
                  {backNine.reduce((sum, hole) => sum + getHoleData(hole).par, 0)}
                </td>
                <td className="px-2 py-1 text-center font-bold bg-green-50">{course.par_data.total_par}</td>
              </tr>

              {/* Handicap Row */}
              <tr className="bg-gray-50 border-b-2 border-gray-300">
                <td className="px-2 py-1 font-semibold sticky left-0 bg-gray-50 z-10">Hcp</td>
                {frontNine.map(hole => (
                  <td key={hole} className="px-1 py-1 text-center text-xs text-gray-500">{getHoleData(hole).handicap}</td>
                ))}
                <td className="px-2 py-1 bg-yellow-50"></td>
                {backNine.map(hole => (
                  <td key={hole} className="px-1 py-1 text-center text-xs text-gray-500">{getHoleData(hole).handicap}</td>
                ))}
                <td className="px-2 py-1 bg-yellow-50"></td>
                <td className="px-2 py-1 bg-green-50"></td>
              </tr>
            </thead>

            <tbody>
              {players.map((player, idx) => {
                const isTeam1 = match.team1_players.includes(player.name);
                const isShafts = player.team === 'Shaft';
                // Add separator between teams
                const showSeparator = idx > 0 && 
                  match.team1_players.includes(players[idx - 1].name) !== isTeam1;

                return (
                  <>
                    {showSeparator && (
                      <tr key={`sep-${player.id}`}>
                        <td colSpan={22} className="bg-gray-300 h-1"></td>
                      </tr>
                    )}
                    <tr key={player.id} className={`border-t ${isShafts ? 'bg-blue-50/30' : 'bg-red-50/30'}`}>
                      <td className={`px-2 py-2 font-semibold sticky left-0 z-10 ${isShafts ? 'bg-blue-50' : 'bg-red-50'}`}>
                        <span className={isShafts ? 'text-blue-700' : 'text-red-700'}>
                          {player.name}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">({player.playing_handicap})</span>
                      </td>
                      
                      {/* Front 9 */}
                      {frontNine.map(hole => {
                        const score = getPlayerScore(player.id, hole);
                        const holeData = getHoleData(hole);
                        const strokes = getStrokesOnHole(player, hole);
                        const netScore = score ? score - strokes : null;
                        const scoreToPar = netScore ? netScore - holeData.par : null;
                        
                        let cellBg = '';
                        let cellStyle = '';
                        if (score) {
                          if (scoreToPar !== null && scoreToPar <= -2) { cellBg = 'bg-yellow-300'; cellStyle = 'font-bold'; }
                          else if (scoreToPar === -1) { cellBg = 'bg-green-200'; cellStyle = 'font-bold'; }
                          else if (scoreToPar === 0) { cellBg = ''; }
                          else if (scoreToPar === 1) { cellBg = 'bg-red-100'; }
                          else if (scoreToPar !== null && scoreToPar >= 2) { cellBg = 'bg-red-200'; }
                        }
                        
                        return (
                          <td key={hole} className={`px-1 py-2 text-center relative ${cellBg} ${cellStyle}`}>
                            {score || '—'}
                            {strokes > 0 && (
                              <div className="flex justify-center gap-[2px] mt-[1px]">
                                {Array.from({ length: strokes }, (_, i) => (
                                  <span key={i} className="inline-block w-[4px] h-[4px] bg-black rounded-full"></span>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      
                      <td className="px-2 py-2 text-center font-bold bg-yellow-50">
                        {calculatePlayerTotal(player.id, frontNine) || '—'}
                      </td>
                      
                      {/* Back 9 */}
                      {backNine.map(hole => {
                        const score = getPlayerScore(player.id, hole);
                        const holeData = getHoleData(hole);
                        const strokes = getStrokesOnHole(player, hole);
                        const netScore = score ? score - strokes : null;
                        const scoreToPar = netScore ? netScore - holeData.par : null;
                        
                        let cellBg = '';
                        let cellStyle = '';
                        if (score) {
                          if (scoreToPar !== null && scoreToPar <= -2) { cellBg = 'bg-yellow-300'; cellStyle = 'font-bold'; }
                          else if (scoreToPar === -1) { cellBg = 'bg-green-200'; cellStyle = 'font-bold'; }
                          else if (scoreToPar === 0) { cellBg = ''; }
                          else if (scoreToPar === 1) { cellBg = 'bg-red-100'; }
                          else if (scoreToPar !== null && scoreToPar >= 2) { cellBg = 'bg-red-200'; }
                        }
                        
                        return (
                          <td key={hole} className={`px-1 py-2 text-center relative ${cellBg} ${cellStyle}`}>
                            {score || '—'}
                            {strokes > 0 && (
                              <div className="flex justify-center gap-[2px] mt-[1px]">
                                {Array.from({ length: strokes }, (_, i) => (
                                  <span key={i} className="inline-block w-[4px] h-[4px] bg-black rounded-full"></span>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      
                      <td className="px-2 py-2 text-center font-bold bg-yellow-50">
                        {calculatePlayerTotal(player.id, backNine) || '—'}
                      </td>
                      
                      <td className="px-2 py-2 text-center font-bold bg-green-50">
                        {calculatePlayerTotal(player.id, [...frontNine, ...backNine]) || '—'}
                      </td>
                    </tr>
                    {/* Stableford Points Row for Day 2 */}
                    {match.format === 'Stableford' && (
                      <tr key={`stab-${player.id}`} className={`${isShafts ? 'bg-blue-50/10' : 'bg-red-50/10'} border-b`}>
                        <td className={`px-2 py-1 text-[10px] font-semibold sticky left-0 z-10 ${isShafts ? 'bg-blue-50' : 'bg-red-50'} text-gray-500`}>
                          Pts
                        </td>
                        {frontNine.map(hole => {
                          const score = getPlayerScore(player.id, hole);
                          const holeData = getHoleData(hole);
                          const strokes = getStrokesOnHole(player, hole);
                          const net = score ? score - strokes : null;
                          const pts = net !== null ? calculateStablefordPoints(net, holeData.par) : null;
                          return (
                            <td key={hole} className={`px-1 py-1 text-center text-[10px] font-bold ${
                              pts === null ? '' :
                              pts >= 3 ? 'text-green-700' :
                              pts === 2 ? 'text-blue-600' :
                              pts === 1 ? 'text-yellow-700' :
                              'text-red-600'
                            }`}>
                              {pts !== null ? pts : ''}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-center text-[10px] font-bold bg-yellow-50">
                          {frontNine.reduce((sum, hole) => {
                            const score = getPlayerScore(player.id, hole);
                            const holeData = getHoleData(hole);
                            const strokes = getStrokesOnHole(player, hole);
                            const net = score ? score - strokes : null;
                            return sum + (net !== null ? calculateStablefordPoints(net, holeData.par) : 0);
                          }, 0) || ''}
                        </td>
                        {backNine.map(hole => {
                          const score = getPlayerScore(player.id, hole);
                          const holeData = getHoleData(hole);
                          const strokes = getStrokesOnHole(player, hole);
                          const net = score ? score - strokes : null;
                          const pts = net !== null ? calculateStablefordPoints(net, holeData.par) : null;
                          return (
                            <td key={hole} className={`px-1 py-1 text-center text-[10px] font-bold ${
                              pts === null ? '' :
                              pts >= 3 ? 'text-green-700' :
                              pts === 2 ? 'text-blue-600' :
                              pts === 1 ? 'text-yellow-700' :
                              'text-red-600'
                            }`}>
                              {pts !== null ? pts : ''}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-center text-[10px] font-bold bg-yellow-50">
                          {backNine.reduce((sum, hole) => {
                            const score = getPlayerScore(player.id, hole);
                            const holeData = getHoleData(hole);
                            const strokes = getStrokesOnHole(player, hole);
                            const net = score ? score - strokes : null;
                            return sum + (net !== null ? calculateStablefordPoints(net, holeData.par) : 0);
                          }, 0) || ''}
                        </td>
                        <td className="px-2 py-1 text-center text-[10px] font-bold bg-green-50">
                          {[...frontNine, ...backNine].reduce((sum, hole) => {
                            const score = getPlayerScore(player.id, hole);
                            const holeData = getHoleData(hole);
                            const strokes = getStrokesOnHole(player, hole);
                            const net = score ? score - strokes : null;
                            return sum + (net !== null ? calculateStablefordPoints(net, holeData.par) : 0);
                          }, 0) || ''}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Match Status Summary */}
        {(() => {
          const team1Players = players.filter(p => match.team1_players.includes(p.name));
          const team2Players = players.filter(p => match.team2_players.includes(p.name));
          const team1IsShafts = team1Players[0]?.team === 'Shaft';

          function getHoleWinnerSummary(hole: number) {
            if (match!.format === 'Best Ball') {
              const t1Nets = team1Players.map(p => { const s = getPlayerScore(p.id, hole); return s ? s - getStrokesOnHole(p, hole) : null; }).filter(n => n !== null) as number[];
              const t2Nets = team2Players.map(p => { const s = getPlayerScore(p.id, hole); return s ? s - getStrokesOnHole(p, hole) : null; }).filter(n => n !== null) as number[];
              if (!t1Nets.length || !t2Nets.length) return null;
              const b1 = Math.min(...t1Nets), b2 = Math.min(...t2Nets);
              return b1 < b2 ? 'team1' : b2 < b1 ? 'team2' : 'tie';
            } else if (match!.format === 'Stableford') {
              let t1Pts = 0, t2Pts = 0, t1Has = false, t2Has = false;
              team1Players.forEach(p => { const s = getPlayerScore(p.id, hole); if (s) { t1Has = true; t1Pts += calculateStablefordPoints(s - getStrokesOnHole(p, hole), getHoleData(hole).par); }});
              team2Players.forEach(p => { const s = getPlayerScore(p.id, hole); if (s) { t2Has = true; t2Pts += calculateStablefordPoints(s - getStrokesOnHole(p, hole), getHoleData(hole).par); }});
              if (!t1Has || !t2Has) return null;
              return t1Pts > t2Pts ? 'team1' : t2Pts > t1Pts ? 'team2' : 'tie';
            } else {
              const p1 = team1Players[0], p2 = team2Players[0];
              if (!p1 || !p2) return null;
              const s1 = getPlayerScore(p1.id, hole), s2 = getPlayerScore(p2.id, hole);
              if (!s1 || !s2) return null;
              const n1 = s1 - getStrokesOnHole(p1, hole), n2 = s2 - getStrokesOnHole(p2, hole);
              return n1 < n2 ? 'team1' : n2 < n1 ? 'team2' : 'tie';
            }
          }

          let fT1 = 0, fT2 = 0, bT1 = 0, bT2 = 0;
          [1,2,3,4,5,6,7,8,9].forEach(h => { const w = getHoleWinnerSummary(h); if (w === 'team1') fT1++; if (w === 'team2') fT2++; });
          [10,11,12,13,14,15,16,17,18].forEach(h => { const w = getHoleWinnerSummary(h); if (w === 'team1') bT1++; if (w === 'team2') bT2++; });
          const allT1 = fT1 + bT1, allT2 = fT2 + bT2;
          const hasScores = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].some(h => getHoleWinnerSummary(h) !== null);

          function statusLabel(t1: number, t2: number): { text: string; color: string } {
            const diff = t1 - t2;
            if (diff === 0) return { text: 'AS', color: 'text-gray-500' };
            const t1Label = team1IsShafts ? 'Shaft' : 'Balls';
            const t2Label = team1IsShafts ? 'Balls' : 'Shaft';
            if (diff > 0) return { text: `${t1Label} ${diff}UP`, color: team1IsShafts ? 'text-blue-600' : 'text-red-600' };
            return { text: `${t2Label} ${Math.abs(diff)}UP`, color: team1IsShafts ? 'text-red-600' : 'text-blue-600' };
          }

          if (!hasScores) return null;
          const frontStatus = statusLabel(fT1, fT2);
          const backStatus = statusLabel(bT1, bT2);
          const overallStatus = statusLabel(allT1, allT2);

          return (
            <div className="px-4 py-3 bg-[#2a6b7c]/5 border-t">
              <div className="flex justify-between items-center text-sm" style={{ fontFamily: 'Georgia, serif' }}>
                <div className="text-center flex-1">
                  <div className="text-[10px] text-gray-400 uppercase">Front 9</div>
                  <div className={`font-bold ${frontStatus.color}`}>{frontStatus.text}</div>
                </div>
                <div className="border-l border-gray-300 h-8"></div>
                <div className="text-center flex-1">
                  <div className="text-[10px] text-gray-400 uppercase">Back 9</div>
                  <div className={`font-bold ${backStatus.color}`}>{backStatus.text}</div>
                </div>
                <div className="border-l border-gray-300 h-8"></div>
                <div className="text-center flex-1">
                  <div className="text-[10px] text-gray-400 uppercase">Overall</div>
                  <div className={`font-bold text-base ${overallStatus.color}`}>{overallStatus.text}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        <div className="p-3 bg-gray-50 border-t flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-yellow-300 rounded"></span> Eagle+</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-green-200 rounded"></span> Birdie</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-red-100 rounded"></span> Bogey</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-red-200 rounded"></span> Double+</span>
          <span className="flex items-center gap-1">
            <span className="inline-flex gap-[2px]">
              <span className="inline-block w-[5px] h-[5px] bg-black rounded-full"></span>
            </span>
            = Stroke received
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 text-center space-x-4">
        <button onClick={() => router.back()} className="btn-secondary">Back</button>
        <Link href={`/score/${match.group_access_token}`} className="btn-primary inline-block">Enter Scores</Link>
      </div>
    </div>
  );
}
