import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side only — API key never reaches the client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizePhone(raw: string): string {
  // TextBelt accepts 10-digit US numbers — strip everything but digits
  return raw.replace(/\D/g, '').slice(-10)
}

export async function POST(request: NextRequest) {
  try {
    const { playerId, message, mediaUrl } = await request.json()
    if (!playerId || !message) {
      return NextResponse.json({ error: 'Missing playerId or message' }, { status: 400 })
    }

    const apiKey = process.env.TEXTBELT_API_KEY
    if (!apiKey) {
      // Not configured — silently skip (dev / before tournament setup)
      return NextResponse.json({ skipped: true, reason: 'TextBelt not configured' })
    }

    // Look up phone number server-side
    const { data: player } = await supabase
      .from('players')
      .select('phone_number')
      .eq('id', playerId)
      .single()

    if (!player?.phone_number) {
      return NextResponse.json({ skipped: true, reason: 'No phone number on file' })
    }

    const phone = normalizePhone(player.phone_number)
    if (phone.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // TextBelt REST API — single POST, no SDK needed
    const payload: Record<string, string> = { phone, message, key: apiKey }
    if (mediaUrl) payload.mediaUrl = mediaUrl

    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await res.json()
    if (!result.success) {
      console.error('TextBelt error:', result)
      return NextResponse.json({ error: result.error ?? 'SMS failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, textId: result.textId, quotaRemaining: result.quotaRemaining })
  } catch (e) {
    console.error('notify-player error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
