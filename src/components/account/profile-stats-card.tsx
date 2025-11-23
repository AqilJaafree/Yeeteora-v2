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
    <div className="gradient-card lg:px-[70px] px-4 rounded-2xl space-y-6">
      <div>
        <h2 className="text-3xl md:text-5xl font-bold font-sans tracking-wide">PROFILE</h2>
      </div>

      <div className="flex lg:flex-row flex-col justify-between">
        <div className='grid grid-cols-2 gap-8 flex-1'>
          {/* Left Stats Column */}
          <div className="space-y-6">
            {/* Total Net Worth */}
            <div>
              <p className="text-sm text-sub-text font-sans mb-1">Total Net Worth</p>
              <p className="text-2xl font-bold text-white font-sans">{formatUSD(stats.totalNetWorth)}</p>
            </div>

            {/* Open Positions */}
            <div>
              <p className="text-sm text-sub-text font-sans mb-1">Open Positions</p>
              <p className="text-base font-bold text-tertiary font-sans">{stats.openPositionsCount}</p>
            </div>

            {/* Avg Position Size */}
            <div>
              <p className="text-sm text-sub-text font-sans mb-1">Avg Position Size</p>
              <p className="text-base font-bold text-tertiary font-sans">{formatUSD(stats.avgPositionSize)}</p>
            </div>
          </div>

          {/* Middle Stats Column */}
          <div className="space-y-6">
            {/* Total P&L */}
            <div>
              <p className="text-sm text-sub-text font-sans mb-1">Total P&L</p>
              <p
                className={`text-2xl font-bold font-sans ${stats.totalProfit >= 0 ? 'text-tertiary' : 'text-destructive'}`}
              >
                {stats.totalProfit >= 0 ? '+' : '-'}
                {formatUSD(Math.abs(stats.totalProfit))}
              </p>
              <p className={`text-xs ${profitPercentage >= 0 ? 'text-tertiary' : 'text-destructive'}`}>
                {profitPercentage >= 0 ? '+' : ''}{formatPercentage(profitPercentage)}
              </p>
            </div>

            {/* Total Invested */}
            <div>
              <p className="text-sm text-sub-text font-sans mb-1">Total Invested</p>
              <p className="text-base font-bold font-sans">{formatUSD(stats.totalInvested)}</p>
            </div>

            {/* Fee Earned */}
            <div>
              <p className="text-sm text-sub-text font-sans mb-1">Fee Earned</p>
              <p className="text-base font-bold text-white font-sans">{formatUSD(stats.feeEarned)}</p>
            </div>
          </div>
        </div>

        {/* Right Chart Column */}
        <div className="flex-1 lg:mt-0 mt-10 w-full lg:w-auto">
          <DammV2PnLChart
            data={chartDataQuery.data || []}
            timeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            isLoading={chartDataQuery.isLoading}
          />
        </div>
      </div>
    </div>
  )
}
