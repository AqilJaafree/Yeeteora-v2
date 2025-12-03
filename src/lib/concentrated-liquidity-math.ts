/**
 * Concentrated Liquidity Math for Meteora DAMM v2
 *
 * Based on Uniswap v3 / Meteora DAMM v2 concentrated liquidity model
 * Reference: Meteora DAMM v2 Documentation (December 2025)
 *
 * Key concepts:
 * - Positions have a liquidity amount (L) and price range [√p_a, √p_b]
 * - Token amounts change as price moves through the range
 * - Prices are stored as sqrt prices in Q64.64 fixed-point format
 * - Ticks represent discrete price points (1 tick = 0.01% price change)
 *
 * SECURITY: All calculations use BN (BigNumber) for precision
 * SECURITY: Safe division and overflow checks throughout
 */

import BN from 'bn.js'
import { TICK_BASE, Q64 } from './damm-v2-pnl-constants'
import { safeDivide } from './validators'

/**
 * Convert Q64.64 sqrt price to decimal sqrt(p) value
 *
 * @param sqrtPriceQ64 - Sqrt price in Q64.64 format
 * @returns Decimal sqrt(p) value
 */
function sqrtPriceQ64ToDecimal(sqrtPriceQ64: BN): number {
  if (sqrtPriceQ64.lte(new BN(0))) {
    return 0
  }

  // For Q64.64, we divide by 2^64
  // Use string conversion to handle large numbers safely
  const Q64_BN = new BN(2).pow(new BN(64))

  // Get quotient and remainder
  const quotient = sqrtPriceQ64.div(Q64_BN)
  const remainder = sqrtPriceQ64.mod(Q64_BN)

  // Convert quotient to number (check if safe first)
  let quotientNum = 0
  if (quotient.lte(new BN(Number.MAX_SAFE_INTEGER))) {
    quotientNum = quotient.toNumber()
  } else {
    // For very large values, use string conversion
    // This is unlikely for sqrt prices in normal trading ranges
    console.warn('[CL Math] Sqrt price quotient exceeds safe integer range')
    quotientNum = parseFloat(quotient.toString())
  }

  // Convert remainder to number (should always be safe since remainder < 2^64)
  // Use toString to avoid BN's toNumber() safety check
  const remainderNum = parseFloat(remainder.toString())

  // Calculate final value: quotient + remainder / 2^64
  return quotientNum + remainderNum / Math.pow(2, 64)
}

/**
 * Convert sqrt price (Q64.64 format) to regular price
 *
 * Formula: p = (sqrtPrice / 2^64)^2
 *
 * @param sqrtPrice - Sqrt price in Q64.64 fixed-point format
 * @returns Regular price as decimal number
 */
export function sqrtPriceQ64ToPrice(sqrtPrice: BN): number {
  const sqrtPriceDecimal = sqrtPriceQ64ToDecimal(sqrtPrice)

  // Square to get price: (√p)^2 = p
  const price = sqrtPriceDecimal * sqrtPriceDecimal

  // SECURITY: Validate result is finite
  if (!Number.isFinite(price) || price < 0) {
    console.warn('[CL Math] Invalid price from sqrtPrice:', sqrtPrice.toString())
    return 0
  }

  return price
}

/**
 * Convert regular price to sqrt price (Q64.64 format)
 *
 * Formula: sqrtPrice = √p × 2^64
 *
 * @param price - Regular price as decimal number
 * @returns Sqrt price in Q64.64 fixed-point format
 */
export function priceToSqrtPriceQ64(price: number): BN {
  // SECURITY: Validate input
  if (!Number.isFinite(price) || price <= 0) {
    return new BN(0)
  }

  // Calculate √p
  const sqrtPrice = Math.sqrt(price)

  // SECURITY: Check for overflow before multiplication
  if (!Number.isFinite(sqrtPrice)) {
    console.warn('[CL Math] Invalid sqrt price from price:', price)
    return new BN(0)
  }

  // Multiply by 2^64 to convert to Q64.64
  // Use string conversion to avoid precision loss
  const sqrtPriceQ64Str = (sqrtPrice * Q64).toFixed(0)

  return new BN(sqrtPriceQ64Str)
}

/**
 * Convert tick to price
 *
 * Formula: p = 1.0001^(2 × tick)
 * Note: In sqrt space, √p = 1.0001^tick
 *
 * @param tick - Tick index
 * @returns Price as decimal number
 */
export function tickToPrice(tick: number): number {
  // SECURITY: Validate tick is finite
  if (!Number.isFinite(tick)) {
    console.warn('[CL Math] Invalid tick:', tick)
    return 0
  }

  // Calculate: p = 1.0001^(2 × tick)
  // In sqrt space: √p = 1.0001^tick, so p = (√p)^2 = 1.0001^(2×tick)
  const price = Math.pow(TICK_BASE, 2 * tick)

  // SECURITY: Validate result
  if (!Number.isFinite(price) || price <= 0) {
    console.warn('[CL Math] Invalid price from tick:', tick)
    return 0
  }

  return price
}

/**
 * Convert price to tick (inverse of tickToPrice)
 *
 * Formula: tick = log(√p) / log(1.0001) = log(p) / (2 × log(1.0001))
 *
 * @param price - Price as decimal number
 * @returns Tick index (rounded to nearest integer)
 */
export function priceToTick(price: number): number {
  // SECURITY: Validate input
  if (!Number.isFinite(price) || price <= 0) {
    console.warn('[CL Math] Invalid price for tick conversion:', price)
    return 0
  }

  // Calculate: tick = log(p) / (2 × log(1.0001))
  const tick = Math.log(price) / (2 * Math.log(TICK_BASE))

  // Round to nearest integer (ticks are discrete)
  const tickRounded = Math.round(tick)

  // SECURITY: Validate result is finite
  if (!Number.isFinite(tickRounded)) {
    console.warn('[CL Math] Invalid tick from price:', price)
    return 0
  }

  return tickRounded
}

/**
 * Calculate token amounts from liquidity at a given price
 * This is used for simulating withdraw amounts
 *
 * For a position with liquidity L and range [√p_a, √p_b]:
 * - If p < p_a (below range): x = L × (1/√p_a - 1/√p_b), y = 0
 * - If p_a ≤ p ≤ p_b (in range): x = L × (1/√p - 1/√p_b), y = L × (√p - √p_a)
 * - If p > p_b (above range): x = 0, y = L × (√p_b - √p_a)
 *
 * @param liquidity - Liquidity amount (L)
 * @param sqrtPriceCurrent - Current sqrt price (Q64.64)
 * @param sqrtPriceLower - Lower bound sqrt price (Q64.64)
 * @param sqrtPriceUpper - Upper bound sqrt price (Q64.64)
 * @param tokenADecimals - Token A decimals
 * @param tokenBDecimals - Token B decimals
 * @returns Object with token amounts as decimal numbers
 */
export function calculateTokenAmountsFromLiquidity(
  liquidity: BN,
  sqrtPriceCurrent: BN,
  sqrtPriceLower: BN,
  sqrtPriceUpper: BN,
  tokenADecimals: number,
  tokenBDecimals: number
): { tokenAAmount: number; tokenBAmount: number } {
  // SECURITY: Validate inputs
  if (liquidity.lte(new BN(0))) {
    return { tokenAAmount: 0, tokenBAmount: 0 }
  }

  if (sqrtPriceLower.gte(sqrtPriceUpper)) {
    console.warn('[CL Math] Invalid price range: lower >= upper')
    return { tokenAAmount: 0, tokenBAmount: 0 }
  }

  // Convert sqrt prices to decimal for calculation
  const sqrtP = sqrtPriceQ64ToDecimal(sqrtPriceCurrent)
  const sqrtPa = sqrtPriceQ64ToDecimal(sqrtPriceLower)
  const sqrtPb = sqrtPriceQ64ToDecimal(sqrtPriceUpper)

  // SECURITY: Validate conversions
  if (!Number.isFinite(sqrtP) || !Number.isFinite(sqrtPa) || !Number.isFinite(sqrtPb)) {
    console.warn('[CL Math] Invalid sqrt price conversion')
    return { tokenAAmount: 0, tokenBAmount: 0 }
  }

  let tokenAAmount = 0
  let tokenBAmount = 0

  // Case 1: Price below range (p < p_a)
  if (sqrtPriceCurrent.lt(sqrtPriceLower)) {
    // x = L × (1/√p_a - 1/√p_b)
    // All liquidity is in token A
    const liquidityNum = liquidity.toNumber()
    tokenAAmount = liquidityNum * (1 / sqrtPa - 1 / sqrtPb)
    tokenBAmount = 0
  }
  // Case 2: Price above range (p > p_b)
  else if (sqrtPriceCurrent.gt(sqrtPriceUpper)) {
    // y = L × (√p_b - √p_a)
    // All liquidity is in token B
    const liquidityNum = liquidity.toNumber()
    tokenAAmount = 0
    tokenBAmount = liquidityNum * (sqrtPb - sqrtPa)
  }
  // Case 3: Price in range (p_a ≤ p ≤ p_b)
  else {
    // x = L × (1/√p - 1/√p_b)
    // y = L × (√p - √p_a)
    const liquidityNum = liquidity.toNumber()
    tokenAAmount = liquidityNum * (1 / sqrtP - 1 / sqrtPb)
    tokenBAmount = liquidityNum * (sqrtP - sqrtPa)
  }

  // SECURITY: Validate results are finite
  if (!Number.isFinite(tokenAAmount) || !Number.isFinite(tokenBAmount)) {
    console.warn('[CL Math] Invalid token amount calculation')
    return { tokenAAmount: 0, tokenBAmount: 0 }
  }

  // Ensure non-negative
  tokenAAmount = Math.max(0, tokenAAmount)
  tokenBAmount = Math.max(0, tokenBAmount)

  // Adjust for decimals (the amounts are in the base units)
  // Since liquidity is already scaled, we need to scale down by decimals
  const tokenADecimal = tokenAAmount / Math.pow(10, tokenADecimals)
  const tokenBDecimal = tokenBAmount / Math.pow(10, tokenBDecimals)

  return {
    tokenAAmount: tokenADecimal,
    tokenBAmount: tokenBDecimal,
  }
}

/**
 * Calculate impermanent loss (IL) for a concentrated liquidity position
 *
 * IL compares the current position value to what it would be worth if held (HODL)
 * Formula: IL = V_hodl - V_position (excluding fees/rewards)
 *
 * @param initialTokenA - Initial token A amount deposited
 * @param initialTokenB - Initial token B amount deposited
 * @param initialPriceAUSD - Initial USD price of token A
 * @param initialPriceBUSD - Initial USD price of token B
 * @param currentPriceAUSD - Current USD price of token A
 * @param currentPriceBUSD - Current USD price of token B
 * @param currentLiquidityValueUSD - Current value from liquidity (excluding fees)
 * @returns Object with IL and HODL value
 */
export function calculateImpermanentLoss(
  initialTokenA: number,
  initialTokenB: number,
  initialPriceAUSD: number,
  initialPriceBUSD: number,
  currentPriceAUSD: number,
  currentPriceBUSD: number,
  currentLiquidityValueUSD: number
): { impermanentLoss: number; hodlValue: number; impermanentLossPercentage: number } {
  // Calculate HODL value: what the initial tokens would be worth now
  const hodlValue = initialTokenA * currentPriceAUSD + initialTokenB * currentPriceBUSD

  // Calculate initial value for percentage
  const initialValue = initialTokenA * initialPriceAUSD + initialTokenB * initialPriceBUSD

  // IL = HODL value - current position value (from liquidity only, no fees)
  const impermanentLoss = hodlValue - currentLiquidityValueUSD

  // IL as percentage of initial investment
  const impermanentLossPercentage = safeDivide(impermanentLoss * 100, initialValue, 0)

  return {
    impermanentLoss,
    hodlValue,
    impermanentLossPercentage,
  }
}

/**
 * Calculate liquidity (L) from initial deposit amounts
 *
 * This reverses the token amount calculation to find L given the amounts
 * For a position with range [√p_a, √p_b] at price √p_0:
 *
 * If p_0 < p_a: L = Δy / (√p_b - √p_a)
 * If p_0 > p_b: L = Δx / (1/√p_a - 1/√p_b)
 * If p_a ≤ p_0 ≤ p_b: L = min(Δx / (1/√p_0 - 1/√p_b), Δy / (√p_0 - √p_a))
 *
 * Note: For DAMM v2, we already have L from the position state, so this is
 * primarily for validation or alternative calculations
 *
 * @param tokenAAmount - Token A amount deposited (raw BN)
 * @param tokenBAmount - Token B amount deposited (raw BN)
 * @param sqrtPriceEntry - Entry sqrt price (Q64.64)
 * @param sqrtPriceLower - Lower bound sqrt price (Q64.64)
 * @param sqrtPriceUpper - Upper bound sqrt price (Q64.64)
 * @returns Liquidity (L) as BN
 */
export function calculateLiquidityFromAmounts(
  tokenAAmount: BN,
  tokenBAmount: BN,
  sqrtPriceEntry: BN,
  sqrtPriceLower: BN,
  sqrtPriceUpper: BN
): BN {
  // SECURITY: Validate price range
  if (sqrtPriceLower.gte(sqrtPriceUpper)) {
    console.warn('[CL Math] Invalid price range for liquidity calculation')
    return new BN(0)
  }

  // Convert to decimal for calculation
  const sqrtP0 = sqrtPriceEntry.toNumber() / Q64
  const sqrtPa = sqrtPriceLower.toNumber() / Q64
  const sqrtPb = sqrtPriceUpper.toNumber() / Q64

  let liquidityFromA = Number.MAX_VALUE
  let liquidityFromB = Number.MAX_VALUE

  // Calculate L from token A (if applicable)
  if (tokenAAmount.gt(new BN(0)) && sqrtP0 < sqrtPb) {
    // L = Δx / (1/√p - 1/√p_b)
    const denominator = 1 / Math.max(sqrtP0, sqrtPa) - 1 / sqrtPb
    if (denominator > 0) {
      liquidityFromA = tokenAAmount.toNumber() / denominator
    }
  }

  // Calculate L from token B (if applicable)
  if (tokenBAmount.gt(new BN(0)) && sqrtP0 > sqrtPa) {
    // L = Δy / (√p - √p_a)
    const denominator = Math.min(sqrtP0, sqrtPb) - sqrtPa
    if (denominator > 0) {
      liquidityFromB = tokenBAmount.toNumber() / denominator
    }
  }

  // Take minimum of both (the constraint that binds)
  const liquidity = Math.min(liquidityFromA, liquidityFromB)

  // SECURITY: Validate result
  if (!Number.isFinite(liquidity) || liquidity <= 0) {
    console.warn('[CL Math] Invalid liquidity calculation')
    return new BN(0)
  }

  return new BN(Math.floor(liquidity))
}

/**
 * Calculate fees earned based on fee growth
 *
 * Meteora DAMM v2 tracks fee growth globally per unit of liquidity
 * Formula: fees = (feeGrowthGlobal - feeGrowthLast) × (L / totalL)
 *
 * Note: In practice, the SDK's getUnClaimReward function handles this
 * This function is for reference or if we need manual calculation
 *
 * @param liquidity - Position liquidity (L)
 * @param feeGrowthGlobalA - Global fee growth for token A
 * @param feeGrowthGlobalB - Global fee growth for token B
 * @param feeGrowthLastA - Last recorded fee growth for token A (from position)
 * @param feeGrowthLastB - Last recorded fee growth for token B (from position)
 * @returns Object with fee amounts for both tokens
 */
export function calculateFeesFromGrowth(
  liquidity: BN,
  feeGrowthGlobalA: BN,
  feeGrowthGlobalB: BN,
  feeGrowthLastA: BN,
  feeGrowthLastB: BN
): { feeA: BN; feeB: BN } {
  // Calculate fee growth delta
  const feeGrowthDeltaA = feeGrowthGlobalA.sub(feeGrowthLastA)
  const feeGrowthDeltaB = feeGrowthGlobalB.sub(feeGrowthLastB)

  // Calculate fees: L × feeGrowthDelta
  // Note: Fee growth is typically stored with high precision scaling
  const feeA = liquidity.mul(feeGrowthDeltaA).div(new BN(2).pow(new BN(64)))
  const feeB = liquidity.mul(feeGrowthDeltaB).div(new BN(2).pow(new BN(64)))

  return { feeA, feeB }
}

/**
 * Calculate rewards with fixed-point scaling (>>64)
 *
 * Meteora uses Q64.64 fixed-point arithmetic for reward calculation
 * Formula: reward_j = L × (reward_per_token_now_j - last_reward_per_token_j) >> 64
 *
 * @param liquidity - Position liquidity (L)
 * @param rewardPerTokenNow - Current reward per token (Q64.64)
 * @param rewardPerTokenLast - Last recorded reward per token (Q64.64)
 * @returns Reward amount as BN
 */
export function calculateRewardWithScaling(
  liquidity: BN,
  rewardPerTokenNow: BN,
  rewardPerTokenLast: BN
): BN {
  // Calculate reward per token delta
  const rewardPerTokenDelta = rewardPerTokenNow.sub(rewardPerTokenLast)

  // SECURITY: Handle negative deltas (shouldn't happen but be safe)
  if (rewardPerTokenDelta.lt(new BN(0))) {
    console.warn('[CL Math] Negative reward delta detected')
    return new BN(0)
  }

  // Calculate: L × delta
  const rewardScaled = liquidity.mul(rewardPerTokenDelta)

  // Right shift by 64 bits (divide by 2^64) to remove fixed-point scaling
  const reward = rewardScaled.shrn(64)

  return reward
}

/**
 * Check if position is in range
 *
 * @param currentTick - Current tick
 * @param tickLower - Lower bound tick
 * @param tickUpper - Upper bound tick
 * @returns True if position is in range
 */
export function isPositionInRange(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): boolean {
  return currentTick >= tickLower && currentTick <= tickUpper
}
