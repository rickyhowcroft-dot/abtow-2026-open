import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side only — Twilio credentials never reach the client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { playerId, message } = await request.json()
    if (!playerId || !message) {
      return NextResponse.json({ error: 'Missing playerId or message' }, { status: 400 })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_FROM_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      // Twilio not configured — silently skip (dev/staging)
      return NextResponse.json({ skipped: true, reason: 'Twilio not configured' })
    }

    // Look up phone number
    const { data: player } = await supabase
      .from('players')
      .select('phone_number')
      .eq('id', playerId)
      .single()

    if (!player?.phone_number) {
      return NextResponse.json({ skipped: true, reason: 'No phone number on file' })
    }

    const to = toE164(player.phone_number)
    if (!to) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }

    // Send via Twilio REST API — no SDK dependency needed
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Body: message, From: fromNumber, To: to }).toString(),
      }
    )

    const result = await res.json()
    if (!res.ok) {
      console.error('Twilio error:', result)
      return NextResponse.json({ error: result.message ?? 'SMS failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, sid: result.sid })
  } catch (e) {
    console.error('notify-player error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
