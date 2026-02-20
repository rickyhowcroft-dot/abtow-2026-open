'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculateNetScore } from '@/lib/scoring';
import type { Player, Match, Score, Course } from '@/lib/scoring';

interface SkinResult {
  hole: number;
  par: number;
  grossWinner?: Player;
  grossScore?: number;
  netWinner?: Player;
  netScore?: number;
  grossTie?: boolean;
  netTie?: boolean;
}

export default function SkinsDetail() {
  const params = useParams();
  const day = parseInt(params.day as string);
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [skinResults, setSkinResults] = useState<SkinResult[]>([]);

  useEffect(() => {
    if (day && day >= 1 && day <= 3) {
      fetchSkinsData();
    }
  }, [day]);

  async function fetchSkinsData() {
    try {
      const [playersResult, scoresResult, coursesResult] = await Promise.all([
        supabase.from('players').select('*'),
        supabase.from('scores').select('*'),
        supabase.from('courses').select('*').eq('day', day).single()
      ]);

      if (playersResult.data) setPlayers(playersResult.data);
      if (scoresResult.data) {
        // Filter scores for matches on this day
        const dayMatches = await supabase.from('matches').select('id').eq('day', day);
        const dayMatchIds = dayMatches.data?.map(m => m.id) || [];
        const dayScores = scoresResult.data.filter(s => dayMatchIds.includes(s.match_id));
        setScores(dayScores);
      }
      if (coursesResult.data) setCourse(coursesResult.data);
    } catch (error) {
      console.error('Error fetching skins data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (players.length > 0 && scores.length > 0 && course) {
      calculateSkins();
    }
  }, [players, scores, course]);

  function calculateSkins() {
    if (!course) return;

    const results: SkinResult[] = [];

    // For skins, all players use their full playing_handicap (75%) for net calculation
    // even on Day 3 where match play uses strokes off low man.
    // Net scores never cut or push a gross score:
    // If a player wins gross outright, exclude them from net evaluation on that hole.

    for (let hole = 1; hole <= 18; hole++) {
      const holeData = course.par_data[`hole_${hole}`];
      if (!holeData) continue;

      const holeScores: Array<{ player: Player; grossScore: number; netScore: number }> = [];

      // Get all scores for this hole across ALL players in the day
      players.forEach(player => {
        const score = scores.find(s => s.player_id === player.id && s.hole_number === hole);
        if (score?.gross_score) {
          // Always use full playing_handicap for skins (75% handicap)
          const netScore = calculateNetScore(score.gross_score, player.playing_handicap, holeData.handicap);
          holeScores.push({
            player,
            grossScore: score.gross_score,
            netScore
          });
        }
      });

      if (holeScores.length === 0) {
        results.push({
          hole,
          par: holeData.par
        });
        continue;
      }

      // Find gross winners
      const minGrossScore = Math.min(...holeScores.map(s => s.grossScore));
      const grossWinners = holeScores.filter(s => s.grossScore === minGrossScore);
      const grossWinner = grossWinners.length === 1 ? grossWinners[0] : null;

      // Gross birdie or better wins BOTH gross and net skins:
      // If outright gross winner has birdie or better, they take both skins.
      // No net score can beat or tie a gross birdie for the net skin.
      const isBirdieOrBetter = grossWinner && minGrossScore < holeData.par;
      
      let netWinner = null;
      let netTie = false;

      if (isBirdieOrBetter) {
        // Gross birdie winner takes both — net skin goes to same player
        netWinner = grossWinner;
      } else {
        // Normal net evaluation — exclude gross winner so net can't cut/push gross
        const netEligible = grossWinner 
          ? holeScores.filter(s => s.player.id !== grossWinner.player.id)
          : holeScores;
        
        if (netEligible.length > 0) {
          const minNetScore = Math.min(...netEligible.map(s => s.netScore));
          const netWinners = netEligible.filter(s => s.netScore === minNetScore);
          netWinner = netWinners.length === 1 ? netWinners[0] : null;
          netTie = netWinners.length > 1;
        }
      }

      results.push({
        hole,
        par: holeData.par,
        grossWinner: grossWinner?.player,
        grossScore: grossWinner ? minGrossScore : undefined,
        grossTie: grossWinners.length > 1,
        netWinner: netWinner?.player,
        netScore: netWinner ? netWinner.netScore : undefined,
        netTie
      });
    }

    setSkinResults(results);
  }

  function getDayInfo() {
    switch (day) {
      case 1:
        return {
          title: 'Day 1 - Ritz Carlton GC (Blue Tees)',
          course: 'Ritz Carlton GC'
        };
      case 2:
        return {
          title: 'Day 2 - Southern Dunes (Blue/White Blended)',
          course: 'Southern Dunes'
        };
      case 3:
        return {
          title: 'Day 3 - Champions Gate International (White Tees)',
          course: 'Champions Gate International'
        };
      default:
        return {
          title: 'Unknown Day',
          course: ''
        };
    }
  }

  function calculateSkinsSummary() {
    const grossSkins: { [playerId: string]: number } = {};
    const netSkins: { [playerId: string]: number } = {};
    let grossCarryover = 0;
    let netCarryover = 0;

    skinResults.forEach(result => {
      // Gross skins
      if (result.grossWinner) {
        const playerId = result.grossWinner.id;
        grossSkins[playerId] = (grossSkins[playerId] || 0) + 1 + grossCarryover;
        grossCarryover = 0;
      } else if (result.grossTie || (!result.grossWinner && skinResults.some(r => r.grossWinner))) {
        grossCarryover += 1;
      }

      // Net skins
      if (result.netWinner) {
        const playerId = result.netWinner.id;
        netSkins[playerId] = (netSkins[playerId] || 0) + 1 + netCarryover;
        netCarryover = 0;
      } else if (result.netTie || (!result.netWinner && skinResults.some(r => r.netWinner))) {
        netCarryover += 1;
      }
    });

    return { grossSkins, netSkins, grossCarryover, netCarryover };
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl">Loading skins data...</div>
      </div>
    );
  }

  if (!day || day < 1 || day > 3 || !course) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl text-red-600">Invalid day or course data not found</div>
      </div>
    );
  }

  const dayInfo = getDayInfo();
  const skinsSummary = calculateSkinsSummary();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm">
        <Link href="/" className="text-blue-600 hover:underline">Home</Link>
        <span className="text-gray-400 mx-2">›</span>
        <Link href={`/day/${day}`} className="text-blue-600 hover:underline">Day {day}</Link>
        <span className="text-gray-400 mx-2">›</span>
        <span className="text-gray-500">Skins</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="text-center">
          <h1 className="newspaper-header text-4xl mb-2">Skins Results</h1>
          <p className="text-xl text-gray-600 mb-2">{dayInfo.title}</p>
          <p className="text-gray-500">$200 NET • $200 GROSS</p>
        </div>
      </div>

      {/* Skins Summary */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Gross Skins */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-2xl font-bold mb-4 text-center">Gross Skins ($200)</h3>
          <div className="space-y-2">
            {Object.entries(skinsSummary.grossSkins)
              .sort(([, a], [, b]) => b - a)
              .map(([playerId, skins]) => {
                const player = players.find(p => p.id === playerId);
                if (!player) return null;
                
                return (
                  <div key={playerId} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                      <span className={`font-semibold ${
                        player.team === 'Shaft' ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {player.name}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">({player.team})</span>
                    </div>
                    <div className="text-lg font-bold">
                      {skins} skin{skins !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            
            {skinsSummary.grossCarryover > 0 && (
              <div className="flex justify-between items-center p-3 bg-yellow-100 rounded">
                <span className="font-semibold">Carryover</span>
                <span className="text-lg font-bold">{skinsSummary.grossCarryover} skin{skinsSummary.grossCarryover !== 1 ? 's' : ''}</span>
              </div>
            )}

            {Object.keys(skinsSummary.grossSkins).length === 0 && skinsSummary.grossCarryover === 0 && (
              <div className="text-center text-gray-500 py-4">No gross skins won yet</div>
            )}
          </div>
        </div>

        {/* Net Skins */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-2xl font-bold mb-4 text-center">Net Skins ($200)</h3>
          <div className="space-y-2">
            {Object.entries(skinsSummary.netSkins)
              .sort(([, a], [, b]) => b - a)
              .map(([playerId, skins]) => {
                const player = players.find(p => p.id === playerId);
                if (!player) return null;
                
                return (
                  <div key={playerId} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                      <span className={`font-semibold ${
                        player.team === 'Shaft' ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {player.name}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">({player.team})</span>
                    </div>
                    <div className="text-lg font-bold">
                      {skins} skin{skins !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}

            {skinsSummary.netCarryover > 0 && (
              <div className="flex justify-between items-center p-3 bg-yellow-100 rounded">
                <span className="font-semibold">Carryover</span>
                <span className="text-lg font-bold">{skinsSummary.netCarryover} skin{skinsSummary.netCarryover !== 1 ? 's' : ''}</span>
              </div>
            )}

            {Object.keys(skinsSummary.netSkins).length === 0 && skinsSummary.netCarryover === 0 && (
              <div className="text-center text-gray-500 py-4">No net skins won yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Hole-by-Hole Results */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="text-xl font-bold text-center">Hole-by-Hole Skins</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-center font-semibold">Hole</th>
                <th className="px-3 py-2 text-center font-semibold">Par</th>
                <th className="px-3 py-2 text-center font-semibold">Gross Winner</th>
                <th className="px-3 py-2 text-center font-semibold">Score</th>
                <th className="px-3 py-2 text-center font-semibold">Net Winner</th>
                <th className="px-3 py-2 text-center font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {skinResults.map(result => (
                <tr key={result.hole} className="border-t">
                  <td className="px-3 py-2 text-center font-semibold">{result.hole}</td>
                  <td className="px-3 py-2 text-center">{result.par}</td>
                  <td className={`px-3 py-2 text-center ${
                    result.grossTie ? 'bg-yellow-100' : ''
                  }`}>
                    {result.grossWinner ? (
                      <span className={`font-semibold ${
                        result.grossWinner.team === 'Shaft' ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {result.grossWinner.name}
                      </span>
                    ) : result.grossTie ? (
                      <span className="text-yellow-600 font-semibold">TIE</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {result.grossScore ? (
                      <span className={`font-semibold ${
                        result.grossScore < result.par ? 'text-green-600' :
                        result.grossScore > result.par ? 'text-red-600' : ''
                      }`}>
                        {result.grossScore}
                      </span>
                    ) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-center ${
                    result.netTie ? 'bg-yellow-100' : ''
                  }`}>
                    {result.netWinner ? (
                      <span className={`font-semibold ${
                        result.netWinner.team === 'Shaft' ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {result.netWinner.name}
                      </span>
                    ) : result.netTie ? (
                      <span className="text-yellow-600 font-semibold">TIE</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {result.netScore ? (
                      <span className={`font-semibold ${
                        result.netScore < result.par ? 'text-green-600' :
                        result.netScore > result.par ? 'text-red-600' : ''
                      }`}>
                        {result.netScore}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 text-center space-x-4">
        <Link href={`/day/${day}`} className="btn-secondary">
          Back to Day {day}
        </Link>
        <Link href="/" className="btn-primary">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}