import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fnxyorriiytdskxpedir.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueHlvcnJpaXl0ZHNreHBlZGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjY0NTgsImV4cCI6MjA4NzEwMjQ1OH0.LHglM90Wduux0fCq7nhokKtKSbg8MROc3hH609sjh6M'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string
          name: string
          team: 'Shaft' | 'Balls'
          raw_handicap: number
          playing_handicap: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          team: 'Shaft' | 'Balls'
          raw_handicap: number
          playing_handicap: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          team?: 'Shaft' | 'Balls'
          raw_handicap?: number
          playing_handicap?: number
          created_at?: string
        }
      }
      courses: {
        Row: {
          id: string
          name: string
          day: number
          tees: string
          par_data: any
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          day: number
          tees: string
          par_data: any
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          day?: number
          tees?: string
          par_data?: any
          created_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          day: number
          group_number: number
          format: string
          team1_players: string[]
          team2_players: string[]
          course_id: string
          group_access_token: string
          created_at: string
        }
        Insert: {
          id?: string
          day: number
          group_number: number
          format: string
          team1_players: string[]
          team2_players: string[]
          course_id: string
          group_access_token: string
          created_at?: string
        }
        Update: {
          id?: string
          day?: number
          group_number?: number
          format?: string
          team1_players?: string[]
          team2_players?: string[]
          course_id?: string
          group_access_token?: string
          created_at?: string
        }
      }
      scores: {
        Row: {
          id: string
          match_id: string
          player_id: string
          hole_number: number
          gross_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          match_id: string
          player_id: string
          hole_number: number
          gross_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          match_id?: string
          player_id?: string
          hole_number?: number
          gross_score?: number | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}