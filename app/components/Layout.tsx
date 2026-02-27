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
      <div className={`fixed left-0 top-0 h-full w-80 md:w-96 transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto ${
        isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
      }`} style={{ backgroundColor: '#f5f0e8' }}>
        <div className="p-4">
          {/* Close button */}
          <button
            onClick={closeDrawer}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-xl"
          >
            ✕
          </button>
          
          {/* Logo */}
          <div className="mb-6 pt-4">
            <a href="/" onClick={closeDrawer}>
              <img src="/abtow-logo.png" alt="ABTOW 2026" className="w-40 mx-auto" />
            </a>
          </div>
          
          {/* Navigation Links */}
          <nav className="space-y-1 mb-6" style={{ fontFamily: 'Georgia, serif' }}>
            <a href="/" className="block py-3 px-3 text-gray-800 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors font-semibold" onClick={closeDrawer}>
              Home
            </a>
            <div className="border-t border-gray-300 my-2"></div>
            <a href="/day/1" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Day 1 — Ritz Carlton GC
            </a>
            <a href="/day/2" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Day 2 — Southern Dunes
            </a>
            <a href="/day/3" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Day 3 — Champions Gate
            </a>
            <div className="border-t border-gray-300 my-2"></div>
            <a href="/skins/1" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Skins — Day 1
            </a>
            <a href="/skins/2" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Skins — Day 2
            </a>
            <a href="/skins/3" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Skins — Day 3
            </a>
            <a href="/bets" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              🎲 Bets
            </a>
            <div className="border-t border-gray-300 my-2"></div>
            <a href="/players" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Players
            </a>
            <a href="/statistics" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Statistics
            </a>
            <a href="/rules" className="block py-2.5 px-3 text-gray-700 hover:bg-[#2a6b7c]/10 active:bg-[#2a6b7c]/20 rounded transition-colors" onClick={closeDrawer}>
              Rules
            </a>
            <div className="border-t border-gray-300 my-2"></div>
            <a href="/admin" className="block py-2.5 px-3 text-gray-500 hover:bg-gray-100 active:bg-gray-200 rounded transition-colors text-sm" onClick={closeDrawer}>
              🔒 Admin
            </a>
          </nav>
          
          {/* Separator */}
          <div className="border-t-2 border-[#2a6b7c]/30 my-4"></div>
          
          {/* Team Shaft Players */}
          <div className="mb-5" style={{ fontFamily: 'Georgia, serif' }}>
            <h3 className="text-blue-700 font-bold mb-2 text-sm uppercase tracking-wide">Team Shaft</h3>
            <div className="space-y-0.5">
              {shaftPlayers.map(player => (
                <a 
                  key={player.id}
                  href={`/players/${encodeURIComponent(player.name)}`}
                  className="flex items-center gap-2 py-1.5 px-3 hover:bg-blue-100/50 rounded transition-colors text-sm text-gray-700"
                  onClick={closeDrawer}
                >
                  {player.avatar_url ? (
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-blue-300 shrink-0">
                      <img src={player.avatar_url} alt={player.name} className="w-full h-full object-cover" style={{ objectPosition: player.avatar_position || 'center 30%' }} />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {(player.first_name?.charAt(0) || '') + (player.last_name?.charAt(0) || '')}
                    </div>
                  )}
                  {player.first_name && player.last_name 
                    ? `${player.first_name} ${player.last_name}` 
                    : player.name}
                </a>
              ))}
            </div>
          </div>
          
          {/* Team Balls Players */}
          <div className="mb-6" style={{ fontFamily: 'Georgia, serif' }}>
            <h3 className="text-red-700 font-bold mb-2 text-sm uppercase tracking-wide">Team Balls</h3>
            <div className="space-y-0.5">
              {ballPlayers.map(player => (
                <a 
                  key={player.id}
                  href={`/players/${encodeURIComponent(player.name)}`}
                  className="flex items-center gap-2 py-1.5 px-3 hover:bg-red-100/50 rounded transition-colors text-sm text-gray-700"
                  onClick={closeDrawer}
                >
                  {player.avatar_url ? (
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-red-300 shrink-0">
                      <img src={player.avatar_url} alt={player.name} className="w-full h-full object-cover" style={{ objectPosition: player.avatar_position || 'center 30%' }} />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {(player.first_name?.charAt(0) || '') + (player.last_name?.charAt(0) || '')}
                    </div>
                  )}
                  {player.first_name && player.last_name 
                    ? `${player.first_name} ${player.last_name}` 
                    : player.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-3 shadow-sm" style={{ backgroundColor: '#f5f0e8', borderBottom: '1px solid #d6cfc0' }}>
        <button
          onClick={toggleDrawer}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#2a6b7c] text-white shadow hover:bg-[#235a68] active:bg-[#1d4d58] transition-colors text-xl shrink-0"
        >
          ☰
        </button>
        <a href="/" className="flex-1 flex justify-center" style={{ fontFamily: 'Georgia, serif' }}>
          <span className="text-sm font-bold tracking-widest text-[#2a6b7c] uppercase">ABTOW 2026 Open</span>
        </a>
        {/* Spacer to balance the button */}
        <div className="w-11 shrink-0" />
      </header>

      <main className="flex-1 pt-14">
        {children}
      </main>
    </div>
  )
}