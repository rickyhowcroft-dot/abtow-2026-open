/**
 * Client-side notification helpers.
 * All SMS sending goes through /api/notify-player (server-side Twilio call).
 * All functions are fire-and-forget — never throw.
 */

const BASE_URL = 'https://abtow.golf'
const HEADER = '🏌️ ABTOW 2026 Open'
const TYWIN_URL  = `${BASE_URL}/tywin.jpg`
const WINNER_URL = `${BASE_URL}/winner.jpg`

// ─── Core sender ─────────────────────────────────────────────────────────────

export async function notifyPlayer(playerId: string, message: string, mediaUrl?: string): Promise<void> {
  try {
    await fetch('/api/notify-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // credentials: 'include' sends the admin session cookie — required by /api/notify-player
      credentials: 'include',
      body: JSON.stringify({ playerId, message, ...(mediaUrl ? { mediaUrl } : {}) }),
    })
  } catch (e) {
    console.warn('SMS notification failed (non-critical):', e)
  }
}

// ─── Bet events ──────────────────────────────────────────────────────────────

/**
 * Notify the bet acceptor that someone proposed a bet.
 * Routes through /api/bets/notify — message built server-side, only reaches involved players.
 * betIds: all bets in the batch (front/back/overall created together).
 */
export function notifyBetProposed(betIds: string[]): void {
  if (betIds.length === 0) return
  fetch('/api/bets/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ betIds, event: 'proposed' }),
  }).catch(e => console.warn('notifyBetProposed failed (non-critical):', e))
}

/**
 * Notify the proposer that their bet was accepted.
 * Routes through /api/bets/notify — message built server-side, only reaches the proposer.
 */
export function notifyBetAccepted(betId: string): void {
  fetch('/api/bets/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ betIds: [betId], event: 'accepted' }),
  }).catch(e => console.warn('notifyBetAccepted failed (non-critical):', e))
}

/**
 * Notify both sides of a settled bet.
 * Called after settleBetsForMatch() completes and bets are re-fetched.
 */
export function notifyBetSettled(params: {
  winnerId: string | null       // null = push
  loserId:  string | null       // null = push
  side1Id:  string
  side2Id:  string
  winnerFirstName:  string
  loserFirstName:   string
  side1FirstName:   string
  side2FirstName:   string
  betTypeLabel:  string
  winnerAmount:  number         // amount winner receives
  loserAmount:   number         // amount loser pays
  status: 'side1_won' | 'side2_won' | 'push'
  winnerVenmoHandle?: string | null
  loserVenmoHandle?:  string | null
}): void {
  const {
    winnerId, loserId, side1Id, side2Id,
    winnerFirstName, loserFirstName, side1FirstName, side2FirstName,
    betTypeLabel, winnerAmount, loserAmount, status,
    winnerVenmoHandle, loserVenmoHandle,
  } = params

  if (status === 'push') {
    const pushMsg = `${HEADER}\n\n🤝 Your ${betTypeLabel} bet vs ${side2FirstName} pushed — no money changes hands.\n${BASE_URL}/bets`
    notifyPlayer(side1Id, pushMsg)
    notifyPlayer(side2Id, `${HEADER}\n\n🤝 Your ${betTypeLabel} bet vs ${side1FirstName} pushed — no money changes hands.\n${BASE_URL}/bets`)
    return
  }

  if (!winnerId || !loserId) return

  const venmoRequest = winnerVenmoHandle
    ? `\nRequest on Venmo: venmo.com/${winnerVenmoHandle}`
    : ''
  const venmoPay = loserVenmoHandle
    ? `\nPay on Venmo: venmo.com/${loserVenmoHandle}`
    : ''

  notifyPlayer(
    winnerId,
    `${HEADER}\n\n🏆 Congratulations on that masterpiece of a bet, you won ${betTypeLabel} vs ${loserFirstName}! +$${winnerAmount}\n\nIt's up to you how to spend the money. 💸${venmoRequest}\n${BASE_URL}/bets`,
    WINNER_URL
  )
  notifyPlayer(
    loserId,
    `${HEADER}\n\n📜 You lost your ${betTypeLabel} bet vs ${winnerFirstName}. -$${loserAmount}\n"A Lannister always pays their debts."${venmoPay}\n${BASE_URL}/bets`,
    TYWIN_URL
  )
}
