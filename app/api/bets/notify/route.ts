/**
 * /api/bets/notify
 *
 * Constrained notification endpoint for bet events.
 * Unlike /api/notify-player (admin-only, arbitrary targets), this route:
 *  - Only sends to players who are actual participants of the specified bet(s)
 *  - Validates bet status matches the event before sending
 *  - Builds the message server-side — no arbitrary message accepted from client
 *
 * POST { betIds: string[], event: 'proposed' | 'accepted' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const BASE_URL = 'https://abtow.golf'
const HEADER   = '🏌️ ABTOW 2026 Open'
const TEXTBELT = 'https://textbelt.com/text'

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10)
}

async function sendSMS(phone: string, message: string, mediaUrl?: string): Promise<void> {
  const apiKey = process.env.TEXTBELT_API_KEY?.trim()
  if (!apiKey) return

  const normalised = normalizePhone(phone)
  if (normalised.length !== 10) return

  const payload: Record<string, string> = { phone: normalised, message, key: apiKey }
  if (mediaUrl) payload.mediaUrl = mediaUrl

  const res = await fetch(TEXTBELT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await res.json()
  if (!result.success) console.warn('TextBelt bet notify error:', result)
}

function betTypeLabel(type: string): string {
  if (type === 'front') return 'Front 9'
  if (type === 'back')  return 'Back 9'
  return 'Overall'
}

type PlayerRef = { id: string; first_name: string | null; name: string; phone_number: string | null }
type BetRow = {
  id: string; status: string; bet_type: string; proposer_side: string
  side1_amount: string; side2_amount: string
  side1_player: PlayerRef; side2_player: PlayerRef
}

export async function POST(request: NextRequest) {
  try {
    const { betIds, event } = await request.json() as { betIds: string[]; event: string }

    if (!Array.isArray(betIds) || betIds.length === 0 || !['proposed', 'accepted'].includes(event)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const apiKey = process.env.TEXTBELT_API_KEY?.trim()
    if (!apiKey) return NextResponse.json({ skipped: true, reason: 'TextBelt not configured' })

    // Fetch all specified bets with both player refs — server-side only
    const { data: bets, error } = await supabase
      .from('bets')
      .select(`
        id, status, bet_type, proposer_side, side1_amount, side2_amount,
        side1_player:players!side1_player_id ( id, first_name, name, phone_number ),
        side2_player:players!side2_player_id ( id, first_name, name, phone_number )
      `)
      .in('id', betIds)

    if (error || !bets || bets.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'Bets not found' })
    }

    const rows = bets as unknown as BetRow[]

    if (event === 'proposed') {
      // Only send for bets that are still pending (guard against double-fire)
      const pending = rows.filter(b => b.status === 'pending')
      if (pending.length === 0) return NextResponse.json({ skipped: true, reason: 'No pending bets' })

      // All bets in a batch share the same proposer/acceptor — use first bet as reference
      const ref = pending[0]
      const proposer = ref.proposer_side === 'side1' ? ref.side1_player : ref.side2_player
      const acceptor = ref.proposer_side === 'side1' ? ref.side2_player : ref.side1_player

      if (!acceptor.phone_number) return NextResponse.json({ skipped: true, reason: 'No phone on file' })

      const typeStr = pending.map(b => betTypeLabel(b.bet_type)).join(' + ')
      const total   = pending.reduce((s, b) => s + Number(b.side1_amount), 0)
      const profileUrl = `${BASE_URL}/players/${encodeURIComponent(acceptor.name)}`

      const msg = `${HEADER}\n\n⛳ ${proposer.first_name ?? proposer.name.split(' ')[0]} wants to bet you!\n${typeStr} · $${total}\nAccept here: ${profileUrl}`
      await sendSMS(acceptor.phone_number, msg)

    } else if (event === 'accepted') {
      // One SMS per accepted bet to the proposer
      for (const bet of rows) {
        if (bet.status !== 'active') continue

        const proposer = bet.proposer_side === 'side1' ? bet.side1_player : bet.side2_player
        const acceptor = bet.proposer_side === 'side1' ? bet.side2_player : bet.side1_player

        if (!proposer.phone_number) continue

        const msg = `${HEADER}\n\n✅ ${acceptor.first_name ?? acceptor.name.split(' ')[0]} accepted your ${betTypeLabel(bet.bet_type)} bet. It's on!\n${BASE_URL}/bets`
        await sendSMS(proposer.phone_number, msg)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('bets/notify error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
