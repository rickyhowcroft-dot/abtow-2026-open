'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculateBestBallResults, calculateStablefordResults, calculateIndividualResults, calculateNetScore, calculateMatchPlayStrokes, calculateStablefordPoints } from '@/lib/scoring';
import type { Player, Match, Score, Course, MatchResult } from '@/lib/scoring';

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [teamScores, setTeamScores] = useState({ shafts: 0, balls: 0 });
  const [modalMatch, setModalMatch] = useState<Match | null>(null);

  useEffect(() => {
    fetchData();
    
    // Set up real-time subscription for scores
    const subscription = supabase
      .channel('scores_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        fetchScores();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (players.length > 0 && matches.length > 0 && scores.length > 0 && courses.length > 0) {
      calculateTeamScores();
    }
  }, [players, matches, scores, courses]);

  async function fetchData() {
    setLoading(true);
    
    try {
      const [playersResult, matchesResult, scoresResult, coursesResult] = await Promise.all([
        supabase.from('players').select('*'),
        supabase.from('matches').select('*'),
        supabase.from('scores').select('*'),
        supabase.from('courses').select('*')
      ]);

      if (playersResult.data) setPlayers(playersResult.data);
      if (matchesResult.data) setMatches(matchesResult.data);
      if (scoresResult.data) setScores(scoresResult.data);
      if (coursesResult.data) setCourses(coursesResult.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchScores() {
    const { data } = await supabase.from('scores').select('*');
    if (data) setScores(data);
  }

  function calculateTeamScores() {
    let shaftsPoints = 0;
    let ballsPoints = 0;

    matches.forEach(match => {
      const course = courses.find(c => c.id === match.course_id);
      if (!course) return;

      let result: MatchResult;

      switch (match.format) {
        case 'Best Ball':
          result = calculateBestBallResults(match, scores, players, course);
          break;
        case 'Stableford':
          result = calculateStablefordResults(match, scores, players, course);
          break;
        case 'Individual':
          result = calculateIndividualResults(match, scores, players, course);
          break;
        default:
          return;
      }

      // Determine which team gets the points based on player names
      const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
      
      if (team1IsShafts) {
        shaftsPoints += result.team1_total;
        ballsPoints += result.team2_total;
      } else {
        ballsPoints += result.team1_total;
        shaftsPoints += result.team2_total;
      }
    });

    setTeamScores({ shafts: shaftsPoints, balls: ballsPoints });
  }

  function getMatchesForDay(day: number) {
    return matches.filter(m => m.day === day);
  }

  function getMatchResult(match: Match): MatchResult {
    const course = courses.find(c => c.id === match.course_id);
    if (!course) {
      return {
        match_id: match.id,
        team1_front: 0,
        team1_back: 0,
        team1_total: 0,
        team2_front: 0,
        team2_back: 0,
        team2_total: 0,
        status: 'upcoming'
      };
    }

    switch (match.format) {
      case 'Best Ball':
        return calculateBestBallResults(match, scores, players, course);
      case 'Stableford':
        return calculateStablefordResults(match, scores, players, course);
      case 'Individual':
        return calculateIndividualResults(match, scores, players, course);
      default:
        return {
          match_id: match.id,
          team1_front: 0,
          team1_back: 0,
          team1_total: 0,
          team2_front: 0,
          team2_back: 0,
          team2_total: 0,
          status: 'upcoming'
        };
    }
  }

  function getMatchStatus(match: Match): string {
    const matchScores = scores.filter(s => s.match_id === match.id);
    const totalPlayersInMatch = match.team1_players.length + match.team2_players.length;
    const completedHoles = matchScores.filter(s => s.gross_score !== null).length;
    
    if (completedHoles === 0) return 'Not Started';
    if (completedHoles === totalPlayersInMatch * 18) return 'Final';
    return `In Progress (${Math.floor(completedHoles / totalPlayersInMatch)}/18)`;
  }

  function formatTeamNames(teamPlayers: string[], isTeam1: boolean, match: Match): string {
    const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
    const isShafts = isTeam1 ? team1IsShafts : !team1IsShafts;
    const matchScores = scores.filter(s => s.match_id === match.id);
    const hasScores = matchScores.some(s => s.gross_score !== null);
    
    if (hasScores) {
      const result = getMatchResult(match);
      const points = isTeam1 ? result.team1_total : result.team2_total;
      return `${teamPlayers.join(' & ')} (${isShafts ? 'Shaft' : 'Balls'}) - ${points}pts`;
    }
    
    return `${teamPlayers.join(' & ')} (${isShafts ? 'Shaft' : 'Balls'}) - N/A`;
  }

  // Calculate per-day team points
  function getDayPoints(day: number) {
    let shafts = 0, balls = 0;
    const dayMatches = matches.filter(m => m.day === day);
    dayMatches.forEach(match => {
      const course = courses.find(c => c.id === match.course_id);
      if (!course) return;
      let result: MatchResult;
      switch (match.format) {
        case 'Best Ball': result = calculateBestBallResults(match, scores, players, course); break;
        case 'Stableford': result = calculateStablefordResults(match, scores, players, course); break;
        case 'Individual': result = calculateIndividualResults(match, scores, players, course); break;
        default: return;
      }
      const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
      if (team1IsShafts) { shafts += result.team1_total; balls += result.team2_total; }
      else { balls += result.team1_total; shafts += result.team2_total; }
    });
    return { shafts, balls };
  }

  const day1 = getDayPoints(1);
  const day2 = getDayPoints(2);
  const day3 = getDayPoints(3);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl">Loading tournament data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      {/* Hero Section */}
      <div className="text-center pt-10 pb-6 px-4">
        <h1 className="text-6xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>2026</h1>
        <h2 className="text-3xl md:text-4xl font-bold tracking-wide text-gray-900 mb-4" style={{ fontFamily: 'Georgia, serif' }}>ABTOW OPEN</h2>
        <div className="flex items-center justify-center gap-0 max-w-md mx-auto mb-2">
          <div className="flex-1 border-t border-gray-400"></div>
        </div>
        <p className="text-sm md:text-base tracking-[0.2em] text-gray-700 font-semibold uppercase mb-2" style={{ fontFamily: 'Georgia, serif' }}>
          Ritz Carlton GC &bull; Southern Dunes &bull; Champions Gate
        </p>
        <div className="flex items-center justify-center gap-0 max-w-md mx-auto">
          <div className="flex-1 border-t border-gray-400"></div>
        </div>
      </div>

      {/* Logo/Image */}
      <div className="flex justify-center pb-8 px-4">
        <Link href="/"><img src="/abtow-logo.png" alt="ABTOW 2026 Open" className="w-64 md:w-80 max-w-full" /></Link>
      </div>

      {/* Leaderboard Table */}
      <div className="max-w-lg mx-auto px-4 mb-8">
        <div className="bg-[#2a6b7c] text-white text-center py-3 rounded-t-lg">
          <h3 className="text-2xl md:text-3xl font-bold tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>LEADERBOARD</h3>
        </div>
        <div className="bg-white rounded-b-lg shadow-lg overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="px-4 py-3 text-sm font-bold text-gray-800" rowSpan={2} style={{ fontFamily: 'Georgia, serif' }}>Team</th>
                <th className="text-center text-sm font-bold text-gray-800 pt-3 pb-1" colSpan={3} style={{ fontFamily: 'Georgia, serif' }}>Day</th>
                <th className="px-3 py-3 text-center text-sm font-bold text-gray-800" rowSpan={2} style={{ fontFamily: 'Georgia, serif' }}>Pts.</th>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="px-3 py-1 text-center text-sm font-bold text-gray-600">1</th>
                <th className="px-3 py-1 text-center text-sm font-bold text-gray-600">2</th>
                <th className="px-3 py-1 text-center text-sm font-bold text-gray-600">3</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-4 font-semibold text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>Team Shaft</td>
                <td className="px-3 py-4 text-center font-semibold">{day1.shafts || '–'}</td>
                <td className="px-3 py-4 text-center font-semibold">{day2.shafts || '–'}</td>
                <td className="px-3 py-4 text-center font-semibold">{day3.shafts || '–'}</td>
                <td className="px-3 py-4 text-center font-bold text-lg">{teamScores.shafts}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-4 font-semibold text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>Team Balls</td>
                <td className="px-3 py-4 text-center font-semibold">{day1.balls || '–'}</td>
                <td className="px-3 py-4 text-center font-semibold">{day2.balls || '–'}</td>
                <td className="px-3 py-4 text-center font-semibold">{day3.balls || '–'}</td>
                <td className="px-3 py-4 text-center font-bold text-lg">{teamScores.balls}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-4 py-3 bg-[#2a6b7c]/10 text-xs text-gray-600" style={{ fontFamily: 'Georgia, serif' }}>
            Scoring is based on total match points each day. $4,800 purse.
          </div>
        </div>
      </div>

      {/* Day Tabs */}
      <div className="max-w-2xl mx-auto px-4 mb-6">
        <div className="flex justify-center">
          <div className="inline-flex border border-gray-400 rounded overflow-hidden">
            {[1, 2, 3].map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-6 py-2 text-sm font-bold tracking-wide transition-colors ${
                  selectedDay === day
                    ? 'bg-[#2a6b7c] text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } ${day < 3 ? 'border-r border-gray-400' : ''}`}
                style={{ fontFamily: 'Georgia, serif' }}
              >
                DAY {day}
              </button>
            ))}
          </div>
        </div>

        {/* Day Subheader */}
        <div className="flex justify-between items-center mt-6 mb-4 px-2">
          <div className="text-sm font-semibold italic text-gray-600" style={{ fontFamily: 'Georgia, serif' }}>Team Shaft</div>
          <div className="text-sm text-gray-500 text-center" style={{ fontFamily: 'Georgia, serif' }}>
            {selectedDay === 1 && (<><div>Ritz Carlton GC — Best Ball</div><div className="text-xs text-gray-400">March 16, 2026</div></>)}
            {selectedDay === 2 && (<><div>Southern Dunes — Stableford</div><div className="text-xs text-gray-400">March 17, 2026 ☘️</div></>)}
            {selectedDay === 3 && (<><div>Champions Gate</div><div>Individual Match Play</div><div className="text-xs text-gray-400">March 18, 2026</div></>)}
          </div>
          <div className="text-sm font-semibold italic text-gray-600" style={{ fontFamily: 'Georgia, serif' }}>Team Balls</div>
        </div>
      </div>

      {/* Match Cards */}
      <div className="max-w-2xl mx-auto px-4 pb-8 space-y-4">
        {getMatchesForDay(selectedDay).map(match => {
          const result = getMatchResult(match);
          const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
          const status = getMatchStatus(match);
          const shaftsPlayers = team1IsShafts ? match.team1_players : match.team2_players;
          const ballsPlayers = team1IsShafts ? match.team2_players : match.team1_players;
          const shaftsTotal = team1IsShafts ? result.team1_total : result.team2_total;
          const ballsTotal = team1IsShafts ? result.team2_total : result.team1_total;

          return (
            <div key={match.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Match Header - Players */}
              <div className="flex items-stretch border-b border-gray-200">
                <div className="flex-1 p-3 text-left">
                  {shaftsPlayers.map(name => {
                    const p = players.find(pl => pl.name === name);
                    return (
                      <div key={name} className="flex items-center gap-2 mb-1 last:mb-0">
                        {p?.avatar_url ? (
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-blue-300 shrink-0">
                            <img src={p.avatar_url} alt={name} className="w-full h-full object-cover" style={{ objectPosition: p.avatar_position || 'center 30%' }} />
                          </div>
                        ) : null}
                        <span className="font-bold text-sm text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
                          {name.toUpperCase()} <sup className="text-[10px] text-gray-500 font-normal">{p?.playing_handicap}</sup>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center px-3 text-center border-x border-gray-200">
                  <div>
                    <div className="text-xs text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>Match {match.group_number}</div>
                    <div className="text-xs text-gray-400">{match.format}</div>
                  </div>
                </div>
                <div className="flex-1 p-3 text-right">
                  {ballsPlayers.map(name => {
                    const p = players.find(pl => pl.name === name);
                    return (
                      <div key={name} className="flex items-center gap-2 mb-1 last:mb-0 justify-end">
                        <span className="font-bold text-sm text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
                          {name.toUpperCase()} <sup className="text-[10px] text-gray-500 font-normal">{p?.playing_handicap}</sup>
                        </span>
                        {p?.avatar_url ? (
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-red-300 shrink-0">
                            <img src={p.avatar_url} alt={name} className="w-full h-full object-cover" style={{ objectPosition: p.avatar_position || 'center 30%' }} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Score Bar */}
              <div className="flex items-center bg-[#2a6b7c] text-white">
                <div className="flex-1 flex items-center gap-2 px-3 py-2">
                  <span className="text-lg font-bold">{shaftsTotal}</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                    {(() => { const pts = team1IsShafts ? result.team1_front + result.team1_back : result.team2_front + result.team2_back; return `${pts}pts`; })()}
                  </span>
                </div>
                <div className="px-4 py-2 text-center">
                  <span className="text-sm font-semibold">{status}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 px-3 py-2 justify-end">
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                    {(() => { const pts = team1IsShafts ? result.team2_front + result.team2_back : result.team1_front + result.team1_back; return `${pts}pts`; })()}
                  </span>
                  <span className="text-lg font-bold">{ballsTotal}</span>
                </div>
              </div>
              {/* Actions */}
              <div className="flex border-t border-gray-200">
                <button
                  onClick={() => setModalMatch(match)}
                  className="flex-1 py-2.5 text-center text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-200"
                >
                  View Scorecard
                </button>
                <Link
                  href={`/score/${match.group_access_token}`}
                  className="flex-1 py-2.5 text-center text-sm font-medium text-[#2a6b7c] hover:bg-[#2a6b7c]/5 transition-colors"
                >
                  Enter Scores
                </Link>
              </div>
            </div>
          );
        })}

        {/* Day Links */}
        <div className="flex justify-center gap-3 pt-2">
          <Link href={`/day/${selectedDay}`} className="text-sm text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>
            View Day {selectedDay} Details
          </Link>
          <span className="text-gray-300">|</span>
          <Link href={`/skins/${selectedDay}`} className="text-sm text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>
            View Skins
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 px-4">
        <p className="text-xs text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>
          For more info, contact the site administrator. If you don&apos;t know who the site admin is, you don&apos;t need to contact him.
        </p>
      </div>

      {/* Scorecard Modal */}
      {modalMatch && (
        <ScorecardModal
          match={modalMatch}
          allPlayers={players}
          allScores={scores}
          courses={courses}
          onClose={() => setModalMatch(null)}
        />
      )}
    </div>
  );
}

function ScorecardModal({ match, allPlayers, allScores, courses, onClose }: {
  match: Match;
  allPlayers: Player[];
  allScores: Score[];
  courses: Course[];
  onClose: () => void;
}) {
  const course = courses.find(c => c.id === match.course_id);
  if (!course) return null;

  const allPlayerNames = [...match.team1_players, ...match.team2_players];
  const matchPlayers = [
    ...allPlayers.filter(p => match.team1_players.includes(p.name))
      .sort((a, b) => match.team1_players.indexOf(a.name) - match.team1_players.indexOf(b.name)),
    ...allPlayers.filter(p => match.team2_players.includes(p.name))
      .sort((a, b) => match.team2_players.indexOf(a.name) - match.team2_players.indexOf(b.name)),
  ];
  const matchScores = allScores.filter(s => s.match_id === match.id);

  const frontNine = Array.from({ length: 9 }, (_, i) => i + 1);
  const backNine = Array.from({ length: 9 }, (_, i) => i + 10);

  function getHoleData(hole: number) {
    return course!.par_data[`hole_${hole}`] || { par: 4, handicap: 1 };
  }

  function getPlayerScore(playerId: string, hole: number): number | null {
    const score = matchScores.find(s => s.player_id === playerId && s.hole_number === hole);
    return score?.gross_score || null;
  }

  function getStrokesOnHole(player: Player, holeNumber: number): number {
    if (match.format === 'Individual') {
      const isTeam1 = match.team1_players.includes(player.name);
      const idx = isTeam1 ? match.team1_players.indexOf(player.name) : match.team2_players.indexOf(player.name);
      const opponentName = isTeam1 ? match.team2_players[idx] : match.team1_players[idx];
      const opponent = allPlayers.find(p => p.name === opponentName);
      if (!opponent || !course) return 0;
      const strokeMap = calculateMatchPlayStrokes(player.playing_handicap, opponent.playing_handicap, course);
      return strokeMap[holeNumber] || 0;
    }
    
    const holeData = getHoleData(holeNumber);
    const fullStrokes = Math.floor(player.playing_handicap / 18);
    const extra = holeData.handicap <= (player.playing_handicap % 18) ? 1 : 0;
    return fullStrokes + extra;
  }

  function calcTotal(playerId: string, holes: number[]): number {
    return holes.reduce((sum, hole) => sum + (getPlayerScore(playerId, hole) || 0), 0);
  }

  const team1IsShafts = allPlayers.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] max-h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="shrink-0 bg-newspaper-dark text-white p-4 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Group {match.group_number} — Day {match.day}</h2>
            <p className="text-sm text-gray-300">{course.name} • {match.format}</p>
          </div>
          <button onClick={onClose} className="text-3xl leading-none hover:text-gray-300 ml-4">&times;</button>
        </div>

        <div className="overflow-auto flex-1">
        {/* Match Result Summary */}
        <div className="flex flex-wrap justify-center items-center gap-3 py-3 px-2 bg-gray-50 border-b">
          <div className={`flex items-center gap-2 px-3 py-2 rounded ${team1IsShafts ? 'bg-blue-100' : 'bg-red-100'}`}>
            <div className="flex -space-x-2">
              {match.team1_players.map(name => {
                const p = allPlayers.find(pl => pl.name === name);
                const initials = p?.first_name && p?.last_name ? `${p.first_name.charAt(0)}${p.last_name.charAt(0)}` : name.charAt(0);
                return p?.avatar_url ? (
                  <div key={name} className="w-8 h-8 rounded-full overflow-hidden border-2 border-white">
                    <img src={p.avatar_url} alt={name} className="w-full h-full object-cover" style={{ objectPosition: p.avatar_position || 'center 30%' }} />
                  </div>
                ) : (
                  <div key={name} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white ${team1IsShafts ? 'bg-blue-500' : 'bg-red-500'}`}>{initials}</div>
                );
              })}
            </div>
            <div>
              <div className="font-semibold text-sm">{match.team1_players.join(' & ')}</div>
              <div className="text-xs text-gray-500">{team1IsShafts ? 'Shaft' : 'Balls'}</div>
            </div>
          </div>
          <div className="text-lg font-light text-gray-400">vs</div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded ${!team1IsShafts ? 'bg-blue-100' : 'bg-red-100'}`}>
            <div className="flex -space-x-2">
              {match.team2_players.map(name => {
                const p = allPlayers.find(pl => pl.name === name);
                const initials = p?.first_name && p?.last_name ? `${p.first_name.charAt(0)}${p.last_name.charAt(0)}` : name.charAt(0);
                return p?.avatar_url ? (
                  <div key={name} className="w-8 h-8 rounded-full overflow-hidden border-2 border-white">
                    <img src={p.avatar_url} alt={name} className="w-full h-full object-cover" style={{ objectPosition: p.avatar_position || 'center 30%' }} />
                  </div>
                ) : (
                  <div key={name} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white ${!team1IsShafts ? 'bg-blue-500' : 'bg-red-500'}`}>{initials}</div>
                );
              })}
            </div>
            <div>
              <div className="font-semibold text-sm">{match.team2_players.join(' & ')}</div>
              <div className="text-xs text-gray-500">{!team1IsShafts ? 'Shaft' : 'Balls'}</div>
            </div>
          </div>
        </div>

        {/* Scorecard Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-newspaper-dark text-white">
                <th className="px-2 py-1.5 text-left sticky left-0 bg-newspaper-dark z-10 min-w-[90px]">Hole</th>
                {frontNine.map(h => <th key={h} className="px-1 py-1.5 text-center min-w-[28px]">{h}</th>)}
                <th className="px-1.5 py-1.5 text-center bg-yellow-600 font-bold">OUT</th>
                {backNine.map(h => <th key={h} className="px-1 py-1.5 text-center min-w-[28px]">{h}</th>)}
                <th className="px-1.5 py-1.5 text-center bg-yellow-600 font-bold">IN</th>
                <th className="px-1.5 py-1.5 text-center bg-green-700 font-bold">TOT</th>
              </tr>
              <tr className="bg-gray-100 border-b">
                <td className="px-2 py-1 font-semibold sticky left-0 bg-gray-100 z-10">Par</td>
                {frontNine.map(h => <td key={h} className="px-1 py-1 text-center font-semibold">{getHoleData(h).par}</td>)}
                <td className="px-1.5 py-1 text-center font-bold bg-yellow-50">{frontNine.reduce((s, h) => s + getHoleData(h).par, 0)}</td>
                {backNine.map(h => <td key={h} className="px-1 py-1 text-center font-semibold">{getHoleData(h).par}</td>)}
                <td className="px-1.5 py-1 text-center font-bold bg-yellow-50">{backNine.reduce((s, h) => s + getHoleData(h).par, 0)}</td>
                <td className="px-1.5 py-1 text-center font-bold bg-green-50">{course.par_data.total_par}</td>
              </tr>
              <tr className="bg-gray-50 border-b-2 border-gray-300">
                <td className="px-2 py-1 font-semibold sticky left-0 bg-gray-50 z-10">Hcp</td>
                {frontNine.map(h => <td key={h} className="px-1 py-1 text-center text-[10px] text-gray-400">{getHoleData(h).handicap}</td>)}
                <td className="bg-yellow-50"></td>
                {backNine.map(h => <td key={h} className="px-1 py-1 text-center text-[10px] text-gray-400">{getHoleData(h).handicap}</td>)}
                <td className="bg-yellow-50"></td>
                <td className="bg-green-50"></td>
              </tr>
            </thead>
            <tbody>
              {matchPlayers.map((player, idx) => {
                const isTeam1 = match.team1_players.includes(player.name);
                const isShafts = player.team === 'Shaft';
                const showSep = idx > 0 && match.team1_players.includes(matchPlayers[idx - 1].name) !== isTeam1;

                const renderHoles = (holes: number[]) => holes.map(hole => {
                  const score = getPlayerScore(player.id, hole);
                  const holeData = getHoleData(hole);
                  const strokes = getStrokesOnHole(player, hole);
                  const netScore = score ? score - strokes : null;
                  const diff = netScore !== null ? netScore - holeData.par : null;

                  let bg = '';
                  let fw = '';
                  if (score && diff !== null) {
                    if (diff <= -2) { bg = 'bg-yellow-300'; fw = 'font-bold'; }
                    else if (diff === -1) { bg = 'bg-green-200'; fw = 'font-bold'; }
                    else if (diff === 1) { bg = 'bg-red-100'; }
                    else if (diff >= 2) { bg = 'bg-red-200'; }
                  }

                  return (
                    <td key={hole} className={`px-1 py-1.5 text-center relative ${bg} ${fw}`}>
                      {score || '—'}
                      {strokes > 0 && (
                        <div className="flex justify-center gap-[1px] mt-[1px]">
                          {Array.from({ length: strokes }, (_, i) => (
                            <span key={i} className="inline-block w-[3px] h-[3px] bg-black rounded-full"></span>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                });

                return (
                  <React.Fragment key={player.id}>
                    {showSep && <tr><td colSpan={22} className="bg-gray-300 h-[2px]"></td></tr>}
                    <tr className={`border-t ${isShafts ? 'bg-blue-50/30' : 'bg-red-50/30'}`}>
                      <td className={`px-2 py-1.5 font-semibold sticky left-0 z-10 ${isShafts ? 'bg-blue-50' : 'bg-red-50'}`}>
                        <span className={isShafts ? 'text-blue-700' : 'text-red-700'}>{player.name}</span>
                        <span className="text-[10px] text-gray-500 ml-1">({player.playing_handicap})</span>
                      </td>
                      {renderHoles(frontNine)}
                      <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50">{calcTotal(player.id, frontNine) || '—'}</td>
                      {renderHoles(backNine)}
                      <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50">{calcTotal(player.id, backNine) || '—'}</td>
                      <td className="px-1.5 py-1.5 text-center font-bold bg-green-50">{calcTotal(player.id, [...frontNine, ...backNine]) || '—'}</td>
                    </tr>
                    {/* Stableford Points Row for Day 2 */}
                    {match.format === 'Stableford' && (
                      <tr className={`${isShafts ? 'bg-blue-50/10' : 'bg-red-50/10'} border-b`}>
                        <td className={`px-2 py-0.5 text-[9px] font-semibold sticky left-0 z-10 ${isShafts ? 'bg-blue-50' : 'bg-red-50'} text-gray-500`}>Pts</td>
                        {[...frontNine].map(hole => {
                          const score = getPlayerScore(player.id, hole);
                          const hd = getHoleData(hole);
                          const strokes = getStrokesOnHole(player, hole);
                          const net = score ? score - strokes : null;
                          const pts = net !== null ? calculateStablefordPoints(net, hd.par) : null;
                          return (
                            <td key={hole} className={`px-1 py-0.5 text-center text-[9px] font-bold ${
                              pts === null ? '' : pts >= 3 ? 'text-green-700' : pts === 2 ? 'text-blue-600' : pts === 1 ? 'text-yellow-700' : 'text-red-600'
                            }`}>{pts !== null ? pts : ''}</td>
                          );
                        })}
                        <td className="px-1.5 py-0.5 text-center text-[9px] font-bold bg-yellow-50">
                          {frontNine.reduce((s, h) => { const sc = getPlayerScore(player.id, h); const hd = getHoleData(h); const st = getStrokesOnHole(player, h); const n = sc ? sc - st : null; return s + (n !== null ? calculateStablefordPoints(n, hd.par) : 0); }, 0) || ''}
                        </td>
                        {[...backNine].map(hole => {
                          const score = getPlayerScore(player.id, hole);
                          const hd = getHoleData(hole);
                          const strokes = getStrokesOnHole(player, hole);
                          const net = score ? score - strokes : null;
                          const pts = net !== null ? calculateStablefordPoints(net, hd.par) : null;
                          return (
                            <td key={hole} className={`px-1 py-0.5 text-center text-[9px] font-bold ${
                              pts === null ? '' : pts >= 3 ? 'text-green-700' : pts === 2 ? 'text-blue-600' : pts === 1 ? 'text-yellow-700' : 'text-red-600'
                            }`}>{pts !== null ? pts : ''}</td>
                          );
                        })}
                        <td className="px-1.5 py-0.5 text-center text-[9px] font-bold bg-yellow-50">
                          {backNine.reduce((s, h) => { const sc = getPlayerScore(player.id, h); const hd = getHoleData(h); const st = getStrokesOnHole(player, h); const n = sc ? sc - st : null; return s + (n !== null ? calculateStablefordPoints(n, hd.par) : 0); }, 0) || ''}
                        </td>
                        <td className="px-1.5 py-0.5 text-center text-[9px] font-bold bg-green-50">
                          {[...frontNine, ...backNine].reduce((s, h) => { const sc = getPlayerScore(player.id, h); const hd = getHoleData(h); const st = getStrokesOnHole(player, h); const n = sc ? sc - st : null; return s + (n !== null ? calculateStablefordPoints(n, hd.par) : 0); }, 0) || ''}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {/* Match Play Row for Day 1 & Day 2 */}
              {(match.format === 'Best Ball' || match.format === 'Stableford') && (() => {
                const team1Players = matchPlayers.filter(p => match.team1_players.includes(p.name));
                const team2Players = matchPlayers.filter(p => match.team2_players.includes(p.name));

                function getHoleWinner(hole: number) {
                  if (match.format === 'Best Ball') {
                    // Best NET in cart per team
                    const team1Nets = team1Players.map(p => {
                      const score = getPlayerScore(p.id, hole);
                      if (!score) return null;
                      return score - getStrokesOnHole(p, hole);
                    }).filter(n => n !== null) as number[];
                    const team2Nets = team2Players.map(p => {
                      const score = getPlayerScore(p.id, hole);
                      if (!score) return null;
                      return score - getStrokesOnHole(p, hole);
                    }).filter(n => n !== null) as number[];
                    
                    if (team1Nets.length === 0 || team2Nets.length === 0) return null;
                    const best1 = Math.min(...team1Nets);
                    const best2 = Math.min(...team2Nets);
                    if (best1 < best2) return 'team1';
                    if (best2 < best1) return 'team2';
                    return 'tie';
                  } else {
                    // Stableford: highest combined points per team
                    let team1Pts = 0, team2Pts = 0;
                    let team1HasScore = false, team2HasScore = false;
                    team1Players.forEach(p => {
                      const score = getPlayerScore(p.id, hole);
                      if (score) {
                        team1HasScore = true;
                        const net = score - getStrokesOnHole(p, hole);
                        team1Pts += calculateStablefordPoints(net, getHoleData(hole).par);
                      }
                    });
                    team2Players.forEach(p => {
                      const score = getPlayerScore(p.id, hole);
                      if (score) {
                        team2HasScore = true;
                        const net = score - getStrokesOnHole(p, hole);
                        team2Pts += calculateStablefordPoints(net, getHoleData(hole).par);
                      }
                    });
                    if (!team1HasScore || !team2HasScore) return null;
                    if (team1Pts > team2Pts) return 'team1';
                    if (team2Pts > team1Pts) return 'team2';
                    return 'tie';
                  }
                }

                const team1Color = team1IsShafts ? 'bg-blue-500' : 'bg-red-500';
                const team2Color = team1IsShafts ? 'bg-red-500' : 'bg-blue-500';

                const renderMatchHoles = (holes: number[]) => holes.map(hole => {
                  const winner = getHoleWinner(hole);
                  return (
                    <td key={hole} className="px-1 py-1.5 text-center">
                      {winner === null ? '' :
                       winner === 'tie' ? <span className="text-gray-400 font-bold">–</span> :
                       <span className={`inline-block w-2.5 h-2.5 rounded-full ${winner === 'team1' ? team1Color : team2Color}`}></span>}
                    </td>
                  );
                });

                // Calculate running totals for front/back/total
                function countWins(holes: number[]) {
                  let t1 = 0, t2 = 0;
                  holes.forEach(h => {
                    const w = getHoleWinner(h);
                    if (w === 'team1') t1++;
                    if (w === 'team2') t2++;
                  });
                  return { t1, t2 };
                }
                const front = countWins(frontNine);
                const back = countWins(backNine);
                const total = { t1: front.t1 + back.t1, t2: front.t2 + back.t2 };

                return (
                  <>
                    <tr><td colSpan={22} className="bg-gray-300 h-[2px]"></td></tr>
                    <tr className="bg-gray-50 border-t-2 border-gray-300">
                      <td className="px-2 py-1.5 font-bold text-[10px] uppercase text-gray-600 sticky left-0 bg-gray-50 z-10">Match</td>
                      {renderMatchHoles(frontNine)}
                      <td className="px-1.5 py-1.5 text-center text-[10px] font-bold bg-yellow-50">{front.t1}-{front.t2}</td>
                      {renderMatchHoles(backNine)}
                      <td className="px-1.5 py-1.5 text-center text-[10px] font-bold bg-yellow-50">{back.t1}-{back.t2}</td>
                      <td className="px-1.5 py-1.5 text-center text-[10px] font-bold bg-green-50">{total.t1}-{total.t2}</td>
                    </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="p-3 bg-gray-50 border-t flex flex-wrap gap-3 text-[10px] rounded-b-xl">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-yellow-300 rounded"></span> Eagle+</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-green-200 rounded"></span> Birdie</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-red-100 rounded"></span> Bogey</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-red-200 rounded"></span> Double+</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-[4px] h-[4px] bg-black rounded-full"></span> = Stroke
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}