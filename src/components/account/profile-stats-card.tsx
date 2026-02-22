'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  useGetDammV2AggregatedStats,
  useGetDammV2PnLChartData,
  useDammV2PositionSnapshotRecorder,
} from '../damm-v2/damm-v2-pnl-data-access'
import { DammV2PnLChart } from '../damm-v2/damm-v2-pnl-chart-ui'
import { useAutoBackfillPositionEntries } from '../damm-v2/damm-v2-auto-backfill'
import { useDammV2HistoricalTracker } from '../damm-v2/damm-v2-historical-tracker'

export function ProfileStatsCard() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1H' | '1D' | '1W' | '1M' | '1Y' | 'MAX'>('1D')
  const { publicKey } = useWallet()

  // Fetch real stats from DAMM v2 positions
  const statsQuery = useGetDammV2AggregatedStats(publicKey)
  const chartDataQuery = useGetDammV2PnLChartData(publicKey, selectedTimeframe)

  // Enable background snapshot recording
  useDammV2PositionSnapshotRecorder(publicKey)

  // Auto-create missing entry records for existing positions (runs once)
  useAutoBackfillPositionEntries()

  // Historical scanner: Find closed positions from transaction history
  const historicalScan = useDammV2HistoricalTracker()

  useEffect(() => {
    if (historicalScan.isScanning) {
      console.log('[Profile] Scanning transaction history for closed DAMM v2 positions...')
    } else if (historicalScan.lastScanTime) {
      console.log(`[Profile] Historical scan complete: ${historicalScan.positionsFound} closed positions found`)
      if (historicalScan.errors.length > 0) {
        console.warn('[Profile] Historical scan encountered errors:', historicalScan.errors)
      }
    }
  }, [historicalScan.isScanning, historicalScan.lastScanTime, historicalScan.positionsFound, historicalScan.errors])

  const stats = statsQuery.data || {
    totalNetWorth: 0,
    totalProfit: 0,
    totalInvested: 0,
    feeEarned: 0,
    openPositionsCount: 0,
    avgPositionSize: 0,
    totalProfitPercentage: 0,
  }

  const formatUSD = (amount: number) => {
    if (amount === 0) return '$0'
    if (Math.abs(amount) >= 1000) {
      return `$${(amount / 1000).toFixed(2)}k`
    }
    return `$${amount.toFixed(2)}`
  }

  const formatPercentage = (rate: number) => {
    if (rate === 0) return '0%'
    return `${rate.toFixed(2)}%`
  }

  const profitPercentage = stats.totalProfitPercentage

  return (
    <div className="gradient-card px-4 sm:px-6 lg:px-[70px] rounded-2xl space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold font-sans tracking-wide">PROFILE</h2>
      </div>

      {/* Stats row — 6 items in one line on md+, 2-col grid on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-5">
        {/* Total Net Worth */}
        <div>
          <p className="text-xs text-sub-text font-sans mb-1 whitespace-nowrap">Total Net Worth</p>
          <p className="text-xl font-bold text-white font-serif">{formatUSD(stats.totalNetWorth)}</p>
        </div>

        {/* Total P&L */}
        <div>
          <p className="text-xs text-sub-text font-sans mb-1 whitespace-nowrap">Total P&L</p>
          <p className={`text-xl font-bold font-serif ${stats.totalProfit > 0 ? 'text-tertiary' : stats.totalProfit < 0 ? 'text-destructive' : 'text-white'}`}>
            {stats.totalProfit > 0 ? '+' : stats.totalProfit < 0 ? '-' : ''}
            {formatUSD(Math.abs(stats.totalProfit))}
          </p>
          <p className={`text-xs font-serif ${profitPercentage > 0 ? 'text-tertiary' : profitPercentage < 0 ? 'text-destructive' : 'text-sub-text'}`}>
            {profitPercentage > 0 ? '+' : ''}{formatPercentage(profitPercentage)}
          </p>
        </div>

        {/* Open Positions */}
        <div>
          <p className="text-xs text-sub-text font-sans mb-1 whitespace-nowrap">Open Positions</p>
          <p className="text-xl font-bold text-tertiary font-serif">{stats.openPositionsCount}</p>
        </div>

        {/* Total Invested */}
        <div>
          <p className="text-xs text-sub-text font-sans mb-1 whitespace-nowrap">Total Invested</p>
          <p className="text-xl font-bold font-serif">{formatUSD(stats.totalInvested)}</p>
        </div>

        {/* Avg Position Size */}
        <div>
          <p className="text-xs text-sub-text font-sans mb-1 whitespace-nowrap">Avg Position</p>
          <p className="text-xl font-bold text-tertiary font-serif">{formatUSD(stats.avgPositionSize)}</p>
        </div>

        {/* Fee Earned */}
        <div>
          <p className="text-xs text-sub-text font-sans mb-1 whitespace-nowrap">Fee Earned</p>
          <p className="text-xl font-bold text-white font-serif">{formatUSD(stats.feeEarned)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full">
        <DammV2PnLChart
          data={chartDataQuery.data || []}
          timeframe={selectedTimeframe}
          onTimeframeChange={setSelectedTimeframe}
          isLoading={chartDataQuery.isLoading}
        />
      </div>
    </div>
  )
}
