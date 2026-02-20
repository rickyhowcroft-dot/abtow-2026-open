'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/scoring'

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.first_name && player.last_name 
    ? `${player.first_name.charAt(0)}${player.last_name.charAt(0)}`
    : player.name.charAt(0)
  
  const teamColor = player.team === 'Shaft' ? 'bg-team-shafts text-white' : 'bg-team-balls text-white'
  
  return (
    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${teamColor} mx-auto mb-3`}>
      {initials}
    </div>
  )
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPlayers()
  }, [])

  async function fetchPlayers() {
    setLoading(true)
    
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name')
      
      if (error) {
        console.error('Error fetching players:', error)
      } else if (data) {
        setPlayers(data)
      }
    } catch (error) {
      console.error('Failed to fetch players:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-96">
          <div className="text-xl">Loading players...</div>
        </div>
      </div>
    )
  }

  const shaftPlayers = players.filter(p => p.team === 'Shaft')
  const ballPlayers = players.filter(p => p.team === 'Balls')

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="newspaper-header text-4xl text-center mb-8">Tournament Players</h1>
      
      {/* Team Shaft */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-team-shafts mb-6 text-center">Team Shaft</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {shaftPlayers.map(player => (
            <Link 
              key={player.id}
              href={`/players/${encodeURIComponent(player.name)}`}
              className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow text-center"
            >
              <PlayerAvatar player={player} />
              <h3 className="font-semibold text-lg mb-1">
                {player.first_name && player.last_name 
                  ? `${player.first_name} ${player.last_name}`
                  : player.name}
              </h3>
              <p className="text-team-shafts font-medium text-sm mb-2">Team Shaft</p>
              <div className="text-sm text-gray-600">
                <p>Handicap: {player.raw_handicap}</p>
                <p>Playing: {player.playing_handicap}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Team Balls */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-team-balls mb-6 text-center">Team Balls</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {ballPlayers.map(player => (
            <Link 
              key={player.id}
              href={`/players/${encodeURIComponent(player.name)}`}
              className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow text-center"
            >
              <PlayerAvatar player={player} />
              <h3 className="font-semibold text-lg mb-1">
                {player.first_name && player.last_name 
                  ? `${player.first_name} ${player.last_name}`
                  : player.name}
              </h3>
              <p className="text-team-balls font-medium text-sm mb-2">Team Balls</p>
              <div className="text-sm text-gray-600">
                <p>Handicap: {player.raw_handicap}</p>
                <p>Playing: {player.playing_handicap}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}