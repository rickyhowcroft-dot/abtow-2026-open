'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/scoring'

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.first_name && player.last_name 
    ? `${player.first_name.charAt(0)}${player.last_name.charAt(0)}`
    : player.name.charAt(0)
  
  const teamColor = player.team === 'Shaft' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
  
  return (
    <div className="w-24 h-24 rounded-full overflow-hidden border-3 border-white shadow-md mx-auto mb-3">
      {player.avatar_url ? (
        <img 
          src={player.avatar_url} 
          alt={player.name}
          className="w-full h-full object-cover"
          style={{ objectPosition: player.avatar_position || 'center 30%' }}
        />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-2xl font-bold ${teamColor}`}>
          {initials}
        </div>
      )}
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
      <div className="min-h-screen flex justify-center items-center" style={{ backgroundColor: '#f5f0e8' }}>
        <div className="text-xl" style={{ fontFamily: 'Georgia, serif' }}>Loading players...</div>
      </div>
    )
  }

  const shaftPlayers = players.filter(p => p.team === 'Shaft')
  const ballPlayers = players.filter(p => p.team === 'Balls')

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-4 text-sm">
          <Link href="/" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Home</Link>
          <span className="text-gray-400 mx-2">›</span>
          <span className="text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>Players</span>
        </div>

        <h1 className="text-4xl text-center mb-8 text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>Tournament Players</h1>
        
        {/* Team Shaft */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-blue-600 mb-6 text-center" style={{ fontFamily: 'Georgia, serif' }}>Team Shaft</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {shaftPlayers.map(player => (
              <Link 
                key={player.id}
                href={`/players/${encodeURIComponent(player.name)}`}
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow text-center border-t-4 border-blue-500"
              >
                <PlayerAvatar player={player} />
                <h3 className="font-semibold text-lg mb-1" style={{ fontFamily: 'Georgia, serif' }}>
                  {player.first_name && player.last_name 
                    ? `${player.first_name} ${player.last_name}`
                    : player.name}
                </h3>
                <p className="text-blue-600 font-medium text-sm mb-2" style={{ fontFamily: 'Georgia, serif' }}>Team Shaft</p>
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
          <h2 className="text-2xl font-bold text-red-600 mb-6 text-center" style={{ fontFamily: 'Georgia, serif' }}>Team Balls</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {ballPlayers.map(player => (
              <Link 
                key={player.id}
                href={`/players/${encodeURIComponent(player.name)}`}
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow text-center border-t-4 border-red-500"
              >
                <PlayerAvatar player={player} />
                <h3 className="font-semibold text-lg mb-1" style={{ fontFamily: 'Georgia, serif' }}>
                  {player.first_name && player.last_name 
                    ? `${player.first_name} ${player.last_name}`
                    : player.name}
                </h3>
                <p className="text-red-600 font-medium text-sm mb-2" style={{ fontFamily: 'Georgia, serif' }}>Team Balls</p>
                <div className="text-sm text-gray-600">
                  <p>Handicap: {player.raw_handicap}</p>
                  <p>Playing: {player.playing_handicap}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
