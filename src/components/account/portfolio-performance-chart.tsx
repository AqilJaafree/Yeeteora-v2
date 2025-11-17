// src/components/account/portfolio-performance-chart.tsx
'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui/card'

interface PerformanceDataPoint {
  timestamp: number
  date: string
  dlmmValue: number
  dammV2Value: number
  totalValue: number
}

interface PortfolioPerformanceChartProps {
  dlmmTotalValue: number
  dammV2TotalValue: number
}

export function PortfolioPerformanceChart({ dlmmTotalValue, dammV2TotalValue }: PortfolioPerformanceChartProps) {
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([])
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    // Load existing performance data from localStorage
    const loadPerformanceData = () => {
      try {
        const stored = localStorage.getItem('portfolio-performance')
        if (stored) {
          const parsed = JSON.parse(stored) as PerformanceDataPoint[]
          return parsed
        }
      } catch (error) {
        console.error('Error loading performance data:', error)
      }
      return []
    }

    const existingData = loadPerformanceData()
    const now = Date.now()
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    // Check if we already have a data point for today
    const lastDataPoint = existingData[existingData.length - 1]
    const isToday = lastDataPoint && new Date(lastDataPoint.timestamp).toDateString() === new Date().toDateString()

    if (isToday) {
      // Update today's values
      const updatedData = existingData.map((point, index) => {
        if (index === existingData.length - 1) {
          return {
            ...point,
            dlmmValue: dlmmTotalValue,
            dammV2Value: dammV2TotalValue,
            totalValue: dlmmTotalValue + dammV2TotalValue,
          }
        }
        return point
      })
      setPerformanceData(updatedData)
      localStorage.setItem('portfolio-performance', JSON.stringify(updatedData))
    } else {
      // Add new data point
      const newDataPoint: PerformanceDataPoint = {
        timestamp: now,
        date: today,
        dlmmValue: dlmmTotalValue,
        dammV2Value: dammV2TotalValue,
        totalValue: dlmmTotalValue + dammV2TotalValue,
      }

      const updatedData = [...existingData, newDataPoint].slice(-30) // Keep last 30 days
      setPerformanceData(updatedData)
      localStorage.setItem('portfolio-performance', JSON.stringify(updatedData))
    }
  }, [dlmmTotalValue, dammV2TotalValue, isMounted])

  if (!isMounted) {
    return null
  }

  // If no data yet, show a placeholder
  if (performanceData.length === 0) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50">
        <h2 className="text-xl font-bold text-white mb-4 font-serif">Portfolio Performance</h2>
        <div className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Performance data will appear as you use the platform</p>
        </div>
      </Card>
    )
  }

  // Calculate performance metrics
  const firstPoint = performanceData[0]
  const lastPoint = performanceData[performanceData.length - 1]
  const totalChange = lastPoint.totalValue - firstPoint.totalValue
  const totalChangePercent = firstPoint.totalValue > 0 ? (totalChange / firstPoint.totalValue) * 100 : 0

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-white mb-2">
            {performanceData.find(d => d.dlmmValue === payload[0]?.value || d.dammV2Value === payload[0]?.value)?.date}
          </p>
          {payload.map((entry) => (
            <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey === 'dlmmValue' ? 'DLMM' : entry.dataKey === 'dammV2Value' ? 'DAMM v2' : 'Total'}:{' '}
              ${entry.value.toFixed(2)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white font-serif">Portfolio Performance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Last {performanceData.length} {performanceData.length === 1 ? 'day' : 'days'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white font-serif">
            ${lastPoint.totalValue.toFixed(2)}
          </p>
          <p className={`text-sm font-medium ${totalChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)} ({totalChangePercent >= 0 ? '+' : ''}{totalChangePercent.toFixed(2)}%)
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={performanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            style={{ fontSize: '12px', fontFamily: 'serif' }}
          />
          <YAxis
            stroke="#9CA3AF"
            style={{ fontSize: '12px', fontFamily: 'serif' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '14px', fontFamily: 'serif' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="dlmmValue"
            stroke="#60A5FA"
            strokeWidth={2}
            name="DLMM"
            dot={{ fill: '#60A5FA', r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="dammV2Value"
            stroke="#EC4899"
            strokeWidth={2}
            name="DAMM v2"
            dot={{ fill: '#EC4899', r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="totalValue"
            stroke="#10B981"
            strokeWidth={2}
            name="Total"
            dot={{ fill: '#10B981', r: 3 }}
            activeDot={{ r: 5 }}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend explanation */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#60A5FA]"></div>
          <span>DLMM Positions</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#EC4899]"></div>
          <span>DAMM v2 Positions</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#10B981]" style={{ backgroundImage: 'repeating-linear-gradient(to right, #10B981 0, #10B981 5px, transparent 5px, transparent 10px)' }}></div>
          <span>Total Portfolio</span>
        </div>
      </div>
    </Card>
  )
}
