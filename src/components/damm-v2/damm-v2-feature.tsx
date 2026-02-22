// src/components/damm-v2/damm-v2-feature.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { AppHero } from '@/components/app-hero'
import { NewTokenPopup } from './damm-v2-new-token-popup'
import { Button } from '../ui/button'
import { TokenCard } from './damm-v2-token-card'
import { TokenData, isValidTokenData } from '@/lib/validators'

export type { TokenData }

const EXPIRY_MS = 5 * 60 * 1000

/** Generates mock TokenData for UI preview when no live WebSocket data is present */
function getMockTokens(): TokenData[] {
  const now = Math.floor(Date.now() / 1000)
  return [
    {
      // BONK – high Jupiter activity → red card
      mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      delta_jup: 28,
      delta_other: 210,
      total: 1840,
      total_jupiter: 420,
      jupiter_pct: 22.83,
      is_new_entry: false,
      total_trade_size: 6_400_000_000,
      delta_total_trade_size: 1_200_000_000,
      delta_jupiter_trade_size: 600_000_000,
      jupiter_trade_size: 1_800_000_000,
      tge_at: now - 300,
      timestamp: now,
    },
    {
      // WIF – medium Jupiter activity → yellow card
      mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      delta_jup: 14,
      delta_other: 95,
      total: 970,
      total_jupiter: 210,
      jupiter_pct: 21.65,
      is_new_entry: false,
      total_trade_size: 3_100_000_000,
      delta_total_trade_size: 800_000_000,
      delta_jupiter_trade_size: 320_000_000,
      jupiter_trade_size: 900_000_000,
      tge_at: now - 720,
      timestamp: now,
    },
    {
      // POPCAT – normal activity → default card
      mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
      delta_jup: 6,
      delta_other: 38,
      total: 510,
      total_jupiter: 95,
      jupiter_pct: 18.63,
      is_new_entry: false,
      total_trade_size: 1_600_000_000,
      delta_total_trade_size: 350_000_000,
      delta_jupiter_trade_size: 120_000_000,
      jupiter_trade_size: 400_000_000,
      tge_at: now - 1800,
      timestamp: now,
    },
    {
      // Wrapped SOL – low activity → default card
      mint: 'So11111111111111111111111111111111111111112',
      delta_jup: 2,
      delta_other: 15,
      total: 230,
      total_jupiter: 44,
      jupiter_pct: 19.13,
      is_new_entry: false,
      total_trade_size: 750_000_000,
      delta_total_trade_size: 180_000_000,
      delta_jupiter_trade_size: 55_000_000,
      jupiter_trade_size: 200_000_000,
      tge_at: now - 3600,
      timestamp: now,
    },
  ]
}

// Get WebSocket URL from environment variable with secure fallback
const getWebSocketURL = () => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WEBSOCKET_URL) {
    return process.env.NEXT_PUBLIC_WEBSOCKET_URL
  }
  // Fallback - should be set in environment variables
  return process.env.NEXT_PUBLIC_WEBSOCKET_URL || ''
}

export default function DammV2Feature() {
  const [tokens, setTokens] = useState<Record<string, TokenData>>({})
  const [newToken, setNewToken] = useState<TokenData | null>(null)
  const [isPopupOpen, setPopupOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)

  const expiryTimers = useRef<Record<string, NodeJS.Timeout>>({})

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const addOrUpdateToken = (data: TokenData) => {
    setTokens((prevTokens) => ({
      ...prevTokens,
      [data.mint]: data,
    }))

    if (expiryTimers.current[data.mint]) {
      clearTimeout(expiryTimers.current[data.mint])
    }

    expiryTimers.current[data.mint] = setTimeout(() => {
      setTokens((prevTokens) => {
        const updated = { ...prevTokens }
        delete updated[data.mint]
        return updated
      })
      delete expiryTimers.current[data.mint]
    }, EXPIRY_MS)
  }

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') {
      return
    }

    const wsUrl = getWebSocketURL()
    if (!wsUrl) {
      return
    }

    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 10
    const baseReconnectDelay = 1000

    const connectWebSocket = () => {
      try {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
          return
        }

        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          setWsConnected(true)
          reconnectAttempts = 0
        }

        ws.onmessage = (event) => {
          try {
            const parsedData = JSON.parse(event.data)

            // SECURITY: Validate all external WebSocket data
            if (!isValidTokenData(parsedData)) {
              console.error('[WebSocket] Received invalid token data, rejecting')
              return
            }

            // Type-safe after validation
            const data: TokenData = parsedData

            addOrUpdateToken(data)

            if (data.is_new_entry === true) {
              setTimeout(() => {
                setNewToken(data)
                setPopupOpen(true)
              }, 0)
            }
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error)
          }
        }

        ws.onclose = (event) => {
          setWsConnected(false)

          if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            scheduleReconnect()
          }
        }

        ws.onerror = () => {
          setWsConnected(false)
        }

      } catch {
        setWsConnected(false)
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }

      reconnectAttempts++
      const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts - 1), 30000)

      reconnectTimeout = setTimeout(() => {
        connectWebSocket()
      }, delay)
    }

    connectWebSocket()

    // Capture the current timers for cleanup
    const timersToClean = expiryTimers

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.close(1000, 'Component unmounting')
      }
      // Clear all expiry timers on unmount
      Object.values(timersToClean.current).forEach(clearTimeout)
    }
  }, [isMounted])

  const handleNewDAMMv2Pool = () => {
    if (typeof window !== 'undefined') {
      window.open('https://www.meteora.ag/pools/create', '_blank')
    }
  }

  const handlePopupClose = (open: boolean) => {
    setPopupOpen(open)
    if (!open) {
      setNewToken(null)
    }
  }

  const liveTokenArray = isMounted ? Object.values(tokens) : []
  const mockTokens = getMockTokens()
  const showMockData = isMounted && liveTokenArray.length === 0

  return (
    <div className="min-h-screen">
      <AppHero title="Alpha call Damm v2" subtitle="Next-generation Dynamic Automated Market Making strategies" />

      <div className="px-4 sm:px-6 lg:px-[70px] mx-auto flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isMounted && (
              <div className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            )}
            <span className="text-xs sm:text-sm text-muted-foreground">
              {!isMounted ? 'Connecting...' : wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {showMockData && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 whitespace-nowrap">
              Demo Data
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button className="px-3 py-1.5 text-sm sm:px-6 sm:py-3 sm:text-base" onClick={handleNewDAMMv2Pool}>
            New Pool
          </Button>
        </div>
      </div>

      <div className="px-3 sm:px-4 lg:px-[70px] mx-auto flex flex-col gap-2 pb-6">
        {liveTokenArray.map((token) => (
          <TokenCard key={token.mint} token={token} />
        ))}
        {showMockData && mockTokens.map((token) => (
          <TokenCard key={token.mint} token={token} />
        ))}
        {!isMounted && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading real-time data...</p>
          </div>
        )}
      </div>
      
      {isMounted && (
        <NewTokenPopup 
          token={newToken} 
          open={isPopupOpen} 
          onOpenChange={handlePopupClose} 
        />
      )}
    </div>
  )
}