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
      body: JSON.stringify({ playerId, message, ...(mediaUrl ? { mediaUrl } : {}) }),
    })
  } catch (e) {
    console.warn('SMS notification failed (non-critical):', e)
  }
}

// ─── Bet events ──────────────────────────────────────────────────────────────

/**
 * Notify the bet acceptor that someone proposed a bet.
 * Called immediately after createBet() succeeds.
 */
export function notifyBetProposed(params: {
  acceptorPlayerId: string
  proposerFirstName: string
  acceptorProfileSlug: string   // player.name, URL-safe
  betTypes: string[]            // e.g. ['Front 9', 'Back 9']
  totalAmount: number
}): void {
  const { acceptorPlayerId, proposerFirstName, acceptorProfileSlug, betTypes, totalAmount } = params
  const typeStr = betTypes.join(' + ')
  const url = `${BASE_URL}/players/${encodeURIComponent(acceptorProfileSlug)}`
  notifyPlayer(
    acceptorPlayerId,
    `${HEADER}\n\n⛳ ${proposerFirstName} wants to bet you!\n${typeStr} · $${totalAmount}\nAccept here: ${url}`
  )
}

/**
 * Notify the proposer that their bet was accepted.
 * Called immediately after acceptBet() succeeds.
 */
export function notifyBetAccepted(params: {
  proposerPlayerId: string
  acceptorFirstName: string
  betTypeLabel: string
}): void {
  const { proposerPlayerId, acceptorFirstName, betTypeLabel } = params
  notifyPlayer(
    proposerPlayerId,
    `${HEADER}\n\n✅ ${acceptorFirstName} accepted your ${betTypeLabel} bet. It's on!\n${BASE_URL}/bets`
  )
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
