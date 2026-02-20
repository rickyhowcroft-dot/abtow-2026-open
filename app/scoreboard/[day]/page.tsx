'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  calculateNetScore, calculateStablefordPoints, calculateMatchPlayStrokes,
  calculateBestBallResults, calculateStablefordResults, calculateIndividualResults
} from '@/lib/scoring';
import type { Player, Match, Score, Course, MatchResult, HoleData } from '@/lib/scoring';

const FRONT = [1,2,3,4,5,6,7,8,9];
const BACK = [10,11,12,13,14,15,16,17,18];

function holeData(course: Course, hole: number): HoleData {
  return course.par_data[`hole_${hole}`] || { par: 4, handicap: 1 };
}

function getStrokesRegular(hcp: number, holeHcp: number): number {
  return Math.floor(hcp / 18) + (holeHcp <= (hcp % 18) ? 1 : 0);
}

export default function ScoreboardPage() {
  const params = useParams();
  const day = parseInt(params.day as string);

  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const sub = supabase
      .channel('scoreboard_scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchScores())
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [day]);

  async function fetchData() {
    setLoading(true);
    const [p, m, s, c] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('matches').select('*').eq('day', day).order('group_number'),
      supabase.from('scores').select('*'),
      supabase.from('courses').select('*').eq('day', day),
    ]);
    if (p.data) setPlayers(p.data);
    if (m.data) setMatches(m.data);
    if (s.data) setScores(s.data);
    if (c.data) setCourses(c.data);
    setLoading(false);
  }

  async function fetchScores() {
    const { data } = await supabase.from('scores').select('*');
    if (data) setScores(data);
  }

  function getScore(playerId: string, hole: number): number | null {
    return scores.find(s => s.match_id && s.player_id === playerId && s.hole_number === hole)?.gross_score || null;
  }

  function getMatchScores(matchId: string) {
    return scores.filter(s => s.match_id === matchId);
  }

  function getResult(match: Match): MatchResult {
    const course = courses.find(c => c.id === match.course_id);
    if (!course) return { match_id: match.id, team1_front: 0, team1_back: 0, team1_total: 0, team2_front: 0, team2_back: 0, team2_total: 0, status: 'upcoming' };
    switch (match.format) {
      case 'Best Ball': return calculateBestBallResults(match, scores, players, course);
      case 'Stableford': return calculateStablefordResults(match, scores, players, course);
      case 'Individual': return calculateIndividualResults(match, scores, players, course);
      default: return { match_id: match.id, team1_front: 0, team1_back: 0, team1_total: 0, team2_front: 0, team2_back: 0, team2_total: 0, status: 'upcoming' };
    }
  }

  const dayInfo: Record<number, { title: string; format: string }> = {
    1: { title: 'Day 1 — Ritz Carlton GC (Blue)', format: 'Team Best Ball Match Play' },
    2: { title: 'Day 2 — Southern Dunes (Blue/White)', format: 'Stableford' },
    3: { title: 'Day 3 — Champions Gate International (White)', format: 'Individual Match Play' },
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-96"><div className="text-xl">Loading scoreboard...</div></div>;
  }

  const course = courses[0];
  if (!course) return <div className="text-center py-8 text-red-600">Course not found</div>;

  // Calculate day totals
  let shaftPts = 0, ballsPts = 0;
  const hasAnyScores = scores.some(s => matches.some(m => m.id === s.match_id) && s.gross_score !== null);
  matches.forEach(m => {
    const r = getResult(m);
    const t1Shaft = players.find(p => m.team1_players.includes(p.name))?.team === 'Shaft';
    if (t1Shaft) { shaftPts += r.team1_total; ballsPts += r.team2_total; }
    else { ballsPts += r.team1_total; shaftPts += r.team2_total; }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-newspaper-dark text-white py-4 px-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link href="/" className="text-gray-300 hover:text-white">← Back</Link>
          <div className="text-center">
            <h1 className="newspaper-header text-2xl">{dayInfo[day]?.title}</h1>
            <p className="text-gray-300 text-sm">{dayInfo[day]?.format}</p>
          </div>
          <div className="w-16"></div>
        </div>
      </div>

      {/* Day Tabs */}
      <div className="flex justify-center py-3 bg-white border-b">
        {[1, 2, 3].map(d => (
          <Link key={d} href={`/scoreboard/${d}`}
            className={`px-5 py-2 mx-1 rounded-md font-semibold text-sm ${day === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Day {d}
          </Link>
        ))}
      </div>

      {/* Team Totals */}
      <div className="flex justify-center items-center gap-8 py-4 bg-white border-b">
        <div className="text-center">
          <div className="text-sm font-bold text-blue-600">Team Shaft</div>
          <div className="text-3xl font-bold text-blue-600">{hasAnyScores ? shaftPts : '—'}</div>
        </div>
        <div className="text-xl font-light text-gray-400">vs</div>
        <div className="text-center">
          <div className="text-sm font-bold text-red-600">Team Balls</div>
          <div className="text-3xl font-bold text-red-600">{hasAnyScores ? ballsPts : '—'}</div>
        </div>
      </div>

      {/* Scoreboards */}
      <div className="p-4 max-w-7xl mx-auto space-y-6">
        {matches.map(match => (
          <MatchScoreboard
            key={match.id}
            match={match}
            course={course}
            players={players}
            scores={scores}
            day={day}
          />
        ))}
      </div>
    </div>
  );
}

function MatchScoreboard({ match, course, players, scores, day }: {
  match: Match; course: Course; players: Player[]; scores: Score[]; day: number;
}) {
  const matchScores = scores.filter(s => s.match_id === match.id);
  const t1Players = players.filter(p => match.team1_players.includes(p.name));
  const t2Players = players.filter(p => match.team2_players.includes(p.name));
  const t1IsShaft = t1Players[0]?.team === 'Shaft';

  function getScore(pid: string, hole: number): number | null {
    return matchScores.find(s => s.player_id === pid && s.hole_number === hole)?.gross_score || null;
  }

  function sumScores(pid: string, holes: number[]): number {
    return holes.reduce((s, h) => s + (getScore(pid, h) || 0), 0);
  }

  // Calculate per-hole results based on format
  function getHoleResult(hole: number): 'team1' | 'team2' | 'tie' | 'none' {
    const hd = holeData(course, hole);

    if (day === 1) {
      // Best Ball: compare best NET score
      let t1Best = Infinity, t2Best = Infinity;
      t1Players.forEach(p => {
        const sc = getScore(p.id, hole);
        if (sc) t1Best = Math.min(t1Best, sc - getStrokesRegular(p.playing_handicap, hd.handicap));
      });
      t2Players.forEach(p => {
        const sc = getScore(p.id, hole);
        if (sc) t2Best = Math.min(t2Best, sc - getStrokesRegular(p.playing_handicap, hd.handicap));
      });
      if (t1Best === Infinity || t2Best === Infinity) return 'none';
      if (t1Best < t2Best) return 'team1';
      if (t2Best < t1Best) return 'team2';
      return 'tie';
    }

    if (day === 2) {
      // Stableford: compare combined team points
      let t1Pts = 0, t2Pts = 0;
      let hasT1 = false, hasT2 = false;
      t1Players.forEach(p => {
        const sc = getScore(p.id, hole);
        if (sc) { hasT1 = true; const net = sc - getStrokesRegular(p.playing_handicap, hd.handicap); t1Pts += calculateStablefordPoints(net, hd.par); }
      });
      t2Players.forEach(p => {
        const sc = getScore(p.id, hole);
        if (sc) { hasT2 = true; const net = sc - getStrokesRegular(p.playing_handicap, hd.handicap); t2Pts += calculateStablefordPoints(net, hd.par); }
      });
      if (!hasT1 || !hasT2) return 'none';
      if (t1Pts > t2Pts) return 'team1';
      if (t2Pts > t1Pts) return 'team2';
      return 'tie';
    }

    if (day === 3) {
      // Individual: simplified - check if both have scores
      // For the group view, show combined individual results
      let t1Wins = 0, t2Wins = 0;
      for (let i = 0; i < Math.min(t1Players.length, t2Players.length); i++) {
        const p1 = t1Players[i], p2 = t2Players[i];
        const s1 = getScore(p1.id, hole), s2 = getScore(p2.id, hole);
        if (!s1 || !s2) continue;
        const strokes1 = calculateMatchPlayStrokes(p1.playing_handicap, p2.playing_handicap, course);
        const strokes2 = calculateMatchPlayStrokes(p2.playing_handicap, p1.playing_handicap, course);
        const n1 = s1 - (strokes1[hole] || 0);
        const n2 = s2 - (strokes2[hole] || 0);
        if (n1 < n2) t1Wins++;
        else if (n2 < n1) t2Wins++;
      }
      if (t1Wins === 0 && t2Wins === 0) return 'none';
      if (t1Wins > t2Wins) return 'team1';
      if (t2Wins > t1Wins) return 'team2';
      return 'tie';
    }

    return 'none';
  }

  // Count hole wins for front/back
  function countWins(holes: number[]): { t1: number; t2: number; ties: number } {
    let t1 = 0, t2 = 0, ties = 0;
    holes.forEach(h => {
      const r = getHoleResult(h);
      if (r === 'team1') t1++;
      else if (r === 'team2') t2++;
      else if (r === 'tie') ties++;
    });
    return { t1, t2, ties };
  }

  const frontWins = countWins(FRONT);
  const backWins = countWins(BACK);
  const totalWins = countWins([...FRONT, ...BACK]);

  // Match points
  function pts(front: { t1: number; t2: number }, back: { t1: number; t2: number }, total: { t1: number; t2: number }) {
    let t1 = 0, t2 = 0;
    if (front.t1 > front.t2) t1++; else if (front.t2 > front.t1) t2++; else { t1 += 0.5; t2 += 0.5; }
    if (back.t1 > back.t2) t1++; else if (back.t2 > back.t1) t2++; else { t1 += 0.5; t2 += 0.5; }
    if (total.t1 > total.t2) t1++; else if (total.t2 > total.t1) t2++; else { t1 += 0.5; t2 += 0.5; }
    return { t1, t2 };
  }

  const matchPts = pts(frontWins, backWins, totalWins);
  const hasScores = matchScores.some(s => s.gross_score !== null);

  const holeBgColor = (hole: number) => {
    const r = getHoleResult(hole);
    if (r === 'team1') return t1IsShaft ? 'bg-blue-100' : 'bg-red-100';
    if (r === 'team2') return t1IsShaft ? 'bg-red-100' : 'bg-blue-100';
    if (r === 'tie') return 'bg-gray-100';
    return '';
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Match Header */}
      <div className="bg-gray-800 text-white px-4 py-2 flex justify-between items-center">
        <span className="font-bold">Group {match.group_number}</span>
        <span className="text-sm text-gray-300">
          {hasScores ? `${matchPts.t1} - ${matchPts.t2}` : 'Not Started'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="px-2 py-1.5 text-left sticky left-0 bg-gray-100 z-10 min-w-[120px]">Player</th>
              {FRONT.map(h => <th key={h} className="px-1 py-1.5 text-center min-w-[26px]">{h}</th>)}
              <th className="px-1.5 py-1.5 text-center bg-yellow-100 font-bold">OUT</th>
              {BACK.map(h => <th key={h} className="px-1 py-1.5 text-center min-w-[26px]">{h}</th>)}
              <th className="px-1.5 py-1.5 text-center bg-yellow-100 font-bold">IN</th>
              <th className="px-1.5 py-1.5 text-center bg-green-100 font-bold">TOT</th>
            </tr>
            {/* Par row */}
            <tr className="border-b text-gray-500">
              <td className="px-2 py-1 sticky left-0 bg-white z-10 font-semibold">Par</td>
              {FRONT.map(h => <td key={h} className="px-1 py-1 text-center">{holeData(course, h).par}</td>)}
              <td className="px-1.5 py-1 text-center bg-yellow-50 font-semibold">{FRONT.reduce((s,h) => s + holeData(course,h).par, 0)}</td>
              {BACK.map(h => <td key={h} className="px-1 py-1 text-center">{holeData(course, h).par}</td>)}
              <td className="px-1.5 py-1 text-center bg-yellow-50 font-semibold">{BACK.reduce((s,h) => s + holeData(course,h).par, 0)}</td>
              <td className="px-1.5 py-1 text-center bg-green-50 font-semibold">{course.par_data.total_par}</td>
            </tr>
          </thead>
          <tbody>
            {/* Team 1 Players */}
            {t1Players.map(player => {
              const isShaft = player.team === 'Shaft';
              return (
                <tr key={player.id} className="border-b">
                  <td className={`px-2 py-1.5 sticky left-0 z-10 font-semibold ${isShaft ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                    {player.name} <span className="text-[9px] text-gray-400">({player.playing_handicap})</span>
                  </td>
                  {FRONT.map(h => {
                    const sc = getScore(player.id, h);
                    const hd = holeData(course, h);
                    let strokes = 0;
                    if (day === 3) {
                      const idx = match.team1_players.indexOf(player.name);
                      const opp = players.find(p => p.name === match.team2_players[idx]);
                      if (opp) strokes = (calculateMatchPlayStrokes(player.playing_handicap, opp.playing_handicap, course)[h] || 0);
                    } else {
                      strokes = getStrokesRegular(player.playing_handicap, hd.handicap);
                    }
                    const net = sc ? sc - strokes : null;
                    const diff = net !== null ? net - hd.par : null;
                    let bg = '';
                    if (sc && diff !== null) {
                      if (diff <= -2) bg = 'bg-yellow-200';
                      else if (diff === -1) bg = 'bg-green-200';
                      else if (diff === 1) bg = 'bg-red-50';
                      else if (diff >= 2) bg = 'bg-red-100';
                    }
                    return (
                      <td key={h} className={`px-1 py-1.5 text-center ${bg}`}>
                        {sc || '—'}
                        {strokes > 0 && <div className="flex justify-center gap-[1px]">{Array.from({length: strokes}, (_,i) => <span key={i} className="inline-block w-[3px] h-[3px] bg-black rounded-full"></span>)}</div>}
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50">{sumScores(player.id, FRONT) || '—'}</td>
                  {BACK.map(h => {
                    const sc = getScore(player.id, h);
                    const hd = holeData(course, h);
                    let strokes = 0;
                    if (day === 3) {
                      const idx = match.team1_players.indexOf(player.name);
                      const opp = players.find(p => p.name === match.team2_players[idx]);
                      if (opp) strokes = (calculateMatchPlayStrokes(player.playing_handicap, opp.playing_handicap, course)[h] || 0);
                    } else {
                      strokes = getStrokesRegular(player.playing_handicap, hd.handicap);
                    }
                    const net = sc ? sc - strokes : null;
                    const diff = net !== null ? net - hd.par : null;
                    let bg = '';
                    if (sc && diff !== null) {
                      if (diff <= -2) bg = 'bg-yellow-200';
                      else if (diff === -1) bg = 'bg-green-200';
                      else if (diff === 1) bg = 'bg-red-50';
                      else if (diff >= 2) bg = 'bg-red-100';
                    }
                    return (
                      <td key={h} className={`px-1 py-1.5 text-center ${bg}`}>
                        {sc || '—'}
                        {strokes > 0 && <div className="flex justify-center gap-[1px]">{Array.from({length: strokes}, (_,i) => <span key={i} className="inline-block w-[3px] h-[3px] bg-black rounded-full"></span>)}</div>}
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50">{sumScores(player.id, BACK) || '—'}</td>
                  <td className="px-1.5 py-1.5 text-center font-bold bg-green-50">{sumScores(player.id, [...FRONT, ...BACK]) || '—'}</td>
                </tr>
              );
            })}

            {/* Separator */}
            <tr><td colSpan={22} className="bg-gray-300 h-[2px]"></td></tr>

            {/* Team 2 Players */}
            {t2Players.map(player => {
              const isShaft = player.team === 'Shaft';
              return (
                <tr key={player.id} className="border-b">
                  <td className={`px-2 py-1.5 sticky left-0 z-10 font-semibold ${isShaft ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                    {player.name} <span className="text-[9px] text-gray-400">({player.playing_handicap})</span>
                  </td>
                  {FRONT.map(h => {
                    const sc = getScore(player.id, h);
                    const hd = holeData(course, h);
                    let strokes = 0;
                    if (day === 3) {
                      const idx = match.team2_players.indexOf(player.name);
                      const opp = players.find(p => p.name === match.team1_players[idx]);
                      if (opp) strokes = (calculateMatchPlayStrokes(player.playing_handicap, opp.playing_handicap, course)[h] || 0);
                    } else {
                      strokes = getStrokesRegular(player.playing_handicap, hd.handicap);
                    }
                    const net = sc ? sc - strokes : null;
                    const diff = net !== null ? net - hd.par : null;
                    let bg = '';
                    if (sc && diff !== null) {
                      if (diff <= -2) bg = 'bg-yellow-200';
                      else if (diff === -1) bg = 'bg-green-200';
                      else if (diff === 1) bg = 'bg-red-50';
                      else if (diff >= 2) bg = 'bg-red-100';
                    }
                    return (
                      <td key={h} className={`px-1 py-1.5 text-center ${bg}`}>
                        {sc || '—'}
                        {strokes > 0 && <div className="flex justify-center gap-[1px]">{Array.from({length: strokes}, (_,i) => <span key={i} className="inline-block w-[3px] h-[3px] bg-black rounded-full"></span>)}</div>}
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50">{sumScores(player.id, FRONT) || '—'}</td>
                  {BACK.map(h => {
                    const sc = getScore(player.id, h);
                    const hd = holeData(course, h);
                    let strokes = 0;
                    if (day === 3) {
                      const idx = match.team2_players.indexOf(player.name);
                      const opp = players.find(p => p.name === match.team1_players[idx]);
                      if (opp) strokes = (calculateMatchPlayStrokes(player.playing_handicap, opp.playing_handicap, course)[h] || 0);
                    } else {
                      strokes = getStrokesRegular(player.playing_handicap, hd.handicap);
                    }
                    const net = sc ? sc - strokes : null;
                    const diff = net !== null ? net - hd.par : null;
                    let bg = '';
                    if (sc && diff !== null) {
                      if (diff <= -2) bg = 'bg-yellow-200';
                      else if (diff === -1) bg = 'bg-green-200';
                      else if (diff === 1) bg = 'bg-red-50';
                      else if (diff >= 2) bg = 'bg-red-100';
                    }
                    return (
                      <td key={h} className={`px-1 py-1.5 text-center ${bg}`}>
                        {sc || '—'}
                        {strokes > 0 && <div className="flex justify-center gap-[1px]">{Array.from({length: strokes}, (_,i) => <span key={i} className="inline-block w-[3px] h-[3px] bg-black rounded-full"></span>)}</div>}
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50">{sumScores(player.id, BACK) || '—'}</td>
                  <td className="px-1.5 py-1.5 text-center font-bold bg-green-50">{sumScores(player.id, [...FRONT, ...BACK]) || '—'}</td>
                </tr>
              );
            })}

            {/* Hole Results Row */}
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td className="px-2 py-1.5 sticky left-0 bg-gray-50 z-10 font-bold text-[10px]">Result</td>
              {FRONT.map(h => (
                <td key={h} className={`px-1 py-1.5 text-center font-bold text-[10px] ${holeBgColor(h)}`}>
                  {getHoleResult(h) === 'team1' ? (t1IsShaft ? '🔵' : '🔴') :
                   getHoleResult(h) === 'team2' ? (t1IsShaft ? '🔴' : '🔵') :
                   getHoleResult(h) === 'tie' ? '—' : ''}
                </td>
              ))}
              <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50 text-[10px]">
                {hasScores ? `${frontWins.t1}-${frontWins.t2}` : ''}
              </td>
              {BACK.map(h => (
                <td key={h} className={`px-1 py-1.5 text-center font-bold text-[10px] ${holeBgColor(h)}`}>
                  {getHoleResult(h) === 'team1' ? (t1IsShaft ? '🔵' : '🔴') :
                   getHoleResult(h) === 'team2' ? (t1IsShaft ? '🔴' : '🔵') :
                   getHoleResult(h) === 'tie' ? '—' : ''}
                </td>
              ))}
              <td className="px-1.5 py-1.5 text-center font-bold bg-yellow-50 text-[10px]">
                {hasScores ? `${backWins.t1}-${backWins.t2}` : ''}
              </td>
              <td className="px-1.5 py-1.5 text-center font-bold bg-green-50 text-[10px]">
                {hasScores ? `${matchPts.t1}-${matchPts.t2}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
