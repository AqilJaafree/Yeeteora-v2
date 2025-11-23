'use client'

// Auto-backfill missing position entry records
// Creates estimated entry records for positions that don't have tracking data

import { useEffect, useState, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { DammV2PositionStorage } from './damm-v2-storage'
import { useGetDammV2Positions } from './damm-v2-data-access'
import { getTokenPriceUSD } from './damm-v2-price-utils'
import type { PositionEntryRecord } from './damm-v2-pnl-types'

/**
 * Hook to automatically create missing entry records for existing positions
 * Runs once on mount and creates estimated entries for positions without tracking
 */
export function useAutoBackfillPositionEntries() {
  const { publicKey } = useWallet()
  const positionsQuery = useGetDammV2Positions({ address: publicKey || new PublicKey('11111111111111111111111111111112') })
  const [backfillStatus, setBackfillStatus] = useState<{
    completed: boolean
    created: number
    skipped: number
    lastPositionCount: number
  }>({ completed: false, created: 0, skipped: 0, lastPositionCount: 0 })

  // Prevent duplicate async runs (race condition protection)
  const isRunningRef = useRef(false)

  useEffect(() => {
    // CRITICAL: Use isSuccess instead of checking data directly
    // React Query lifecycle: undefined (loading) -> [] or [data] (success)
    if (!publicKey) {
      console.log('[Auto Backfill] No public key, skipping')
      return
    }

    // Wait for query to finish (success or error)
    if (!positionsQuery.isSuccess) {
      console.log('[Auto Backfill] Waiting for positions query to complete...', {
        isLoading: positionsQuery.isLoading,
        isError: positionsQuery.isError,
        isSuccess: positionsQuery.isSuccess,
      })
      return
    }

    // Now data is guaranteed to be defined (even if empty array)
    const positions = positionsQuery.data || []
    const currentPositionCount = positions.length

    console.log('[Auto Backfill] Effect triggered', {
      positionsCount: currentPositionCount,
      lastPositionCount: backfillStatus.lastPositionCount,
      isCompleted: backfillStatus.completed,
    })

    // Check if already processing
    if (isRunningRef.current) {
      console.log('[Auto Backfill] Already running, skipping duplicate execution')
      return
    }

    // Check if already processed this exact set of positions
    if (backfillStatus.completed && currentPositionCount === backfillStatus.lastPositionCount) {
      console.log('[Auto Backfill] Already completed for current positions, skipping')
      return
    }

    // If position count increased, allow re-run
    if (currentPositionCount > backfillStatus.lastPositionCount) {
      console.log(`[Auto Backfill] Position count changed from ${backfillStatus.lastPositionCount} to ${currentPositionCount}, running backfill...`)
    }

    async function backfillMissingEntries() {
      isRunningRef.current = true
      try {
        // Handle zero positions case - BUT only after query is truly done loading
        // Don't mark as completed if query just returned empty array during loading
        if (positions.length === 0) {
          // Check if this is a stable "no positions" state by waiting a bit
          console.log('[Auto Backfill] No positions in current data, will recheck when data changes')
          // Don't mark as completed - let the effect re-run when real data arrives
          return
        }

        const existingEntries = DammV2PositionStorage.getAllEntries()
        let created = 0
        let skipped = 0

        console.log(`[Auto Backfill] Checking ${positions.length} positions for missing entries...`)
        console.log(`[Auto Backfill] Existing entries: ${existingEntries.size}`)

        for (const position of positions) {
          const positionAddress = position.positionPubkey.toBase58()

          // Skip if entry already exists
          if (existingEntries.has(positionAddress)) {
            skipped++
            continue
          }

          try {
            console.log(`[Auto Backfill] Processing position ${positionAddress.slice(0, 8)}...`)
            console.log(`[Auto Backfill] Token A: ${position.poolState.tokenAMint.toBase58()}`)
            console.log(`[Auto Backfill] Token B: ${position.poolState.tokenBMint.toBase58()}`)

            // Fetch current token prices
            const [tokenAPrice, tokenBPrice] = await Promise.all([
              getTokenPriceUSD(position.poolState.tokenAMint.toBase58()),
              getTokenPriceUSD(position.poolState.tokenBMint.toBase58()),
            ])

            console.log(`[Auto Backfill] Token A price: $${tokenAPrice}`)
            console.log(`[Auto Backfill] Token B price: $${tokenBPrice}`)

            // Get decimals from position data (we need to fetch mint info)
            // For now, assume 9 decimals (most Solana tokens)
            const decimalsA = 9
            const decimalsB = 9

            const tokenAAmountDecimal = position.tokenAAmount.toNumber() / Math.pow(10, decimalsA)
            const tokenBAmountDecimal = position.tokenBAmount.toNumber() / Math.pow(10, decimalsB)

            const initialValueUSD = (tokenAAmountDecimal * tokenAPrice) + (tokenBAmountDecimal * tokenBPrice)
            const entryPoolPrice = tokenAPrice > 0 ? tokenBPrice / tokenAPrice : 0

            // Create estimated entry record
            const entry: PositionEntryRecord = {
              positionAddress,
              poolAddress: position.poolAddress.toBase58(),
              entryTimestamp: Date.now() - (7 * 24 * 60 * 60 * 1000), // Estimate: 1 week ago
              tokenAMint: position.poolState.tokenAMint.toBase58(),
              tokenBMint: position.poolState.tokenBMint.toBase58(),
              initialTokenAAmount: position.tokenAAmount.toString(),
              initialTokenBAmount: position.tokenBAmount.toString(),
              entryTokenAPrice: tokenAPrice * 0.95, // Estimate: 5% lower than current (rough approximation)
              entryTokenBPrice: tokenBPrice * 0.95,
              entryPoolPrice: entryPoolPrice * 0.95,
              initialValueUSD: initialValueUSD * 0.95,
              decimalsA,
              decimalsB,
              transactionSignature: 'auto-backfill',
            }

            DammV2PositionStorage.savePositionEntry(entry)
            created++

            console.log(`[Auto Backfill] Created entry for position ${positionAddress.slice(0, 8)}... (estimated value: $${entry.initialValueUSD.toFixed(2)})`)

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 200))

          } catch (error) {
            console.error(`[Auto Backfill] Failed to create entry for ${positionAddress}:`, error)
            skipped++
          }
        }

        setBackfillStatus({
          completed: true,
          created,
          skipped,
          lastPositionCount: positions.length
        })

        if (created > 0) {
          console.log(`[Auto Backfill] ✅ Created ${created} estimated entries, skipped ${skipped}`)
        } else {
          console.log(`[Auto Backfill] ✅ Completed with ${skipped} existing entries`)
        }
      } finally {
        isRunningRef.current = false
      }
    }

    backfillMissingEntries().catch((error) => {
      console.error('[Auto Backfill] Fatal error during backfill:', error)
      isRunningRef.current = false
    })
  }, [
    publicKey,
    positionsQuery.isSuccess, // Triggers when query completes
    positionsQuery.isLoading, // Used in early return check
    positionsQuery.isError, // Logged in debug output
    positionsQuery.data, // Triggers when data changes
    backfillStatus.completed,
    backfillStatus.lastPositionCount,
  ])

  return backfillStatus
}
