// P&L calculation logic for DAMM v2 positions
// Handles unrealized P&L, fees, time-series aggregation
// Uses concentrated liquidity formulas from Meteora DAMM v2 (Dec 2025)

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
import {
  sqrtPriceQ64ToPrice,
  priceToTick,
  calculateTokenAmountsFromLiquidity,
  calculateImpermanentLoss,
  isPositionInRange,
} from '@/lib/concentrated-liquidity-math'

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
 * Calculate P&L for a single position using concentrated liquidity formulas
 *
 * Based on Meteora DAMM v2 concentrated liquidity model (Dec 2025):
 * - Uses liquidity (L) and price range [√p_a, √p_b] to calculate token amounts
 * - Simulates withdraw at current price to get position value
 * - Calculates impermanent loss by comparing to HODL value
 * - Includes fees and rewards separately
 *
 * Formula Summary:
 * - V_current = simulated_withdraw_amounts × current_prices
 * - Fees = unclaimed_fees × prices
 * - Rewards = reward_amounts × prices (if reward vaults exist)
 * - Unrealized PnL = V_current + Fees + Rewards - V_initial
 * - IL = HODL_value - V_current (excluding fees/rewards)
 *
 * @param position - Current position state from SDK
 * @param entry - Entry record from localStorage
 * @param tokenAMeta - Token A metadata (decimals, price)
 * @param tokenBMeta - Token B metadata (decimals, price)
 * @returns P&L calculation result with concentrated liquidity metrics
 */
export async function calculatePositionPnL(
  position: DammV2Position,
  entry: PositionEntryRecord,
  tokenAMeta: TokenMetadata,
  tokenBMeta: TokenMetadata
): Promise<PositionPnLCalculation> {
  try {
    // SECURITY: Validate inputs
    if (!position || !entry || !tokenAMeta || !tokenBMeta) {
      throw new Error('[PnL] Missing required parameters for PnL calculation')
    }

    if (!position.poolState || !position.poolState.sqrtPrice) {
      throw new Error('[PnL] Position missing poolState or sqrtPrice data')
    }

    // Extract sqrt prices from position
    const sqrtPriceCurrent = position.poolState.sqrtPrice
    const sqrtPriceLower = position.poolState.sqrtMinPrice
    const sqrtPriceUpper = position.poolState.sqrtMaxPrice

    // SECURITY: Validate sqrt prices are valid BN values
    if (!sqrtPriceCurrent || sqrtPriceCurrent.lte(new BN(0))) {
      console.warn('[PnL] Invalid current sqrt price:', sqrtPriceCurrent?.toString())
      throw new Error('[PnL] Invalid current sqrt price')
    }

    if (!sqrtPriceLower || sqrtPriceLower.lte(new BN(0))) {
      console.warn('[PnL] Invalid lower sqrt price:', sqrtPriceLower?.toString())
      throw new Error('[PnL] Invalid lower sqrt price')
    }

    if (!sqrtPriceUpper || sqrtPriceUpper.lte(new BN(0))) {
      console.warn('[PnL] Invalid upper sqrt price:', sqrtPriceUpper?.toString())
      throw new Error('[PnL] Invalid upper sqrt price')
    }

    // Convert sqrt prices to regular prices for display/calculation
    const priceCurrent = sqrtPriceQ64ToPrice(sqrtPriceCurrent)
    const priceLower = sqrtPriceQ64ToPrice(sqrtPriceLower)
    const priceUpper = sqrtPriceQ64ToPrice(sqrtPriceUpper)

  // Convert to ticks for display
  const currentTick = priceToTick(priceCurrent)
  const tickLower = priceToTick(priceLower)
  const tickUpper = priceToTick(priceUpper)

  // Check if position is in range
  const inRange = isPositionInRange(currentTick, tickLower, tickUpper)

  // STEP 1: Simulate withdraw at current price to get token amounts
  // This represents what the position is worth in tokens right now
  const simulatedAmounts = calculateTokenAmountsFromLiquidity(
    position.liquidity,
    sqrtPriceCurrent,
    sqrtPriceLower,
    sqrtPriceUpper,
    tokenAMeta.decimals,
    tokenBMeta.decimals
  )

  // STEP 2: Calculate liquidity value (position value excluding fees/rewards)
  const liquidityValueUSD =
    simulatedAmounts.tokenAAmount * tokenAMeta.usdPrice +
    simulatedAmounts.tokenBAmount * tokenBMeta.usdPrice

  // STEP 3: Calculate unclaimed fees value
  // SECURITY: Safe conversion to avoid overflow
  const unclaimedFeesA = safeTokenAmountToDecimal(position.feeOwedA, tokenAMeta.decimals)
  const unclaimedFeesB = safeTokenAmountToDecimal(position.feeOwedB, tokenBMeta.decimals)
  const unclaimedFeesUSD = unclaimedFeesA * tokenAMeta.usdPrice + unclaimedFeesB * tokenBMeta.usdPrice

  // STEP 4: Calculate rewards value (if any)
  // SECURITY: Safe conversion for rewards
  const rewardOneDecimal = safeTokenAmountToDecimal(position.rewardOne, tokenAMeta.decimals)
  const rewardTwoDecimal = safeTokenAmountToDecimal(position.rewardTwo, tokenBMeta.decimals)
  // Note: Rewards may use different tokens - for now we assume same as pool tokens
  // This may need adjustment if rewards are in different tokens
  const rewardsEarnedUSD =
    rewardOneDecimal * tokenAMeta.usdPrice + rewardTwoDecimal * tokenBMeta.usdPrice

  // STEP 5: Calculate total current value
  const currentValueUSD = liquidityValueUSD + unclaimedFeesUSD + rewardsEarnedUSD

  // STEP 6: Get initial investment from entry record
  const initialInvestmentUSD = entry.initialValueUSD

  // STEP 7: Calculate initial token amounts from entry
  const initialTokenAAmount = new BN(entry.initialTokenAAmount)
  const initialTokenBAmount = new BN(entry.initialTokenBAmount)
  const initialTokenADecimal = safeTokenAmountToDecimal(initialTokenAAmount, entry.decimalsA)
  const initialTokenBDecimal = safeTokenAmountToDecimal(initialTokenBAmount, entry.decimalsB)

  // STEP 8: Calculate Impermanent Loss (IL)
  // Compare current liquidity value to HODL value
  const ilResult = calculateImpermanentLoss(
    initialTokenADecimal,
    initialTokenBDecimal,
    entry.entryTokenAPrice,
    entry.entryTokenBPrice,
    tokenAMeta.usdPrice,
    tokenBMeta.usdPrice,
    liquidityValueUSD
  )

  // STEP 9: Calculate unrealized P&L
  // Without fees/rewards (pure position performance)
  const unrealizedPnL = liquidityValueUSD - initialInvestmentUSD

  // With fees and rewards included
  const unrealizedPnLWithFees = currentValueUSD - initialInvestmentUSD

  // SECURITY: Use safe division to prevent division by zero
  const unrealizedPnLPercentage = safeDivide(unrealizedPnLWithFees * 100, initialInvestmentUSD, 0)

  // STEP 10: Calculate pool price changes (token B per token A)
  // SECURITY: Calculate price changes with safe division
  const currentPrice = safeDivide(tokenBMeta.usdPrice, tokenAMeta.usdPrice, 0)
  const entryPrice = entry.entryPoolPrice
  const priceChange = currentPrice - entryPrice
  const priceChangePercentage = safeDivide(priceChange * 100, entryPrice, 0)

  // STEP 11: Time metrics
  const positionAgeMs = Date.now() - entry.entryTimestamp
  const positionAgeHours = positionAgeMs / (1000 * 60 * 60)
  const positionAgeDays = positionAgeHours / 24

  return {
    positionAddress: position.positionPubkey.toBase58(),

    // Investment values
    initialInvestmentUSD,
    currentValueUSD,
    liquidityValue: liquidityValueUSD,

    // Fees
    totalFeesEarnedUSD: unclaimedFeesUSD, // TODO: Add claimed fees from history
    claimedFeesUSD: 0, // TODO: Calculate from storage
    unclaimedFeesUSD,

    // Rewards (separate from fees)
    rewardsEarnedUSD,

    // P&L
    unrealizedPnL,
    unrealizedPnLWithFees,
    unrealizedPnLPercentage,

    // Impermanent Loss
    impermanentLoss: ilResult.impermanentLoss,
    impermanentLossPercentage: ilResult.impermanentLossPercentage,
    hodlValue: ilResult.hodlValue,

    // Price changes
    entryPrice,
    currentPrice,
    priceChange,
    priceChangePercentage,

    // Concentrated Liquidity specifics
    currentTick,
    tickLower,
    tickUpper,
    sqrtPriceCurrent: sqrtPriceCurrent.toString(),
    sqrtPriceLower: sqrtPriceLower.toString(),
    sqrtPriceUpper: sqrtPriceUpper.toString(),

    // Time metrics
    positionAgeHours,
    positionAgeDays,

    // Status
    isOpen: true,
    isInRange: inRange,
  }
  } catch (error) {
    // Enhanced error logging
    console.error('[PnL] Error calculating position PnL:', error)
    console.error('[PnL] Position:', position.positionPubkey.toBase58())
    console.error('[PnL] Entry:', entry)

    // Return a safe fallback with zero values
    return {
      positionAddress: position.positionPubkey.toBase58(),
      initialInvestmentUSD: entry?.initialValueUSD || 0,
      currentValueUSD: 0,
      liquidityValue: 0,
      totalFeesEarnedUSD: 0,
      claimedFeesUSD: 0,
      unclaimedFeesUSD: 0,
      rewardsEarnedUSD: 0,
      unrealizedPnL: 0,
      unrealizedPnLWithFees: 0,
      unrealizedPnLPercentage: 0,
      impermanentLoss: 0,
      impermanentLossPercentage: 0,
      hodlValue: 0,
      entryPrice: entry?.entryPoolPrice || 0,
      currentPrice: 0,
      priceChange: 0,
      priceChangePercentage: 0,
      currentTick: 0,
      tickLower: 0,
      tickUpper: 0,
      sqrtPriceCurrent: '0',
      sqrtPriceLower: '0',
      sqrtPriceUpper: '0',
      positionAgeHours: 0,
      positionAgeDays: 0,
      isOpen: true,
      isInRange: false,
    }
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
