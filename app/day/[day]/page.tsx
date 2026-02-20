'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculateBestBallResults, calculateStablefordResults, calculateIndividualResults } from '@/lib/scoring';
import type { Player, Match, Score, Course, MatchResult } from '@/lib/scoring';

export default function DayDetail() {
  const params = useParams();
  const day = parseInt(params.day as string);
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (day && day >= 1 && day <= 3) {
      fetchDayData();
    }
  }, [day]);

  async function fetchDayData() {
    try {
      const [playersResult, matchesResult, scoresResult, coursesResult] = await Promise.all([
        supabase.from('players').select('*'),
        supabase.from('matches').select('*').eq('day', day),
        supabase.from('scores').select('*'),
        supabase.from('courses').select('*').eq('day', day)
      ]);

      if (playersResult.data) setPlayers(playersResult.data);
      if (matchesResult.data) setMatches(matchesResult.data);
      if (scoresResult.data) setScores(scoresResult.data);
      if (coursesResult.data) setCourses(coursesResult.data);
    } catch (error) {
      console.error('Error fetching day data:', error);
    } finally {
      setLoading(false);
    }
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
    return `In Progress (${Math.floor(completedHoles / totalPlayersInMatch)}/18 holes)`;
  }

  function getDayInfo() {
    switch (day) {
      case 1:
        return {
          title: 'Day 1 - Ritz Carlton GC (Blue Tees)',
          format: 'Team Best Ball Match Play',
          rules: [
            '75% Handicap',
            'Low NET score in cart is TEAM score for the hole',
            '2 man matches with 3 total points per match',
            '1 point front, 1 point back, 1 point total',
            'Ties = half point'
          ]
        };
      case 2:
        return {
          title: 'Day 2 - Southern Dunes (Blue/White Blended)',
          format: 'Stableford',
          rules: [
            '75% Handicap',
            '2 man matches with 3 total points per match',
            '1 point front, 1 point back, 1 point total',
            '1 additional point for best overall team total',
            'Ties = half point'
          ]
        };
      case 3:
        return {
          title: 'Day 3 - Champions Gate International (White Tees)',
          format: 'Individual Match Play',
          rules: [
            '75% Handicap off low man in the match',
            '3 total points per match (1 front, 1 back, 1 total)',
            'Team with most points for the day gets 1 additional point',
            'Ties = half point'
          ]
        };
      default:
        return {
          title: 'Unknown Day',
          format: '',
          rules: [] as string[]
        };
    }
  }

  function calculateDayTotals() {
    let shaftsPoints = 0;
    let ballsPoints = 0;

    matches.forEach(match => {
      const result = getMatchResult(match);
      const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
      
      if (team1IsShafts) {
        shaftsPoints += result.team1_total;
        ballsPoints += result.team2_total;
      } else {
        ballsPoints += result.team1_total;
        shaftsPoints += result.team2_total;
      }
    });

    return { shafts: shaftsPoints, balls: ballsPoints };
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl">Loading day data...</div>
      </div>
    );
  }

  if (!day || day < 1 || day > 3) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-xl text-red-600">Invalid day</div>
      </div>
    );
  }

  const dayInfo = getDayInfo();
  const dayTotals = calculateDayTotals();

  return (
    <div className="container mx-auto px-4 py-8 relative">
      {/* Close Button */}
      <Link href="/" className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-900 transition-colors text-xl font-bold z-10">
        ✕
      </Link>

      {/* Day Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="text-center">
          <h1 className="newspaper-header text-4xl mb-2">{dayInfo.title}</h1>
          <p className="text-xl text-gray-600 mb-4">{dayInfo.format}</p>
          {dayInfo.rules.length > 0 && (
            <ul className="text-gray-500 text-sm max-w-xl mx-auto space-y-1 text-left">
              {dayInfo.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          )}
          
          {/* Day Totals */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Day {day} Results</h3>
            <div className="flex justify-center items-center space-x-8">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">Team Shaft</div>
                <div className="text-3xl font-bold text-blue-600">{dayTotals.shafts}</div>
              </div>
              <div className="text-4xl font-light text-gray-400">vs</div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">Team Balls</div>
                <div className="text-3xl font-bold text-red-600">{dayTotals.balls}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Matches */}
      <div className="space-y-6">
        {matches.map(match => {
          const result = getMatchResult(match);
          const team1IsShafts = players.find(p => match.team1_players.includes(p.name))?.team === 'Shaft';
          const status = getMatchStatus(match);
          
          return (
            <div key={match.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold">Group {match.group_number}</h3>
                  <p className="text-gray-600">{status}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Total Points</div>
                  <div className="text-2xl font-bold">
                    {result.team1_total} - {result.team2_total}
                  </div>
                </div>
              </div>

              {/* Team Matchup */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className={`p-4 rounded-lg ${team1IsShafts ? 'bg-blue-50' : 'bg-red-50'}`}>
                  <div className="font-semibold text-lg">
                    {match.team1_players.join(' & ')}
                  </div>
                  <div className="text-sm text-gray-600">
                    Team {team1IsShafts ? 'Shaft' : 'Balls'}
                  </div>
                  <div className="mt-2 text-sm">
                    Front: {result.team1_front} • Back: {result.team1_back} • Total: {result.team1_total}
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${!team1IsShafts ? 'bg-blue-50' : 'bg-red-50'}`}>
                  <div className="font-semibold text-lg">
                    {match.team2_players.join(' & ')}
                  </div>
                  <div className="text-sm text-gray-600">
                    Team {!team1IsShafts ? 'Shaft' : 'Balls'}
                  </div>
                  <div className="mt-2 text-sm">
                    Front: {result.team2_front} • Back: {result.team2_back} • Total: {result.team2_total}
                  </div>
                </div>
              </div>

              {/* Match Actions */}
              <div className="flex justify-center space-x-3">
                <Link
                  href={`/match/${match.id}`}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  View Scorecard
                </Link>
                <Link
                  href={`/score/${match.group_access_token}`}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Enter Scores
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-center gap-4 flex-wrap">
        <Link href="/" className="btn-secondary">
          Back to Leaderboard
        </Link>
        <Link href={`/skins/${day}`} className="btn-primary">
          View Skins for Day {day}
        </Link>
      </div>
    </div>
  );
}