/**
 * Server-side SMS helper using TextBelt.
 *
 * 'server-only' enforces this file is never bundled into the client —
 * importing it from a client component will throw a build error.
 *
 * Required env vars (set in Vercel, never in source):
 *   TEXTBELT_KEY  — API key from textbelt.com (treat like a password)
 *
 * Note: TextBelt is SMS-only (no MMS). If a mediaUrl is supplied it is
 * appended as a plain-text link so callers don't need to change.
 */
import 'server-only'

export interface SmsResult {
  success: boolean
  sid?: string    // TextBelt textId — safe to log, not sensitive
  error?: string  // Sanitized error description — never contains credentials
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
 * Send an SMS via TextBelt.
 * Never throws — returns { success, sid } or { success: false, error }.
 * mediaUrl is appended as a text link (TextBelt does not support MMS).
 */
export async function sendSms(
  to: string,
  body: string,
  mediaUrl?: string
): Promise<SmsResult> {
  const key = process.env.TEXTBELT_KEY?.trim()

  if (!key) {
    return { success: false, error: 'SMS not configured' }
  }

  const phone = normalizePhone(to)
  const fullBody = mediaUrl ? `${body}\n${mediaUrl}` : body

  const params = new URLSearchParams({ phone, message: fullBody, key })

  try {
    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    const data = await res.json()

    if (!data.success) {
      console.error('[sms] TextBelt error:', data.error)
      return { success: false, error: data.error ?? 'SMS delivery failed' }
    }

    return { success: true, sid: String(data.textId) }
  } catch (e) {
    console.error('[sms] TextBelt fetch error:', e)
    return { success: false, error: 'SMS unavailable' }
  }
}
