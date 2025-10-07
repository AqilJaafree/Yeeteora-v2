'use client'

import { useEffect, useRef, useState } from 'react'
import { AppHero } from '@/components/app-hero'
import { NewTokenPopup } from './damm-v2-new-token-popup'
import { Button } from '../ui/button'
import { TokenCard } from './damm-v2-token-card'

export interface TokenData {
  mint: string
  delta_other: number
  delta_jup: number
  total: number
  total_jupiter: number
  jupiter_pct: number
  is_new_entry: boolean
  total_trade_size: number
  delta_total_trade_size: number
  delta_jupiter_trade_size: number
  jupiter_trade_size: number
  tge_at: number
  timestamp: number
}

const EXPIRY_MS = 5 * 60 * 1000

// Get WebSocket URL from environment variable or use default
const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://comet.lyt.wtf/ws'

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

        ws = new WebSocket(WEBSOCKET_URL)

        ws.onopen = () => {
          setWsConnected(true)
          reconnectAttempts = 0
        }

        ws.onmessage = (event) => {
          try {
            const data: TokenData = JSON.parse(event.data)
            
            addOrUpdateToken(data)

            if (data.is_new_entry === true) {
              setTimeout(() => {
                setNewToken(data)
                setPopupOpen(true)
              }, 0)
            }
          } catch {
            // Silently handle parsing errors
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

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.close(1000, 'Component unmounting')
      }
      const currentTimers = expiryTimers.current
      Object.values(currentTimers).forEach(clearTimeout)
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

  const tokenArray = isMounted ? Object.values(tokens) : []

  return (
    <div className="min-h-screen">
      <AppHero title="Alpha call Damm v2" subtitle="Next-generation Dynamic Automated Market Making strategies" />
      
      <div className="lg:px-[70px] px-4 mx-auto flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isMounted && (
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            )}
            <span className="text-sm text-muted-foreground">
              {!isMounted ? 'Connecting...' : wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button className="px-6 py-3 text-lg" onClick={handleNewDAMMv2Pool}>
            New Pool
          </Button>
        </div>
      </div>

      <div className="lg:px-[70px] px-4 mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {tokenArray.map((token) => (
          <TokenCard key={token.mint} token={token} />
        ))}
        {!isMounted && (
          <div className="col-span-full text-center py-8">
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