// src/components/damm-v2/damm-v2-mock-data.ts
import { TokenData } from '@/lib/validators'

/**
 * Factory function for creating mock token data.
 * Reduces duplication and makes it easier to maintain test data.
 */
function createMockToken(
  mint: string,
  deltas: { jup: number; other: number },
  totals: { trades: number; jupiter: number },
  jupiterPct: number,
  ageSeconds: number,
  isNew = false
): TokenData {
  const now = Math.floor(Date.now() / 1000)
  const totalDelta = deltas.jup + deltas.other

  return {
    mint,
    delta_jup: deltas.jup,
    delta_other: deltas.other,
    total: totals.trades,
    total_jupiter: totals.jupiter,
    jupiter_pct: jupiterPct,
    is_new_entry: isNew,
    total_trade_size: totalDelta * 10_000_000,
    delta_total_trade_size: totalDelta * 5_000_000,
    delta_jupiter_trade_size: deltas.jup * 5_000_000,
    jupiter_trade_size: deltas.jup * 3_000_000,
    tge_at: now - ageSeconds,
    timestamp: now,
  }
}

/** Generate mock tokens for UI preview when no live data is available */
export function getMockTokens(): TokenData[] {
  return [
    // ── High activity (delta_jup > 20 && totalDelta > 200) ──
    createMockToken(
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
      { jup: 28, other: 210 },
      { trades: 1840, jupiter: 420 },
      22.83,
      300
    ),
    createMockToken(
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
      { jup: 35, other: 280 },
      { trades: 2100, jupiter: 560 },
      26.67,
      180,
      true
    ),
    createMockToken(
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
      { jup: 24, other: 195 },
      { trades: 1650, jupiter: 380 },
      23.03,
      420
    ),
    createMockToken(
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
      { jup: 31, other: 245 },
      { trades: 1920, jupiter: 490 },
      25.52,
      240
    ),

    // ── Medium activity (delta_jup > 10 && totalDelta > 100) ──
    createMockToken(
      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
      { jup: 14, other: 95 },
      { trades: 970, jupiter: 210 },
      21.65,
      720
    ),
    createMockToken(
      'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac', // MNGO
      { jup: 18, other: 120 },
      { trades: 1100, jupiter: 270 },
      24.55,
      540,
      true
    ),
    createMockToken(
      'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', // RNDR
      { jup: 12, other: 88 },
      { trades: 840, jupiter: 180 },
      21.43,
      900
    ),
    createMockToken(
      'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx', // ATLAS
      { jup: 16, other: 105 },
      { trades: 980, jupiter: 240 },
      24.49,
      660
    ),

    // ── Normal activity ──
    createMockToken(
      '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', // POPCAT
      { jup: 6, other: 38 },
      { trades: 510, jupiter: 95 },
      18.63,
      1800
    ),
    createMockToken(
      'So11111111111111111111111111111111111111112', // SOL
      { jup: 2, other: 15 },
      { trades: 230, jupiter: 44 },
      19.13,
      3600
    ),
    createMockToken(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      { jup: 4, other: 22 },
      { trades: 310, jupiter: 60 },
      19.35,
      2400
    ),
    createMockToken(
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      { jup: 3, other: 18 },
      { trades: 270, jupiter: 51 },
      18.89,
      4200
    ),
    createMockToken(
      'poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk', // POLIS
      { jup: 5, other: 29 },
      { trades: 390, jupiter: 75 },
      19.23,
      1200,
      true
    ),
  ]
}
