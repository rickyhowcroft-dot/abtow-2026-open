// lib/venmo.ts
// Opens the Venmo native app via deep link, falls back to web if not installed.

const FALLBACK_DELAY_MS = 1500

/**
 * txn=pay   → you are paying the recipient
 * txn=charge → you are requesting money from the recipient
 */
export type VenmoTxn = 'pay' | 'charge'

export function openVenmo(
  handle: string,
  txn: VenmoTxn = 'pay',
  note = 'ABTOW 2026',
  amount?: number,
) {
  const params = new URLSearchParams({
    txn,
    recipients: handle,
    note,
    ...(amount != null ? { amount: amount.toFixed(2) } : {}),
  })

  const deepLink = `venmo://paycharge?${params.toString()}`
  const webFallback = `https://venmo.com/${handle}`

  // Attempt to open the native app
  window.location.href = deepLink

  // If the app isn't installed the page stays visible — fall back to web after delay
  const start = Date.now()
  setTimeout(() => {
    // Only redirect if the user is still on this page (tab not backgrounded by app switch)
    if (Date.now() - start < FALLBACK_DELAY_MS + 200) {
      window.open(webFallback, '_blank', 'noopener,noreferrer')
    }
  }, FALLBACK_DELAY_MS)
}
