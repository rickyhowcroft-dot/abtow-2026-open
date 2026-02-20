'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/scoring'

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.first_name && player.last_name 
    ? `${player.first_name.charAt(0)}${player.last_name.charAt(0)}`
    : player.name.charAt(0)
  
  const teamBg = player.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'

  return (
    <div className="mx-auto mb-6 w-40 h-40 sm:w-60 sm:h-60 rounded-full overflow-hidden border-4 border-white shadow-lg">
      {player.avatar_url ? (
        <img 
          src={player.avatar_url} 
          alt={player.name}
          className="w-full h-full object-cover" style={{ objectPosition: player.avatar_position || 'center 30%' }}
        />
      ) : (
        <div className={`w-40 h-40 sm:w-60 sm:h-60 rounded-full flex items-center justify-center text-5xl sm:text-7xl font-bold text-white ${teamBg} shadow-lg`}>
          {initials}
        </div>
      )}
    </div>
  )
}

export default function PlayerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const playerName = decodeURIComponent(params.name as string)

  useEffect(() => {
    fetchPlayer()
  }, [playerName])

  async function fetchPlayer() {
    setLoading(true)
    setNotFound(false)
    
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('name', playerName)
        .single()
      
      if (error || !data) {
        setNotFound(true)
      } else {
        setPlayer(data)
      }
    } catch (error) {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-96">
          <div className="text-xl">Loading player...</div>
        </div>
      </div>
    )
  }

  if (notFound || !player) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl mb-4">Player not found</h1>
          <p className="text-gray-600 mb-6">The player &ldquo;{playerName}&rdquo; could not be found.</p>
          <Link href="/players" className="btn-primary">Back to Players</Link>
        </div>
      </div>
    )
  }

  const displayName = player.first_name && player.last_name 
    ? `${player.first_name} ${player.last_name}`
    : player.name

  const teamBgColor = player.team === 'Shaft' ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 text-sm">
          <Link href="/" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Home</Link>
          <span className="text-gray-400 mx-2">›</span>
          <Link href="/players" className="text-[#2a6b7c] hover:underline" style={{ fontFamily: 'Georgia, serif' }}>Players</Link>
          <span className="text-gray-400 mx-2">›</span>
          <span className="text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>{playerName}</span>
        </div>

        <div className={`bg-white rounded-lg shadow-lg p-8 text-center border-2 ${teamBgColor}`}>
          <PlayerAvatar player={player} />
          
          <h1 className="text-3xl mb-2" style={{ fontFamily: 'Georgia, serif' }}>{displayName}</h1>
          
          {player.nickname && (
            <p className="text-lg text-gray-600 italic mb-4">&ldquo;{player.nickname}&rdquo;</p>
          )}
          
          <div className={`inline-block px-4 py-2 rounded-full text-white font-semibold mb-6 ${
            player.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'
          }`}>
            Team {player.team}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {player.first_name && (
              <div className="text-center">
                <h3 className="font-semibold text-gray-700 mb-2">First Name</h3>
                <p className="text-xl">{player.first_name}</p>
              </div>
            )}
            {player.last_name && (
              <div className="text-center">
                <h3 className="font-semibold text-gray-700 mb-2">Last Name</h3>
                <p className="text-xl">{player.last_name}</p>
              </div>
            )}
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 mb-2">Raw Handicap</h3>
              <p className="text-2xl font-bold">{player.raw_handicap}</p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 mb-2">Playing Handicap (75%)</h3>
              <p className="text-2xl font-bold">{player.playing_handicap}</p>
            </div>
          </div>

          <div className="mt-8 flex gap-4 justify-center flex-wrap">
            <Link href="/" className="btn-secondary">View Leaderboard</Link>
            <Link href="/players" className="btn-secondary">All Players</Link>
          </div>
        </div>

        <div className="mt-8">
          <TeamMembersSection currentPlayer={player} />
        </div>
      </div>
    </div>
  )
}

function TeamMembersSection({ currentPlayer }: { currentPlayer: Player }) {
  const [teammates, setTeammates] = useState<Player[]>([])

  useEffect(() => {
    fetchTeammates()
  }, [currentPlayer.team])

  async function fetchTeammates() {
    try {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('team', currentPlayer.team)
        .neq('id', currentPlayer.id)
        .order('name')
      if (data) setTeammates(data)
    } catch (error) {
      console.error('Failed to fetch teammates:', error)
    }
  }

  if (teammates.length === 0) return null

  const teamColor = currentPlayer.team === 'Shaft' ? 'text-team-shafts border-team-shafts' : 'text-team-balls border-team-balls'

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 border-t-4 ${teamColor}`}>
      <h2 className={`text-xl font-bold mb-4 ${teamColor}`}>Team {currentPlayer.team} Members</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {teammates.map(tm => (
          <Link
            key={tm.id}
            href={`/players/${encodeURIComponent(tm.name)}`}
            className="text-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {tm.avatar_url ? (
              <div className="w-[72px] h-[72px] min-h-[72px] rounded-full overflow-hidden mx-auto mb-2"><img src={tm.avatar_url} alt={tm.name} className="w-full h-full object-cover" style={{ objectPosition: tm.avatar_position || 'center 30%' }} /></div>
            ) : (
              <div className={`w-[72px] h-[72px] min-h-[72px] rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-bold text-white ${
                currentPlayer.team === 'Shaft' ? 'bg-team-shafts' : 'bg-team-balls'
              }`}>
                {tm.first_name && tm.last_name 
                  ? `${tm.first_name.charAt(0)}${tm.last_name.charAt(0)}`
                  : tm.name.charAt(0)}
              </div>
            )}
            <p className="text-sm font-medium">
              {tm.first_name && tm.last_name ? `${tm.first_name} ${tm.last_name}` : tm.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
