import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendSms, normalizePhone } from '@/lib/sms'

export async function POST(request: NextRequest) {
  try {
    // Require admin session — sends arbitrary messages to arbitrary players
    const adminCookie = request.cookies.get('abtow_admin_session')?.value
    if (!adminCookie || adminCookie !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { playerId, message, mediaUrl } = await request.json()
    if (!playerId || !message) {
      return NextResponse.json({ error: 'Missing playerId or message' }, { status: 400 })
    }

    const { data: player } = await supabase
      .from('players')
      .select('phone_number')
      .eq('id', playerId)
      .single()

    if (!player?.phone_number) {
      return NextResponse.json({ skipped: true, reason: 'No phone number on file' })
    }

    const result = await sendSms(player.phone_number, message, mediaUrl)

    if (!result.success) {
      if (result.error === 'Twilio not configured') {
        return NextResponse.json({ skipped: true, reason: 'Twilio not configured' })
      }
      console.error('SMS error:', result.error)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, sid: result.sid })
  } catch (e) {
    console.error('notify-player error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
