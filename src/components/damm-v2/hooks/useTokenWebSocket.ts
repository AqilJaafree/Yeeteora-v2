// src/components/damm-v2/hooks/useTokenWebSocket.ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { TokenData, isValidTokenData } from '@/lib/validators'

interface UseTokenWebSocketOptions {
  url: string
  onTokenUpdate: (token: TokenData) => void
  onNewToken?: (token: TokenData) => void
  enabled?: boolean
}

interface WebSocketConfig {
  maxReconnectAttempts: number
  baseReconnectDelay: number
  maxReconnectDelay: number
}

const DEFAULT_CONFIG: WebSocketConfig = {
  maxReconnectAttempts: 10,
  baseReconnectDelay: 1000,
  maxReconnectDelay: 30000,
}

/**
 * Custom hook for managing WebSocket connection to token feed.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Data validation before processing
 * - Proper cleanup on unmount
 * - Connection state tracking
 */
export function useTokenWebSocket({
  url,
  onTokenUpdate,
  onNewToken,
  enabled = true,
}: UseTokenWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)

  useEffect(() => {
    if (!enabled || !url || typeof window === 'undefined') {
      return
    }

    const connect = () => {
      // Prevent duplicate connections
      if (wsRef.current?.readyState === WebSocket.CONNECTING ||
          wsRef.current?.readyState === WebSocket.OPEN) {
        return
      }

      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          setIsConnected(true)
          reconnectAttemptsRef.current = 0
        }

        ws.onmessage = (event) => {
          try {
            const parsedData = JSON.parse(event.data)

            // SECURITY: Validate external data
            if (!isValidTokenData(parsedData)) {
              console.error('[WebSocket] Invalid token data received')
              return
            }

            const tokenData: TokenData = parsedData
            onTokenUpdate(tokenData)

            if (tokenData.is_new_entry && onNewToken) {
              // Defer to avoid state updates during render
              setTimeout(() => onNewToken(tokenData), 0)
            }
          } catch (error) {
            console.error('[WebSocket] Message parsing failed:', error)
          }
        }

        ws.onclose = (event) => {
          setIsConnected(false)

          // Reconnect on abnormal closure
          if (event.code !== 1000 &&
              reconnectAttemptsRef.current < DEFAULT_CONFIG.maxReconnectAttempts) {
            scheduleReconnect()
          }
        }

        ws.onerror = () => {
          setIsConnected(false)
        }

      } catch (error) {
        console.error('[WebSocket] Connection failed:', error)
        setIsConnected(false)
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      reconnectAttemptsRef.current++

      const delay = Math.min(
        DEFAULT_CONFIG.baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1),
        DEFAULT_CONFIG.maxReconnectDelay
      )

      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting')
      }
    }
  }, [url, enabled, onTokenUpdate, onNewToken])

  return { isConnected }
}
