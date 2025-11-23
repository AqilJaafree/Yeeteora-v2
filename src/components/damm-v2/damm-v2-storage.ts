// LocalStorage management for DAMM v2 position history
// Handles persistence of entry records, exit records, snapshots, and claimed fees

import type {
  PositionEntryRecord,
  PositionExitRecord,
  PositionSnapshot,
  ClaimedFeesRecord,
} from './damm-v2-pnl-types'
import {
  STORAGE_KEY_POSITION_ENTRIES,
  STORAGE_KEY_POSITION_EXITS,
  STORAGE_KEY_POSITION_SNAPSHOTS,
  STORAGE_KEY_CLAIMED_FEES,
  MAX_SNAPSHOTS_PER_POSITION,
} from '@/lib/damm-v2-pnl-constants'
import { isValidSolanaAddress, validateTimestamp } from '@/lib/validators'

/**
 * Safe JSON parser with prototype pollution protection
 */
function safeJSONParse<T>(
  jsonString: string,
  validator: (data: unknown) => data is T
): T | null {
  try {
    const parsed = JSON.parse(jsonString)

    // Prevent prototype pollution
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('Invalid JSON structure')
    }

    // Check for dangerous keys
    const dangerousKeys = ['__proto__', 'constructor', 'prototype']
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (Array.isArray(item) && dangerousKeys.includes(item[0])) {
          throw new Error('Dangerous key detected in storage')
        }
      }
    }

    if (!validator(parsed)) {
      throw new Error('Data failed validation')
    }

    return parsed
  } catch (error) {
    console.error('[Storage] JSON parse error:', error)
    return null
  }
}

/**
 * Type guard for entry records
 */
function isValidEntryRecordArray(data: unknown): data is [string, PositionEntryRecord][] {
  if (!Array.isArray(data)) return false

  return data.every((item) => {
    if (!Array.isArray(item) || item.length !== 2) return false
    const [key, value] = item

    // Validate key is safe Solana address (or historical pseudo-address)
    if (!isValidSolanaAddress(key)) return false

    return (
      typeof value === 'object' &&
      value !== null &&
      'positionAddress' in value &&
      'poolAddress' in value &&
      'entryTimestamp' in value &&
      typeof value.positionAddress === 'string' &&
      isValidSolanaAddress(value.positionAddress) &&
      typeof value.poolAddress === 'string' &&
      // Allow 'historical-unknown' for historical records
      (isValidSolanaAddress(value.poolAddress) || value.poolAddress === 'historical-unknown') &&
      typeof value.entryTimestamp === 'number' &&
      value.entryTimestamp > 0
    )
  })
}

/**
 * Type guard for exit records
 */
function isValidExitRecordArray(data: unknown): data is [string, PositionExitRecord][] {
  if (!Array.isArray(data)) return false

  return data.every((item) => {
    if (!Array.isArray(item) || item.length !== 2) return false
    const [key, value] = item

    // Validate key is safe Solana address (or historical pseudo-address)
    if (!isValidSolanaAddress(key)) return false

    return (
      typeof value === 'object' &&
      value !== null &&
      'positionAddress' in value &&
      'exitTimestamp' in value &&
      typeof value.positionAddress === 'string' &&
      isValidSolanaAddress(value.positionAddress) &&
      typeof value.exitTimestamp === 'number' &&
      value.exitTimestamp > 0
    )
  })
}

/**
 * Type guard for snapshot records
 */
function isValidSnapshotRecordArray(data: unknown): data is [string, PositionSnapshot[]][] {
  if (!Array.isArray(data)) return false

  return data.every((item) => {
    if (!Array.isArray(item) || item.length !== 2) return false
    const [key, value] = item

    // Validate key is safe Solana address
    if (!isValidSolanaAddress(key)) return false

    return (
      Array.isArray(value) &&
      value.every(
        (snapshot) =>
          typeof snapshot === 'object' &&
          snapshot !== null &&
          'timestamp' in snapshot &&
          typeof snapshot.timestamp === 'number' &&
          snapshot.timestamp > 0
      )
    )
  })
}

/**
 * Type guard for claimed fees records
 */
function isValidClaimedFeesArray(data: unknown): data is [string, ClaimedFeesRecord[]][] {
  if (!Array.isArray(data)) return false

  return data.every((item) => {
    if (!Array.isArray(item) || item.length !== 2) return false
    const [key, value] = item

    // Validate key is safe Solana address
    if (!isValidSolanaAddress(key)) return false

    return (
      Array.isArray(value) &&
      value.every(
        (record) =>
          typeof record === 'object' &&
          record !== null &&
          'timestamp' in record &&
          typeof record.timestamp === 'number' &&
          record.timestamp > 0
      )
    )
  })
}

/**
 * Storage manager for DAMM v2 position history
 * All data persisted in localStorage for browser persistence
 */
export class DammV2PositionStorage {
  /**
   * Save position entry when user creates position
   */
  static savePositionEntry(entry: PositionEntryRecord): void {
    try {
      // SECURITY: Validate all addresses before storing
      if (!isValidSolanaAddress(entry.positionAddress)) {
        throw new Error('Invalid position address format')
      }
      // Allow 'historical-unknown' for historical records
      if (!isValidSolanaAddress(entry.poolAddress) && entry.poolAddress !== 'historical-unknown') {
        throw new Error('Invalid pool address format')
      }
      if (!isValidSolanaAddress(entry.tokenAMint)) {
        throw new Error('Invalid tokenA mint address')
      }
      if (!isValidSolanaAddress(entry.tokenBMint)) {
        throw new Error('Invalid tokenB mint address')
      }

      // SECURITY: Validate timestamp
      entry.entryTimestamp = validateTimestamp(entry.entryTimestamp)

      const existing = this.getAllEntries()
      existing.set(entry.positionAddress, entry)

      localStorage.setItem(
        STORAGE_KEY_POSITION_ENTRIES,
        JSON.stringify(Array.from(existing.entries()))
      )

      if (process.env.NODE_ENV === 'development') {
        console.log(`[DAMM v2 Storage] Saved position entry: ${entry.positionAddress}`)
      }
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to save position entry:', error)
      throw error
    }
  }

  /**
   * Save position exit when user closes position
   */
  static savePositionExit(exit: PositionExitRecord): void {
    try {
      const existing = this.getAllExits()
      existing.set(exit.positionAddress, exit)

      localStorage.setItem(
        STORAGE_KEY_POSITION_EXITS,
        JSON.stringify(Array.from(existing.entries()))
      )

      console.log(`[DAMM v2 Storage] Saved position exit: ${exit.positionAddress}`)
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to save position exit:', error)
    }
  }

  /**
   * Get all position entries
   */
  static getAllEntries(): Map<string, PositionEntryRecord> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_POSITION_ENTRIES)
      if (!stored) return new Map()

      // SECURITY: Use safe JSON parser with validation
      const parsed = safeJSONParse(stored, isValidEntryRecordArray)
      if (!parsed) {
        console.warn('[Storage] Invalid entry data, resetting')
        return new Map()
      }

      return new Map(parsed)
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to load position entries:', error)
      return new Map()
    }
  }

  /**
   * Get position entry by address
   */
  static getEntry(positionAddress: string): PositionEntryRecord | null {
    const entries = this.getAllEntries()
    return entries.get(positionAddress) || null
  }

  /**
   * Get all position exits
   */
  static getAllExits(): Map<string, PositionExitRecord> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_POSITION_EXITS)
      if (!stored) return new Map()

      // SECURITY: Use safe JSON parser with validation
      const parsed = safeJSONParse(stored, isValidExitRecordArray)
      if (!parsed) {
        console.warn('[Storage] Invalid exit data, resetting')
        return new Map()
      }

      return new Map(parsed)
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to load position exits:', error)
      return new Map()
    }
  }

  /**
   * Get position exit by address
   */
  static getExit(positionAddress: string): PositionExitRecord | null {
    const exits = this.getAllExits()
    return exits.get(positionAddress) || null
  }

  /**
   * Save periodic snapshot of position value
   * Keeps last MAX_SNAPSHOTS_PER_POSITION snapshots (90 days of hourly data)
   */
  static saveSnapshot(positionAddress: string, snapshot: PositionSnapshot): void {
    try {
      const allSnapshots = this.getAllSnapshots()
      const positionSnapshots = allSnapshots.get(positionAddress) || []

      // Add new snapshot
      positionSnapshots.push(snapshot)

      // Keep last N snapshots (FIFO)
      if (positionSnapshots.length > MAX_SNAPSHOTS_PER_POSITION) {
        positionSnapshots.splice(0, positionSnapshots.length - MAX_SNAPSHOTS_PER_POSITION)
      }

      allSnapshots.set(positionAddress, positionSnapshots)

      localStorage.setItem(
        STORAGE_KEY_POSITION_SNAPSHOTS,
        JSON.stringify(Array.from(allSnapshots.entries()))
      )

      console.log(
        `[DAMM v2 Storage] Saved snapshot for ${positionAddress} (total: ${positionSnapshots.length})`
      )
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to save snapshot:', error)
    }
  }

  /**
   * Get all snapshots for all positions
   */
  static getAllSnapshots(): Map<string, PositionSnapshot[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_POSITION_SNAPSHOTS)
      if (!stored) return new Map()

      // SECURITY: Use safe JSON parser with validation
      const parsed = safeJSONParse(stored, isValidSnapshotRecordArray)
      if (!parsed) {
        console.warn('[Storage] Invalid snapshot data, resetting')
        return new Map()
      }

      return new Map(parsed)
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to load snapshots:', error)
      return new Map()
    }
  }

  /**
   * Get snapshots for a specific position
   */
  static getPositionSnapshots(positionAddress: string): PositionSnapshot[] {
    const allSnapshots = this.getAllSnapshots()
    return allSnapshots.get(positionAddress) || []
  }

  /**
   * Record claimed fees when user manually claims
   */
  static recordClaimedFees(
    positionAddress: string,
    feesA: string,
    feesB: string,
    valueUSD: number,
    timestamp: number
  ): void {
    try {
      const allClaimed = this.getAllClaimedFees()
      const positionClaimed = allClaimed.get(positionAddress) || []

      const record: ClaimedFeesRecord = {
        feesA,
        feesB,
        valueUSD,
        timestamp,
      }

      positionClaimed.push(record)
      allClaimed.set(positionAddress, positionClaimed)

      localStorage.setItem(
        STORAGE_KEY_CLAIMED_FEES,
        JSON.stringify(Array.from(allClaimed.entries()))
      )

      console.log(`[DAMM v2 Storage] Recorded claimed fees for ${positionAddress}: $${valueUSD}`)
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to record claimed fees:', error)
    }
  }

  /**
   * Get all claimed fees for all positions
   */
  static getAllClaimedFees(): Map<string, ClaimedFeesRecord[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CLAIMED_FEES)
      if (!stored) return new Map()

      // SECURITY: Use safe JSON parser with validation
      const parsed = safeJSONParse(stored, isValidClaimedFeesArray)
      if (!parsed) {
        console.warn('[Storage] Invalid claimed fees data, resetting')
        return new Map()
      }

      return new Map(parsed)
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to load claimed fees:', error)
      return new Map()
    }
  }

  /**
   * Get claimed fees for a specific position
   */
  static getPositionClaimedFees(positionAddress: string): ClaimedFeesRecord[] {
    const allClaimed = this.getAllClaimedFees()
    return allClaimed.get(positionAddress) || []
  }

  /**
   * Get total claimed fees value for a position
   */
  static getTotalClaimedFeesValue(positionAddress: string): number {
    const claimed = this.getPositionClaimedFees(positionAddress)
    return claimed.reduce((sum, record) => sum + record.valueUSD, 0)
  }

  /**
   * Clear all position data (for testing or reset)
   */
  static clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY_POSITION_ENTRIES)
      localStorage.removeItem(STORAGE_KEY_POSITION_EXITS)
      localStorage.removeItem(STORAGE_KEY_POSITION_SNAPSHOTS)
      localStorage.removeItem(STORAGE_KEY_CLAIMED_FEES)

      console.log('[DAMM v2 Storage] Cleared all position data')
    } catch (error) {
      console.error('[DAMM v2 Storage] Failed to clear data:', error)
    }
  }

  /**
   * Get storage usage statistics
   */
  static getStorageStats(): {
    entriesCount: number
    exitsCount: number
    totalSnapshots: number
    totalClaimedFees: number
  } {
    const entries = this.getAllEntries()
    const exits = this.getAllExits()
    const snapshots = this.getAllSnapshots()
    const claimed = this.getAllClaimedFees()

    let totalSnapshots = 0
    snapshots.forEach((posSnapshots) => {
      totalSnapshots += posSnapshots.length
    })

    let totalClaimedFees = 0
    claimed.forEach((posClaimed) => {
      totalClaimedFees += posClaimed.length
    })

    return {
      entriesCount: entries.size,
      exitsCount: exits.size,
      totalSnapshots,
      totalClaimedFees,
    }
  }
}
