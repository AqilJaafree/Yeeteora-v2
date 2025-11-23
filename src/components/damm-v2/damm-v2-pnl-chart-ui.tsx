'use client'

// DAMM v2 P&L Chart UI Component
// Displays profit/loss over time with fees earned

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import DOMPurify from 'dompurify'
import type { AggregatedPnLDataPoint } from './damm-v2-pnl-types'

/**
 * Sanitize text content to prevent XSS attacks
 * SECURITY: Remove all HTML tags and dangerous characters
 */
function sanitizeText(text: string | undefined): string {
  if (!text) return ''

  // Remove HTML tags and dangerous characters
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
}

/**
 * Sanitize number for display
 * SECURITY: Ensure numbers are finite and safe
 */
function sanitizeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value > 1e15 || value < -1e15) return 0
  return value
}

interface DammV2PnLChartProps {
  data: AggregatedPnLDataPoint[]
  timeframe: '1H' | '1D' | '1W' | '1M' | '1Y' | 'MAX'
  onTimeframeChange: (timeframe: '1H' | '1D' | '1W' | '1M' | '1Y' | 'MAX') => void
  isLoading?: boolean
}

export function DammV2PnLChart({
  data,
  timeframe,
  onTimeframeChange,
  isLoading = false,
}: DammV2PnLChartProps) {
  // Calculate metrics
  const metrics = useMemo(() => {
    if (data.length === 0) {
      return {
        currentPnL: 0,
        totalChange: 0,
        totalChangePercent: 0,
        isPositive: true,
      }
    }

    const lastPoint = data[data.length - 1]
    const firstPoint = data[0]
    const totalChange = lastPoint.totalPnL - firstPoint.totalPnL
    const totalChangePercent = lastPoint.totalPnLPercentage

    return {
      currentPnL: lastPoint.totalPnL,
      totalChange,
      totalChangePercent,
      isPositive: lastPoint.totalPnL >= 0,
    }
  }, [data])

  // Custom tooltip component
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ value: number; dataKey: string; color: string }>
  }) => {
    if (active && payload && payload.length) {
      const dataPoint = data.find((d) => d.totalPnL === payload[0]?.value)

      // SECURITY: Sanitize all displayed text and numbers
      const safeDate = sanitizeText(dataPoint?.date)

      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-white mb-2">{safeDate}</p>
          {payload.map((entry) => {
            // SECURITY: Sanitize data key labels and values
            const safeDataKey = sanitizeText(entry.dataKey)
            const safeValue = sanitizeNumber(entry.value)

            const label =
              safeDataKey === 'totalPnL'
                ? 'Total P&L'
                : safeDataKey === 'totalFeesEarned'
                  ? 'Fees Earned'
                  : safeDataKey

            const formattedValue =
              safeDataKey === 'totalPnLPercentage'
                ? `${safeValue.toFixed(2)}%`
                : `$${safeValue.toFixed(2)}`

            return (
              <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
                {label}: {formattedValue}
              </p>
            )
          })}
        </div>
      )
    }
    return null
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl p-4 h-full border border-border/30">
        <div className="w-full flex items-center justify-center mb-4" style={{ height: '192px' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl p-4 h-full border border-border/30">
        <div className="w-full flex items-center justify-center mb-4" style={{ height: '192px' }}>
          <p className="text-xs text-muted-foreground">No data</p>
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          {(['1H', '1D', '1W', '1M', '1Y', 'MAX'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1 text-xs font-medium rounded transition-all duration-200 ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'text-sub-text hover:text-primary hover:bg-primary/10'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl p-4 h-full border border-border/30">
      {/* Chart - Fixed height container ensures ResponsiveContainer can calculate dimensions */}
      <div className="w-full mb-4" style={{ minHeight: '192px', height: '192px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={metrics.isPositive ? '#10B981' : '#EF4444'}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={metrics.isPositive ? '#10B981' : '#EF4444'}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis
              dataKey="date"
              stroke="#9CA3AF"
              style={{ fontSize: '10px' }}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              tickFormatter={(value) => {
                // Keep labels short for better readability
                if (timeframe === '1H' || timeframe === '1D') {
                  // For hourly/daily, remove AM/PM and just show time
                  return value.replace(/\s?(AM|PM)/i, '')
                }
                // For other timeframes, return as-is (already formatted well)
                return value
              }}
            />
            <YAxis
              stroke="#9CA3AF"
              style={{ fontSize: '10px' }}
              tickFormatter={(value) => {
                if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
                if (value <= -1000) return `-$${(Math.abs(value) / 1000).toFixed(1)}k`
                return `$${value.toFixed(0)}`
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="totalPnL"
              stroke={metrics.isPositive ? '#10B981' : '#EF4444'}
              strokeWidth={2}
              fill="url(#colorPnL)"
              name="Total P&L"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Timeframe Selector */}
      <div className="flex gap-2 justify-center flex-wrap">
        {(['1H', '1D', '1W', '1M', '1Y', 'MAX'] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            className={`px-3 py-1 text-xs font-medium rounded transition-all duration-200 ${
              timeframe === tf
                ? 'bg-blue-600 text-white'
                : 'text-sub-text hover:text-primary hover:bg-primary/10'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  )
}
