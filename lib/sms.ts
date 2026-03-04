/**
 * Server-side SMS/MMS helper using Twilio REST API.
 *
 * 'server-only' enforces this file is never bundled into the client —
 * importing it from a client component will throw a build error.
 *
 * Required env vars (set in Vercel, never in source):
 *   TWILIO_ACCOUNT_SID   — Account SID from Twilio console (starts with AC...)
 *   TWILIO_AUTH_TOKEN    — Auth token from Twilio console (treat like a password)
 *   TWILIO_FROM_NUMBER   — Your Twilio phone number in E.164 format (+15855551234)
 */
import 'server-only'

export interface SmsResult {
  success: boolean
  sid?: string       // Twilio message SID — safe to log, not sensitive
  error?: string     // Sanitized error description — never contains credentials
}

/**
 * Normalise any US phone number to E.164 (+1XXXXXXXXXX).
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

/**
 * Send an SMS or MMS via Twilio.
 * Never throws — returns { success, sid } or { success: false, error }.
 * Credentials are read from env vars and never included in return values or logs.
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
    return { success: false, error: 'SMS not configured' }
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
          // Basic auth: credentials only in this header, never logged or returned
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      // Log full Twilio error server-side only — return sanitized message to callers
      console.error(`[sms] Twilio error ${res.status}:`, data?.code, data?.message)
      return { success: false, error: `SMS delivery failed (code ${data?.code ?? res.status})` }
    }

    return { success: true, sid: data.sid }
  } catch (e) {
    // Network / parse error — log server-side, return generic message
    console.error('[sms] Twilio fetch error:', e)
    return { success: false, error: 'SMS unavailable' }
  }
}
