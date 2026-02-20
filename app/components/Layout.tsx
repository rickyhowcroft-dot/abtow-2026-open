'use client'

import { useState, useEffect } from 'react'
import { Inter } from 'next/font/google'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/scoring'

const inter = Inter({ subsets: ['latin'] })

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    // Fetch players for drawer navigation
    const fetchPlayers = async () => {
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
      }
    }
    fetchPlayers()
  }, [])

  const sortByName = (a: Player, b: Player) => {
    const aFirst = a.first_name || a.name;
    const bFirst = b.first_name || b.name;
    return aFirst.localeCompare(bFirst);
  };
  const shaftPlayers = players.filter(p => p.team === 'Shaft').sort(sortByName)
  const ballPlayers = players.filter(p => p.team === 'Balls').sort(sortByName)

  const toggleDrawer = () => setIsDrawerOpen(!isDrawerOpen)
  const closeDrawer = () => setIsDrawerOpen(false)

  return (
    <div className={`${inter.className} bg-newspaper-light min-h-screen relative`}>
      {/* Overlay */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={closeDrawer}
        />
      )}
      
      {/* Drawer */}
      <div className={`fixed left-0 top-0 h-full w-80 md:w-96 bg-newspaper-dark text-white transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto ${
        isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-4">
          {/* Close button */}
          <button
            onClick={closeDrawer}
            className="absolute top-4 right-4 text-white hover:text-gray-300 text-xl"
          >
            ✕
          </button>
          
          {/* Logo */}
          <div className="mb-8 pt-4">
            <img src="/abtow-logo.png" alt="ABTOW 2026" className="w-48 rounded-lg mx-auto" />
          </div>
          
          {/* Navigation Links */}
          <nav className="space-y-1 mb-6">
            <a href="/" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Home (Leaderboard)
            </a>
            <a href="/day/1" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Day 1 - Ritz Carlton GC
            </a>
            <a href="/day/2" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Day 2 - Southern Dunes
            </a>
            <a href="/day/3" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Day 3 - Champions Gate
            </a>
            <a href="/skins/1" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Skins - Day 1
            </a>
            <a href="/skins/2" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Skins - Day 2
            </a>
            <a href="/skins/3" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Skins - Day 3
            </a>
            <a href="/players" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Players
            </a>
            <a href="/rules" className="block py-3 px-3 hover:bg-gray-700 active:bg-gray-600 rounded transition-colors">
              Rules
            </a>
          </nav>
          
          {/* Separator */}
          <div className="border-t border-gray-600 my-6"></div>
          
          {/* Team Shaft Players */}
          <div className="mb-6">
            <h3 className="text-blue-400 font-bold mb-3 text-lg">Team Shaft</h3>
            <div className="space-y-1">
              {shaftPlayers.map(player => (
                <a 
                  key={player.id}
                  href={`/players/${encodeURIComponent(player.name)}`}
                  className="block py-1 px-3 hover:bg-blue-600 rounded transition-colors text-sm"
                  onClick={closeDrawer}
                >
                  {player.first_name && player.last_name 
                    ? `${player.first_name} ${player.last_name}` 
                    : player.name}
                </a>
              ))}
            </div>
          </div>
          
          {/* Team Balls Players */}
          <div className="mb-6">
            <h3 className="text-red-400 font-bold mb-3 text-lg">Team Balls</h3>
            <div className="space-y-1">
              {ballPlayers.map(player => (
                <a 
                  key={player.id}
                  href={`/players/${encodeURIComponent(player.name)}`}
                  className="block py-1 px-3 hover:bg-red-600 rounded transition-colors text-sm"
                  onClick={closeDrawer}
                >
                  {player.first_name && player.last_name 
                    ? `${player.first_name} ${player.last_name}` 
                    : player.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Hamburger Button - floating top left */}
      <button
        onClick={toggleDrawer}
        className="fixed top-4 left-4 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-[#2a6b7c] text-white shadow-lg hover:bg-[#235a68] active:bg-[#1d4d58] transition-colors text-xl"
      >
        ☰
      </button>
      
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}