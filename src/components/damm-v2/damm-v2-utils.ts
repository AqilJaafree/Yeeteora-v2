// src/components/damm-v2/damm-v2-utils.ts
import { FORMAT, TIME } from './damm-v2-constants'

/** Format large numbers with k/M suffix, trimming unnecessary decimals */
export function formatCompactNumber(value: number): string {
  const fmt = (n: number) => parseFloat(n.toFixed(2)).toString()
  if (value >= FORMAT.MILLION) return `${fmt(value / FORMAT.MILLION)}M`
  if (value >= FORMAT.THOUSAND) return `${Math.round(value / FORMAT.THOUSAND)}k`
  return fmt(value)
}

/** Format pool fee as a percentage string */
export function formatFeePercentage(baseFee: number, dynamicFee: number): string {
  return `${(baseFee + dynamicFee).toFixed(3)}%`
}

/** Get human-readable label for fee schedule mode */
export function getFeeScheduleLabel(mode: number): string {
  const labels: Record<number, string> = {
    0: 'Linear',
    1: 'Exponential',
  }
  return labels[mode] ?? 'No Schedule'
}

/** Format token age in human-readable form (e.g. 5m, 2h 10m) */
export function formatTokenAge(ageInSeconds: number): string {
  if (ageInSeconds < TIME.SECONDS_PER_MINUTE) return `${ageInSeconds}s`
  if (ageInSeconds < TIME.SECONDS_PER_HOUR) {
    return `${Math.floor(ageInSeconds / TIME.SECONDS_PER_MINUTE)}m`
  }

  const hours = Math.floor(ageInSeconds / TIME.SECONDS_PER_HOUR)
  const minutes = Math.floor((ageInSeconds % TIME.SECONDS_PER_HOUR) / TIME.SECONDS_PER_MINUTE)

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Convert lamports to SOL */
export function lamportsToSol(lamports: number): number {
  return lamports / FORMAT.LAMPORTS_PER_SOL
}

/** Truncate a Solana address for display */
export function truncateAddress(address: string, options?: { mobile?: boolean }): string {
  const length = options?.mobile ? 4 : 8
  return `${address.slice(0, length)}...${address.slice(-length)}`
}

/** Parse a Jupiter API error string into a user-friendly message */
export function parseJupiterError(error: string): string {
  if (error.includes('404')) return 'Token not found on Jupiter'
  if (error.includes('429')) return 'Too many requests. Please wait.'
  if (error.includes('API error')) return 'Jupiter API is temporarily unavailable'
  return 'Check your internet connection and try again'
}

/** Get a short label for a Jupiter error badge */
export function getErrorLabel(error: string): string {
  if (error.includes('404')) return 'Not Found'
  if (error.includes('429')) return 'Rate Limited'
  return 'API Error'
}
