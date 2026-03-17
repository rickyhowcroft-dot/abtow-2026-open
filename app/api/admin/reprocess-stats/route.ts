import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { PostRoundProcessor } from '@/lib/post-round-processor'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  // Admin auth check
  const cookieStore = cookies()
  const session = cookieStore.get('abtow_admin_session')
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!session || !adminPassword || session.value !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { playerId, matchId } = await req.json()
  if (!playerId || !matchId) {
    return NextResponse.json({ error: 'playerId and matchId required' }, { status: 400 })
  }

  // Get match day for cleanup
  const { data: match } = await supabase
    .from('matches')
    .select('day')
    .eq('id', matchId)
    .single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  // Wipe existing stats for this player/day so idempotency guard allows reprocessing
  await Promise.all([
    supabase.from('player_daily_stats').delete().eq('player_id', playerId).eq('day', match.day),
    supabase.from('player_hole_stats').delete().eq('player_id', playerId),
    supabase.from('player_stats').delete().eq('player_id', playerId),
  ])

  // Reprocess
  await PostRoundProcessor.processPlayerRound(playerId, matchId)

  return NextResponse.json({ success: true })
}
