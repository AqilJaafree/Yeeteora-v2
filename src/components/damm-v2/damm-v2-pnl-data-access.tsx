'use client'

// Custom hooks for fetching and managing P&L data
// Uses React Query for caching and automatic refetching

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect } from 'react'
import { DammV2PositionStorage } from './damm-v2-storage'
import {
  calculatePositionPnL,
  generateAggregatedPnLTimeSeries,
  calculateAggregateStats,
  createPositionSnapshot,
} from './damm-v2-pnl-calculations'
import { useGetDammV2Positions } from './damm-v2-data-access'
import { getBatchTokenPricesUSD } from './damm-v2-price-utils'
import type {
  PositionPnLCalculation,
  AggregatedPnLDataPoint,
} from './damm-v2-pnl-types'
import {
  PNL_DATA_CACHE_DURATION_MS,
  SNAPSHOT_INTERVAL_HOURS,
  MAX_RETRIES,
  RETRY_DELAY_MS_BASE,
  MAX_RETRY_DELAY_MS,
} from '@/lib/damm-v2-pnl-constants'

/**
 * Get P&L calculations for all user DAMM v2 positions
 * Returns real-time P&L data with fees included
 */
export function useGetDammV2PositionsPnL(address: PublicKey | null) {
  const positionsQuery = useGetDammV2Positions({
    address: address || new PublicKey('11111111111111111111111111111112'),
  })
  const { connection } = useConnection()

  return useQuery({
    queryKey: [
      'damm-v2-positions-pnl',
      { address: address?.toBase58(), endpoint: connection.rpcEndpoint },
    ],
    queryFn: async (): Promise<PositionPnLCalculation[]> => {
      if (!address) return []

      const positions = positionsQuery.data
      if (!positions || positions.length === 0) return []

      const entries = DammV2PositionStorage.getAllEntries()
      const pnlCalculations: PositionPnLCalculation[] = []

      // Collect all unique token mints for batch price fetch
      const uniqueMints = new Set<string>()
      positions.forEach((p) => {
        uniqueMints.add(p.poolState.tokenAMint.toBase58())
        uniqueMints.add(p.poolState.tokenBMint.toBase58())
      })

      // Fetch all token prices in batch
      const priceMap = await getBatchTokenPricesUSD(Array.from(uniqueMints))

      // Calculate P&L for each position
      for (const position of positions) {
        const entry = entries.get(position.positionPubkey.toBase58())
        if (!entry) {
          continue
        }

        const tokenAPrice = priceMap.get(position.poolState.tokenAMint.toBase58()) || 0
        const tokenBPrice = priceMap.get(position.poolState.tokenBMint.toBase58()) || 0

        const tokenAMeta = { decimals: entry.decimalsA, usdPrice: tokenAPrice }
        const tokenBMeta = { decimals: entry.decimalsB, usdPrice: tokenBPrice }

        const pnl = await calculatePositionPnL(position, entry, tokenAMeta, tokenBMeta)
        pnlCalculations.push(pnl)
      }

      return pnlCalculations
    },
    staleTime: PNL_DATA_CACHE_DURATION_MS,
    retry: MAX_RETRIES,
    retryDelay: (attemptIndex) => Math.min(RETRY_DELAY_MS_BASE * 2 ** attemptIndex, MAX_RETRY_DELAY_MS),
    // Always enabled if address exists - we want to run even with no open positions (for historical data)
    enabled: !!address && positionsQuery.isFetched,
  })
}

/**
 * Get aggregated P&L time-series data for chart
 * Generates historical data points based on timeframe
 */
export function useGetDammV2PnLChartData(
  address: PublicKey | null,
  timeframe: '1H' | '1D' | '1W' | '1M' | '1Y' | 'MAX'
) {
  const pnlQuery = useGetDammV2PositionsPnL(address)
  const { connection } = useConnection()

  return useQuery({
    queryKey: [
      'damm-v2-pnl-chart-data',
      { address: address?.toBase58(), timeframe, endpoint: connection.rpcEndpoint },
    ],
    queryFn: async (): Promise<AggregatedPnLDataPoint[]> => {
      const positionPnLs = pnlQuery.data || []
      const snapshots = DammV2PositionStorage.getAllSnapshots()

      // Get closed position exits for historical P&L
      const allExits = DammV2PositionStorage.getAllExits()
      const allEntries = DammV2PositionStorage.getAllEntries()

      const closedPositionExits = new Map<string, {
        exitTimestamp: number
        realizedPnL: number
        totalFeesValueUSD: number
        initialValueUSD: number
      }>()

      allExits.forEach((exit, positionAddress) => {
        const entry = allEntries.get(positionAddress)
        if (entry) {
          closedPositionExits.set(positionAddress, {
            exitTimestamp: exit.exitTimestamp,
            realizedPnL: exit.realizedPnL,
            totalFeesValueUSD: exit.totalFeesValueUSD,
            initialValueUSD: entry.initialValueUSD,
          })
        }
      })

      const chartData = generateAggregatedPnLTimeSeries(
        positionPnLs,
        timeframe,
        snapshots,
        closedPositionExits
      )

      return chartData
    },
    staleTime: PNL_DATA_CACHE_DURATION_MS,
    retry: MAX_RETRIES,
    // Enable for wallets with no open positions (historical data only)
    enabled: !!address && pnlQuery.isFetched,
  })
}

/**
 * Get aggregated stats for profile card
 * Returns total net worth, profit, fees, etc.
 */
export function useGetDammV2AggregatedStats(address: PublicKey | null) {
  const pnlQuery = useGetDammV2PositionsPnL(address)
  const { connection } = useConnection()

  return useQuery({
    queryKey: [
      'damm-v2-aggregated-stats',
      { address: address?.toBase58(), endpoint: connection.rpcEndpoint },
    ],
    queryFn: async () => {
      const positionPnLs = pnlQuery.data || []

      // Get closed position data
      const allExits = DammV2PositionStorage.getAllExits()
      const allEntries = DammV2PositionStorage.getAllEntries()

      // Calculate totals from open positions
      const openStats = calculateAggregateStats(positionPnLs)

      // Add closed positions stats
      let closedRealizedPnL = 0
      let closedFeesEarned = 0
      let closedInvested = 0

      allExits.forEach((exit, positionAddress) => {
        const entry = allEntries.get(positionAddress)
        if (entry) {
          closedRealizedPnL += exit.realizedPnL
          closedFeesEarned += exit.totalFeesValueUSD
          closedInvested += entry.initialValueUSD
        }
      })

      // Combine open and closed positions
      const totalProfit = openStats.totalProfit + closedRealizedPnL
      const totalInvested = openStats.totalInvested + closedInvested
      const totalFees = openStats.feeEarned + closedFeesEarned
      const totalProfitPercentage = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0

      return {
        totalNetWorth: openStats.totalNetWorth, // Only count open positions for net worth
        totalProfit,
        totalInvested,
        feeEarned: totalFees,
        openPositionsCount: openStats.openPositionsCount,
        avgPositionSize: totalInvested > 0 ? totalInvested / (openStats.openPositionsCount + allExits.size) : 0,
        totalProfitPercentage,
      }
    },
    staleTime: PNL_DATA_CACHE_DURATION_MS,
    retry: MAX_RETRIES,
    // Always enabled after pnlQuery fetches (even if no positions)
    enabled: pnlQuery.isFetched,
  })
}

/**
 * Periodic snapshot hook - saves position state every hour
 * Runs in background to build historical data for charts
 */
export function useDammV2PositionSnapshotRecorder(address: PublicKey | null) {
  const pnlQuery = useGetDammV2PositionsPnL(address)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!address || !pnlQuery.data || pnlQuery.data.length === 0) return

    const recordSnapshot = () => {
      pnlQuery.data.forEach((pnl) => {
        const snapshot = createPositionSnapshot(pnl)
        DammV2PositionStorage.saveSnapshot(pnl.positionAddress, snapshot)
      })

      // Invalidate chart data to reflect new snapshot
      queryClient.invalidateQueries({ queryKey: ['damm-v2-pnl-chart-data'] })
    }

    // Record immediately on mount
    recordSnapshot()

    // Set up interval (every hour)
    const intervalMs = SNAPSHOT_INTERVAL_HOURS * 60 * 60 * 1000
    const interval = setInterval(recordSnapshot, intervalMs)

    return () => clearInterval(interval)
  }, [pnlQuery.data, queryClient, address])
}
