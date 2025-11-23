// Token price fetching utilities
// Uses Jupiter Price API v3 for USD valuations

import { JUPITER_PRICE_API_BASE, TOKEN_PRICE_CACHE_DURATION_MS } from '@/lib/damm-v2-pnl-constants'
import { isValidSolanaAddress, validatePrice } from '@/lib/validators'

/**
 * Validated price response interface
 */
interface ValidatedPriceResponse {
  [mint: string]: {
    usdPrice: number
    blockId?: number
    decimals?: number
    priceChange24h?: number
  }
}

/**
 * Validate Jupiter API price response
 * SECURITY: Prevents prototype pollution and validates price data
 */
function validatePriceResponse(data: unknown): ValidatedPriceResponse {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid price response: not an object')
  }

  const validated: ValidatedPriceResponse = {}
  const dangerousKeys = ['__proto__', 'constructor', 'prototype']

  for (const [key, value] of Object.entries(data)) {
    // SECURITY: Prevent prototype pollution
    if (dangerousKeys.includes(key)) {
      console.warn(`[Price Utils] Dangerous key detected: ${key}`)
      continue
    }

    // SECURITY: Validate mint address format
    if (!isValidSolanaAddress(key)) {
      console.warn(`[Price Utils] Invalid mint address: ${key}`)
      continue
    }

    // Validate price data structure
    if (typeof value !== 'object' || value === null) continue

    const priceData = value as Record<string, unknown>
    const usdPrice = Number(priceData.usdPrice)

    // SECURITY: Validate price is a safe number
    if (!validatePrice(usdPrice)) {
      console.warn(`[Price Utils] Invalid price for ${key}: ${usdPrice}`)
      continue
    }

    validated[key] = {
      usdPrice,
      blockId: typeof priceData.blockId === 'number' ? priceData.blockId : undefined,
      decimals: typeof priceData.decimals === 'number' ? priceData.decimals : undefined,
      priceChange24h: typeof priceData.priceChange24h === 'number' ? priceData.priceChange24h : undefined,
    }
  }

  return validated
}

/**
 * Sanitize mint address for URL
 * SECURITY: Prevent SSRF attacks via URL injection
 */
function sanitizeMintForURL(mint: string): string {
  if (!isValidSolanaAddress(mint)) {
    throw new Error('Invalid mint address')
  }

  // Encode for URL safety
  return encodeURIComponent(mint)
}

/**
 * Price cache entry
 */
interface PriceCacheEntry {
  price: number
  timestamp: number
}

/**
 * In-memory price cache to reduce API calls
 * Caches prices for TOKEN_PRICE_CACHE_DURATION_MS (10 minutes)
 */
const priceCache = new Map<string, PriceCacheEntry>()

/**
 * Get token price in USD from Jupiter Price API v3
 * Implements caching to reduce API calls
 *
 * @param mint - Token mint address
 * @returns Price in USD, or 0 if unavailable
 */
export async function getTokenPriceUSD(mint: string): Promise<number> {
  // SECURITY: Validate mint address before processing
  if (!isValidSolanaAddress(mint)) {
    console.error(`[Price Utils] Invalid mint address: ${mint}`)
    return 0
  }

  // Check cache first
  const cached = priceCache.get(mint)
  if (cached && Date.now() - cached.timestamp < TOKEN_PRICE_CACHE_DURATION_MS) {
    return cached.price
  }

  try {
    // SECURITY: Sanitize mint for URL to prevent SSRF
    const safeMint = sanitizeMintForURL(mint)

    // Jupiter Price API v3: GET /price/v3?ids={mint}
    const response = await fetch(`${JUPITER_PRICE_API_BASE}?ids=${safeMint}`)

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Price Utils] Price fetch failed for ${mint.slice(0, 8)}...: ${response.statusText}`)
      }
      return 0
    }

    const rawData = await response.json()

    // SECURITY: Validate response structure
    const validatedData = validatePriceResponse(rawData)
    const price = validatedData[mint]?.usdPrice || 0

    // Update cache
    priceCache.set(mint, { price, timestamp: Date.now() })

    return price
  } catch (error) {
    // Silently fail - fallback pricing will handle this
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Price Utils] Price API error for ${mint.slice(0, 8)}...:`, error)
    }
    return 0
  }
}

/**
 * Get multiple token prices in batch
 * More efficient than calling getTokenPriceUSD multiple times
 *
 * @param mints - Array of token mint addresses
 * @returns Map of mint address to price in USD
 */
export async function getBatchTokenPricesUSD(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()

  if (mints.length === 0) {
    return prices
  }

  // SECURITY: Filter out invalid mints before processing
  const validMints = mints.filter((mint) => isValidSolanaAddress(mint))

  if (validMints.length === 0) {
    console.warn('[Price Utils] No valid mint addresses provided')
    return prices
  }

  // Remove duplicates
  const uniqueMints = Array.from(new Set(validMints))

  try {
    // SECURITY: Sanitize all mints for URL
    const sanitizedMints = uniqueMints.map(sanitizeMintForURL)

    // Jupiter Price API v3 supports multiple IDs: ?ids=mint1,mint2,mint3 (up to 50)
    const mintIds = sanitizedMints.join(',')
    const response = await fetch(`${JUPITER_PRICE_API_BASE}?ids=${mintIds}`)

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Price Utils] Batch price fetch failed: ${response.statusText}`)
      }
      // Fallback to individual fetches
      return await getBatchTokenPricesUSDFallback(uniqueMints)
    }

    const rawData = await response.json()

    // SECURITY: Validate response structure
    const validatedData = validatePriceResponse(rawData)

    // Parse validated response
    uniqueMints.forEach((mint) => {
      const price = validatedData[mint]?.usdPrice || 0
      prices.set(mint, price)

      // Update cache
      priceCache.set(mint, { price, timestamp: Date.now() })
    })

    return prices
  } catch (error) {
    // Silently fall back to individual fetches
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Price Utils] Batch price API error:', error)
    }
    return await getBatchTokenPricesUSDFallback(uniqueMints)
  }
}

/**
 * Fallback function for batch price fetching
 * Fetches prices individually with rate limiting
 */
async function getBatchTokenPricesUSDFallback(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const BATCH_SIZE = 5 // Fetch 5 at a time to avoid rate limits

  for (let i = 0; i < mints.length; i += BATCH_SIZE) {
    const batch = mints.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(batch.map((mint) => getTokenPriceUSD(mint)))

    batch.forEach((mint, index) => {
      prices.set(mint, batchResults[index])
    })

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < mints.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return prices
}

/**
 * Clear the price cache
 * Useful for testing or forcing fresh price fetches
 */
export function clearPriceCache(): void {
  priceCache.clear()
  if (process.env.NODE_ENV === 'development') {
    console.log('[Price Utils] Price cache cleared')
  }
}

/**
 * Get price cache statistics
 */
export function getPriceCacheStats(): {
  size: number
  entries: Array<{ mint: string; price: number; age: number }>
} {
  const now = Date.now()
  const entries: Array<{ mint: string; price: number; age: number }> = []

  priceCache.forEach((entry, mint) => {
    entries.push({
      mint,
      price: entry.price,
      age: now - entry.timestamp,
    })
  })

  return {
    size: priceCache.size,
    entries,
  }
}

/**
 * Clean up expired cache entries
 * Removes entries older than TOKEN_PRICE_CACHE_DURATION_MS
 */
export function cleanupPriceCache(): void {
  const now = Date.now()
  let removedCount = 0

  priceCache.forEach((entry, mint) => {
    if (now - entry.timestamp > TOKEN_PRICE_CACHE_DURATION_MS) {
      priceCache.delete(mint)
      removedCount++
    }
  })

  if (removedCount > 0 && process.env.NODE_ENV === 'development') {
    console.log(`[Price Utils] Cleaned up ${removedCount} expired price cache entries`)
  }
}
