/**
 * Server-side SMS/MMS helper using Twilio REST API.
 * Import only from API routes (server-side) — never from client components.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — from Twilio console
 *   TWILIO_AUTH_TOKEN    — from Twilio console
 *   TWILIO_FROM_NUMBER   — your purchased Twilio number e.g. +15855551234
 */

export interface SmsResult {
  success: boolean
  sid?: string
  error?: string
}

/**
 * Normalise any US phone number to E.164 (+1XXXXXXXXXX)
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Handle 10-digit (no country code) or 11-digit starting with 1
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}` // pass through, let Twilio validate
}

/**
 * Send an SMS (or MMS if mediaUrl is provided) via Twilio.
 * Fire-and-forget safe — never throws; returns {success, sid} or {success:false, error}.
 */
export async function sendSms(
  to: string,
  body: string,
  mediaUrl?: string
): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken  = process.env.TWILIO_AUTH_TOKEN?.trim()
  const from       = process.env.TWILIO_FROM_NUMBER?.trim()

  if (!accountSid || !authToken || !from) {
    return { success: false, error: 'Twilio not configured' }
  }

  const phone = normalizePhone(to)

  const params = new URLSearchParams({ To: phone, From: from, Body: body })
  if (mediaUrl) params.append('MediaUrl', mediaUrl)

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      console.error('Twilio error:', data)
      return { success: false, error: data?.message ?? `HTTP ${res.status}` }
    }

    return { success: true, sid: data.sid }
  } catch (e) {
    console.error('Twilio fetch error:', e)
    return { success: false, error: String(e) }
  }
}
