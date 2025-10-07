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

const EXPIRY_MS = 5 * 60 * 1000 // Extended to 5 minutes for debugging

export default function DammV2Feature() {
  const [tokens, setTokens] = useState<Record<string, TokenData>>({})
  const [newToken, setNewToken] = useState<TokenData | null>(null)
  const [isPopupOpen, setPopupOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [debugInfo, setDebugInfo] = useState<{
    totalMessages: number
    newEntries: number
    lastMessage: string
  }>({
    totalMessages: 0,
    newEntries: 0,
    lastMessage: 'None'
  })

  const expiryTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // Ensure component is mounted before using browser APIs
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Debug: Monitor popup state changes
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Popup state changed:', { 
        isPopupOpen, 
        newTokenMint: newToken?.mint,
        newTokenIsNewEntry: newToken?.is_new_entry 
      })
    }
  }, [isPopupOpen, newToken])

  const addOrUpdateToken = (data: TokenData) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('➕ Adding/updating token:', {
        mint: data.mint.slice(0, 8) + '...',
        is_new_entry: data.is_new_entry,
        delta_jup: data.delta_jup,
        timestamp: new Date(data.timestamp).toISOString()
      })
    }

    setTokens((prevTokens) => {
      const isExisting = prevTokens[data.mint]
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Token exists in state:', !!isExisting)
      }
      return {
        ...prevTokens,
        [data.mint]: data,
      }
    })

    // Reset expiry timer for this token
    if (expiryTimers.current[data.mint]) {
      clearTimeout(expiryTimers.current[data.mint])
    }

    expiryTimers.current[data.mint] = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏰ Token expired:', data.mint.slice(0, 8) + '...')
      }
      setTokens((prevTokens) => {
        const updated = { ...prevTokens }
        delete updated[data.mint]
        return updated
      })
      delete expiryTimers.current[data.mint]
    }, EXPIRY_MS)
  }

  // Test function for manual popup testing
  const testPopup = () => {
    const testToken: TokenData = {
      mint: 'TEST123456789ABCDEF',
      delta_other: 100,
      delta_jup: 50,
      total: 200,
      total_jupiter: 150,
      jupiter_pct: 75,
      is_new_entry: true,
      total_trade_size: 1000000000,
      delta_total_trade_size: 500000000,
      delta_jupiter_trade_size: 300000000,
      jupiter_trade_size: 800000000,
      tge_at: Date.now() - 60000,
      timestamp: Date.now()
    }
    
    console.log('🧪 Testing popup with test token:', testToken)
    setNewToken(testToken)
    setPopupOpen(true)
  }

  // Force popup for next new token (debugging helper)
  const forceNextPopup = () => {
    const nextToken = Object.values(tokens)[0]
    if (nextToken) {
      console.log('🔧 Forcing popup for existing token:', nextToken.mint.slice(0, 8) + '...')
      setNewToken(nextToken)
      setPopupOpen(true)
    } else {
      console.log('⚠️ No tokens available to test with')
    }
  }

  useEffect(() => {
    // Only run WebSocket code on client-side after mounting
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

        console.log('🔌 Connecting to WebSocket...')
        ws = new WebSocket('wss://comet.lyt.wtf/ws')

        ws.onopen = () => {
          console.log('✅ WebSocket connected')
          setWsConnected(true)
          reconnectAttempts = 0
        }

        ws.onmessage = (event) => {
          try {
            // Enhanced logging for debugging
            if (process.env.NODE_ENV === 'development') {
              console.log('📨 Raw WebSocket message received:', event.data.slice(0, 200) + '...')
            }

            const data: TokenData = JSON.parse(event.data)
            
            // Update debug info
            setDebugInfo(prev => ({
              totalMessages: prev.totalMessages + 1,
              newEntries: prev.newEntries + (data.is_new_entry ? 1 : 0),
              lastMessage: new Date().toLocaleTimeString()
            }))

            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Parsed token data:', {
                mint: data.mint.slice(0, 8) + '...',
                is_new_entry: data.is_new_entry,
                delta_jup: data.delta_jup,
                delta_other: data.delta_other,
                total: data.total,
                jupiter_pct: data.jupiter_pct.toFixed(2) + '%',
                timestamp: new Date(data.timestamp).toISOString()
              })
            }
            
            // Always add/update the token first
            addOrUpdateToken(data)

            // Check for new entry and trigger popup
            if (data.is_new_entry === true) {
              console.log('🚨 NEW TOKEN DETECTED!', {
                mint: data.mint.slice(0, 8) + '...',
                delta_jup: data.delta_jup,
                total_trades: data.total + data.total_jupiter
              })
              
              // Use setTimeout to ensure state updates don't conflict
              setTimeout(() => {
                console.log('🚨 Setting popup state for new token...')
                setNewToken(data)
                setPopupOpen(true)
                console.log('✅ Popup state should now be true')
              }, 0)
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.log('ℹ️ Token update (not new entry):', data.mint.slice(0, 8) + '...')
              }
            }
          } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error)
            console.error('📄 Raw message that failed:', event.data)
          }
        }

        ws.onclose = (event) => {
          console.log('🔌 WebSocket disconnected:', event.code, event.reason)
          setWsConnected(false)
          
          if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            scheduleReconnect()
          } else if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached')
          }
        }

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error)
          setWsConnected(false)
        }

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error)
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
      
      console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`)
      
      reconnectTimeout = setTimeout(() => {
        connectWebSocket()
      }, delay)
    }

    // Initial connection
    connectWebSocket()

    // Cleanup function
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

  // Enhanced popup close handler with logging
  const handlePopupClose = (open: boolean) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Popup close triggered:', open)
    }
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
          
          {/* Debug Info */}
          {process.env.NODE_ENV === 'development' && isMounted && (
            <div className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
              Msgs: {debugInfo.totalMessages} | New: {debugInfo.newEntries} | Last: {debugInfo.lastMessage}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Debug Buttons - Only in development */}
          {process.env.NODE_ENV === 'development' && (
            <>
              <Button variant="outline" size="sm" onClick={testPopup}>
                Test Popup
              </Button>
              <Button variant="outline" size="sm" onClick={forceNextPopup}>
                Force Popup
              </Button>
            </>
          )}
          <Button className="px-6 py-3 text-lg" onClick={handleNewDAMMv2Pool}>
            New Pool
          </Button>
        </div>
      </div>

      {/* Debug Panel - Development Only */}
      {process.env.NODE_ENV === 'development' && isMounted && (
        <div className="lg:px-[70px] px-4 mx-auto mb-4">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
            <h3 className="text-sm font-bold text-white mb-2">Debug Panel</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-300">
              <div>
                <strong>WebSocket:</strong> {wsConnected ? '✅ Connected' : '❌ Disconnected'}
              </div>
              <div>
                <strong>Popup State:</strong> {isPopupOpen ? '✅ Open' : '❌ Closed'}
              </div>
              <div>
                <strong>Current Token:</strong> {newToken ? newToken.mint.slice(0, 8) + '...' : 'None'}
              </div>
              <div>
                <strong>Total Messages:</strong> {debugInfo.totalMessages}
              </div>
              <div>
                <strong>New Entries:</strong> {debugInfo.newEntries}
              </div>
              <div>
                <strong>Active Tokens:</strong> {tokenArray.length}
              </div>
            </div>
          </div>
        </div>
      )}

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