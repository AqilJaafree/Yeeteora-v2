// P&L calculation logic for DAMM v2 positions
// Handles unrealized P&L, fees, time-series aggregation

import BN from 'bn.js'
import type { DammV2Position } from './damm-v2-data-access'
import type {
  PositionEntryRecord,
  PositionPnLCalculation,
  PositionSnapshot,
  AggregatedPnLDataPoint,
} from './damm-v2-pnl-types'
import { TIMEFRAME_CONFIG } from '@/lib/damm-v2-pnl-constants'
import { safeDivide, safePow10, validateDecimals } from '@/lib/validators'

/**
 * Safe conversion from BN to decimal number
 * SECURITY: Prevents integer overflow when converting large BN values
 *
 * @param amount - BN amount in token's base units
 * @param decimals - Token decimals (0-18)
 * @returns Decimal number representation
 */
function safeTokenAmountToDecimal(amount: BN, decimals: number): number {
  // SECURITY: Validate decimals range
  if (!validateDecimals(decimals)) {
    throw new Error(`Invalid decimals: ${decimals}`)
  }

  // Convert using string operations to avoid overflow
  const divisor = new BN(10).pow(new BN(decimals))
  const quotient = amount.div(divisor)
  const remainder = amount.mod(divisor)

  // SECURITY: Check if quotient exceeds safe integer
  if (quotient.gt(new BN(Number.MAX_SAFE_INTEGER))) {
    console.warn('[PnL] Token amount exceeds safe integer range')
    return Number.MAX_SAFE_INTEGER
  }

  const quotientNum = quotient.toNumber()
  const remainderNum = remainder.toNumber()
  const divisorNum = safePow10(decimals)

  return quotientNum + remainderNum / divisorNum
}

/**
 * Token metadata for calculations
 */
interface TokenMetadata {
  decimals: number
  usdPrice: number
}

/**
 * Calculate P&L for a single position
 * Compares current value + fees against initial investment
 *
 * @param position - Current position state from SDK
 * @param entry - Entry record from localStorage
 * @param tokenAMeta - Token A metadata (decimals, price)
 * @param tokenBMeta - Token B metadata (decimals, price)
 * @returns P&L calculation result
 */
export async function calculatePositionPnL(
  position: DammV2Position,
  entry: PositionEntryRecord,
  tokenAMeta: TokenMetadata,
  tokenBMeta: TokenMetadata
): Promise<PositionPnLCalculation> {
  // SECURITY: Safe conversion to avoid overflow
  const currentTokenAAmount = safeTokenAmountToDecimal(position.tokenAAmount, tokenAMeta.decimals)
  const currentTokenBAmount = safeTokenAmountToDecimal(position.tokenBAmount, tokenBMeta.decimals)

  // SECURITY: Safe conversion for fees
  const unclaimedFeesA = safeTokenAmountToDecimal(position.feeOwedA, tokenAMeta.decimals)
  const unclaimedFeesB = safeTokenAmountToDecimal(position.feeOwedB, tokenBMeta.decimals)

  // Calculate current values in USD
  const currentValueUSD =
    currentTokenAAmount * tokenAMeta.usdPrice + currentTokenBAmount * tokenBMeta.usdPrice
  const unclaimedFeesUSD = unclaimedFeesA * tokenAMeta.usdPrice + unclaimedFeesB * tokenBMeta.usdPrice

  // Get initial investment from entry record
  const initialInvestmentUSD = entry.initialValueUSD

  // Calculate P&L
  const unrealizedPnL = currentValueUSD - initialInvestmentUSD
  const unrealizedPnLWithFees = unrealizedPnL + unclaimedFeesUSD

  // SECURITY: Use safe division to prevent division by zero
  const unrealizedPnLPercentage = safeDivide(unrealizedPnLWithFees * 100, initialInvestmentUSD, 0)

  // SECURITY: Calculate price changes with safe division
  const currentPrice = safeDivide(tokenBMeta.usdPrice, tokenAMeta.usdPrice, 0)
  const entryPrice = entry.entryPoolPrice
  const priceChange = currentPrice - entryPrice
  const priceChangePercentage = safeDivide(priceChange * 100, entryPrice, 0)

  // Time metrics
  const positionAgeMs = Date.now() - entry.entryTimestamp
  const positionAgeHours = positionAgeMs / (1000 * 60 * 60)
  const positionAgeDays = positionAgeHours / 24

  // Status checks
  const isInRange =
    position.poolState.sqrtPrice.gte(position.poolState.sqrtMinPrice) &&
    position.poolState.sqrtPrice.lte(position.poolState.sqrtMaxPrice)

  return {
    positionAddress: position.positionPubkey.toBase58(),
    initialInvestmentUSD,
    currentValueUSD,
    totalFeesEarnedUSD: unclaimedFeesUSD, // TODO: Add claimed fees from history
    claimedFeesUSD: 0, // TODO: Calculate from storage
    unclaimedFeesUSD,
    unrealizedPnL,
    unrealizedPnLWithFees,
    unrealizedPnLPercentage,
    entryPrice,
    currentPrice,
    priceChange,
    priceChangePercentage,
    positionAgeHours,
    positionAgeDays,
    isOpen: true,
    isInRange,
  }
}

/**
 * Generate time-series snapshots for chart display
 * Aggregates P&L across all positions at regular time intervals
 *
 * @param positionPnLs - Array of current position P&L calculations
 * @param timeframe - Time range for the chart
 * @param historicalSnapshots - Historical snapshots from localStorage (optional)
 * @returns Array of aggregated P&L data points for the chart
 */
export function generateAggregatedPnLTimeSeries(
  positionPnLs: PositionPnLCalculation[],
  timeframe: '1H' | '1D' | '1W' | '1M' | '1Y' | 'MAX',
  historicalSnapshots?: Map<string, PositionSnapshot[]>,
  closedPositionExits?: Map<string, { exitTimestamp: number; realizedPnL: number; totalFeesValueUSD: number; initialValueUSD: number }>
): AggregatedPnLDataPoint[] {
  const dataPoints: AggregatedPnLDataPoint[] = []

  if (positionPnLs.length === 0 && (!closedPositionExits || closedPositionExits.size === 0)) {
    return dataPoints
  }

  // Get time configuration
  const now = Date.now()
  const config = TIMEFRAME_CONFIG[timeframe]
  const startTime = now - config.durationMs

  // Generate data points at each interval
  for (let i = 0; i < config.numPoints; i++) {
    const timestamp = startTime + i * config.intervalMs
    const date = formatDateForTimeframe(timestamp, timeframe)

    let totalCurrentValue = 0
    let totalInvested = 0
    let totalUnrealizedPnL = 0
    let totalFeesEarned = 0
    let totalRealizedPnL = 0

    // Aggregate all open positions at this timestamp
    positionPnLs.forEach((pnl) => {
      // If we have historical snapshots, try to use them for past data
      if (historicalSnapshots && timestamp < now - 60000) {
        const positionSnapshots = historicalSnapshots.get(pnl.positionAddress) || []
        const closestSnapshot = findClosestSnapshot(positionSnapshots, timestamp)

        if (closestSnapshot) {
          totalCurrentValue += closestSnapshot.valueUSD
          totalUnrealizedPnL += closestSnapshot.unrealizedPnL
          totalFeesEarned += closestSnapshot.feesValueUSD
        } else {
          // No historical snapshot, use current values
          totalCurrentValue += pnl.currentValueUSD
          totalUnrealizedPnL += pnl.unrealizedPnLWithFees
          totalFeesEarned += pnl.totalFeesEarnedUSD
        }
      } else {
        // Use current live data for most recent point
        totalCurrentValue += pnl.currentValueUSD
        totalUnrealizedPnL += pnl.unrealizedPnLWithFees
        totalFeesEarned += pnl.totalFeesEarnedUSD
      }

      totalInvested += pnl.initialInvestmentUSD
    })

    // Aggregate all closed positions that were closed before or at this timestamp
    if (closedPositionExits) {
      closedPositionExits.forEach((exit) => {
        if (exit.exitTimestamp <= timestamp) {
          totalRealizedPnL += exit.realizedPnL
          totalFeesEarned += exit.totalFeesValueUSD
          totalInvested += exit.initialValueUSD
        }
      })
    }

    const totalPnL = totalUnrealizedPnL + totalRealizedPnL
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

    dataPoints.push({
      timestamp,
      date,
      openPositionsValue: totalCurrentValue,
      openPositionsUnrealizedPnL: totalUnrealizedPnL,
      closedPositionsRealizedPnL: totalRealizedPnL,
      totalPnL,
      totalPnLPercentage,
      totalFeesEarned,
      totalInvested,
      totalCurrentValue,
    })
  }

  return dataPoints
}

/**
 * Format timestamp as date string based on timeframe
 */
function formatDateForTimeframe(timestamp: number, timeframe: string): string {
  const date = new Date(timestamp)

  switch (timeframe) {
    case '1H':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    case '1D':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    case '1W':
    case '1M':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case '1Y':
    case 'MAX':
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

/**
 * Find the closest snapshot to a target timestamp
 */
function findClosestSnapshot(
  snapshots: PositionSnapshot[],
  targetTimestamp: number
): PositionSnapshot | null {
  if (snapshots.length === 0) return null

  return snapshots.reduce((closest, snapshot) => {
    const currentDiff = Math.abs(snapshot.timestamp - targetTimestamp)
    const closestDiff = Math.abs(closest.timestamp - targetTimestamp)
    return currentDiff < closestDiff ? snapshot : closest
  })
}

/**
 * Calculate aggregate stats across all positions
 * Used for profile stats card
 */
export function calculateAggregateStats(
  positionPnLs: PositionPnLCalculation[]
): {
  totalNetWorth: number
  totalProfit: number
  totalInvested: number
  feeEarned: number
  openPositionsCount: number
  avgPositionSize: number
  totalProfitPercentage: number
} {
  if (positionPnLs.length === 0) {
    return {
      totalNetWorth: 0,
      totalProfit: 0,
      totalInvested: 0,
      feeEarned: 0,
      openPositionsCount: 0,
      avgPositionSize: 0,
      totalProfitPercentage: 0,
    }
  }

  const totalCurrentValue = positionPnLs.reduce((sum, p) => sum + p.currentValueUSD, 0)
  const totalInvested = positionPnLs.reduce((sum, p) => sum + p.initialInvestmentUSD, 0)
  const totalProfit = positionPnLs.reduce((sum, p) => sum + p.unrealizedPnLWithFees, 0)
  const totalFees = positionPnLs.reduce((sum, p) => sum + p.totalFeesEarnedUSD, 0)
  const totalProfitPercentage = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0

  return {
    totalNetWorth: totalCurrentValue,
    totalProfit,
    totalInvested,
    feeEarned: totalFees,
    openPositionsCount: positionPnLs.length,
    avgPositionSize: positionPnLs.length > 0 ? totalInvested / positionPnLs.length : 0,
    totalProfitPercentage,
  }
}

/**
 * Create a snapshot of current position state
 * Used for historical tracking
 */
export function createPositionSnapshot(
  pnl: PositionPnLCalculation
): PositionSnapshot {
  return {
    timestamp: Date.now(),
    valueUSD: pnl.currentValueUSD,
    feesValueUSD: pnl.totalFeesEarnedUSD,
    unrealizedPnL: pnl.unrealizedPnLWithFees,
    unrealizedPnLPercentage: pnl.unrealizedPnLPercentage,
    tokenAPrice: pnl.currentPrice > 0 ? 1 : 0, // Simplified - token A price relative to B
    tokenBPrice: pnl.currentPrice, // Token B price relative to A
    poolPrice: pnl.currentPrice,
  }
}
