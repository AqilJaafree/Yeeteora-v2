// Security validation utilities for DAMM v2 P&L implementation

import { PublicKey } from '@solana/web3.js'

/**
 * Validates if a string is a valid Solana address or historical pseudo-address
 * Prevents injection attacks via malformed addresses
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    // Allow historical pseudo-addresses (format: hist-{signature})
    if (address.startsWith('hist-')) {
      // Historical addresses should be hist-{16 chars from signature}
      if (address.length >= 20 && address.length <= 80) {
        // Validate the part after 'hist-' contains valid base58 characters
        const signaturePart = address.slice(5)
        if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(signaturePart)) {
          return true
        }
      }
      return false
    }

    // Solana addresses are base58 encoded, 32-44 characters
    if (!address || typeof address !== 'string') return false
    if (address.length < 32 || address.length > 44) return false

    // Check for base58 character set only
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) return false

    // Prevent prototype pollution attempts
    const dangerousKeys = ['__proto__', 'constructor', 'prototype']
    if (dangerousKeys.includes(address)) return false

    // Verify it's a valid PublicKey
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

/**
 * Validates timestamp is within reasonable range
 * Prevents manipulation with future or very old timestamps
 */
export function validateTimestamp(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return Date.now()
  }

  const now = Date.now()
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000)
  const oneDayFuture = now + (24 * 60 * 60 * 1000)

  // Timestamp must be within reasonable range
  if (timestamp < oneYearAgo || timestamp > oneDayFuture) {
    console.warn(`[Validation] Invalid timestamp: ${timestamp}, using current time`)
    return now
  }

  return timestamp
}

/**
 * Validates token decimals are in safe range
 */
export function validateDecimals(decimals: number): boolean {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18
}

/**
 * Validates price is a safe, positive number
 */
export function validatePrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0 && price < 1e15
}

/**
 * Validates timeframe parameter
 */
const VALID_TIMEFRAMES = ['1H', '1D', '1W', '1M', '1Y', 'MAX'] as const
export type ValidTimeframe = typeof VALID_TIMEFRAMES[number]

export function isValidTimeframe(value: unknown): value is ValidTimeframe {
  return typeof value === 'string' && VALID_TIMEFRAMES.includes(value as ValidTimeframe)
}

/**
 * Safe division utility to prevent division by zero
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback
  }

  if (denominator === 0 || Math.abs(denominator) < 1e-10) {
    return fallback
  }

  const result = numerator / denominator

  if (!Number.isFinite(result)) {
    return fallback
  }

  return result
}

/**
 * Safe power of 10 calculation
 */
export function safePow10(exponent: number): number {
  if (exponent < 0 || exponent > 18) {
    throw new Error(`Exponent out of safe range: ${exponent}`)
  }

  const result = Math.pow(10, exponent)

  if (!Number.isFinite(result)) {
    throw new Error(`Power calculation overflow: 10^${exponent}`)
  }

  return result
}
