// TypeScript interfaces for DAMM v2 P&L tracking
// No 'any' types - all properly typed per project guidelines

import BN from 'bn.js'

/**
 * Represents when a position was opened (entry event)
 * Stored in localStorage for historical tracking
 */
export interface PositionEntryRecord {
  positionAddress: string // Position public key (base58)
  poolAddress: string // Pool public key (base58)
  entryTimestamp: number // Unix timestamp (milliseconds)
  tokenAMint: string // Token A mint address
  tokenBMint: string // Token B mint address

  // Entry amounts (raw, with decimals) - BN serialized to string for storage
  initialTokenAAmount: string // BN serialized to string
  initialTokenBAmount: string // BN serialized to string

  // Entry prices (for P&L calculation)
  entryTokenAPrice: number // USD price at entry
  entryTokenBPrice: number // USD price at entry
  entryPoolPrice: number // Pool price (token B per token A)

  // Entry value (USD)
  initialValueUSD: number // Total USD value at entry

  // Metadata
  decimalsA: number
  decimalsB: number
  transactionSignature?: string // Creation transaction
}

/**
 * Represents when a position was closed (exit event)
 * Stored in localStorage for historical tracking
 */
export interface PositionExitRecord {
  positionAddress: string
  poolAddress: string
  exitTimestamp: number

  // Exit amounts received (raw, with decimals)
  finalTokenAAmount: string // BN serialized to string
  finalTokenBAmount: string // BN serialized to string

  // Exit prices
  exitTokenAPrice: number
  exitTokenBPrice: number
  exitPoolPrice: number

  // Exit value (USD)
  finalValueUSD: number

  // Fees collected during position lifetime
  totalFeesCollectedA: string // BN serialized to string
  totalFeesCollectedB: string // BN serialized to string
  totalFeesValueUSD: number

  // P&L Summary
  realizedPnL: number // Final USD P&L (exit value - entry value)
  realizedPnLPercentage: number // P&L as percentage of initial investment

  transactionSignature?: string // Exit transaction
}

/**
 * Current state of an open position (for live P&L calculation)
 */
export interface LivePositionState {
  positionAddress: string
  poolAddress: string

  // Current amounts from SDK
  currentTokenAAmount: BN
  currentTokenBAmount: BN

  // Current unclaimed fees
  unclaimedFeesA: BN
  unclaimedFeesB: BN

  // Current prices (from Jupiter or pool state)
  currentTokenAPrice: number
  currentTokenBPrice: number
  currentPoolPrice: number

  // Current value
  currentValueUSD: number
  unclaimedFeesValueUSD: number

  // Last update timestamp
  lastUpdateTimestamp: number
}

/**
 * Complete position with entry, current state, and historical snapshots
 */
export interface PositionWithHistory {
  entry: PositionEntryRecord
  current: LivePositionState | null // null if position closed
  exit: PositionExitRecord | null // null if position still open
  snapshots: PositionSnapshot[] // Historical value snapshots
}

/**
 * Snapshot of position value at a specific time
 * Used for time-series chart data
 */
export interface PositionSnapshot {
  timestamp: number
  valueUSD: number // Total position value at this time
  feesValueUSD: number // Accumulated fees value at this time
  unrealizedPnL: number // P&L at this snapshot
  unrealizedPnLPercentage: number
  tokenAPrice: number
  tokenBPrice: number
  poolPrice: number
}

/**
 * Aggregated P&L across all positions for chart display
 */
export interface AggregatedPnLDataPoint {
  timestamp: number
  date: string // Human-readable date

  // Open positions P&L
  openPositionsValue: number // Current value of open positions
  openPositionsUnrealizedPnL: number // Unrealized P&L (can be negative)

  // Closed positions P&L
  closedPositionsRealizedPnL: number // Cumulative realized P&L

  // Total P&L
  totalPnL: number // unrealized + realized
  totalPnLPercentage: number // Total P&L as % of total invested

  // Additional metrics
  totalFeesEarned: number // All fees (claimed + unclaimed)
  totalInvested: number // Sum of all initial investments
  totalCurrentValue: number // Current value of all positions
}

/**
 * Meteora DAMM v2 Pool API Response
 * Based on Meteora DAMM v2 API documentation
 */
export interface MeteoraPoolMetrics {
  pool_address: string
  pool_price: number // Current pool price
  virtual_price: number // Virtual AMM price
  token_a_amount: number // Pool token A reserves
  token_b_amount: number // Pool token B reserves
  token_a_amount_usd: number // USD value of token A
  token_b_amount_usd: number // USD value of token B
  liquidity: string // Total liquidity
  apr: number // Annual percentage rate
  fee24h: number // Fees generated in last 24h
  volume24h: number // Trading volume in last 24h
  tvl: number // Total value locked (USD)
  base_fee: number // Base fee rate
  dynamic_fee: number // Dynamic fee rate
  sqrt_price: number // Current sqrt price
}

/**
 * P&L calculation result for a single position
 */
export interface PositionPnLCalculation {
  positionAddress: string

  // Investment
  initialInvestmentUSD: number
  currentValueUSD: number

  // Fees
  totalFeesEarnedUSD: number
  claimedFeesUSD: number
  unclaimedFeesUSD: number

  // P&L
  unrealizedPnL: number // Excluding fees
  unrealizedPnLWithFees: number // Including fees
  unrealizedPnLPercentage: number

  // Price changes
  entryPrice: number
  currentPrice: number
  priceChange: number
  priceChangePercentage: number

  // Time metrics
  positionAgeHours: number
  positionAgeDays: number

  // Status
  isOpen: boolean
  isInRange: boolean // For concentrated liquidity
}

/**
 * Claimed fees record for historical tracking
 */
export interface ClaimedFeesRecord {
  feesA: string // BN serialized to string
  feesB: string // BN serialized to string
  valueUSD: number
  timestamp: number
}

/**
 * Jupiter Token Price API Response
 */
export interface JupiterTokenMeta {
  address: string
  symbol: string
  name: string
  decimals: number
  usdPrice?: number
  icon?: string
}
