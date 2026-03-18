// src/components/damm-v2/hooks/useTokenExpiry.ts
'use client'

import { useCallback, useRef } from 'react'

interface UseTokenExpiryOptions {
  expiryMs: number
  onExpire: (tokenMint: string) => void
}

/**
 * Custom hook for managing token expiry timers.
 *
 * Each token gets a timer that removes it after the expiry period.
 * Timers are automatically cleaned up on unmount.
 */
export function useTokenExpiry({ expiryMs, onExpire }: UseTokenExpiryOptions) {
  const timersRef = useRef<Record<string, NodeJS.Timeout>>({})

  const scheduleExpiry = useCallback(
    (tokenMint: string) => {
      // Clear existing timer if present
      if (timersRef.current[tokenMint]) {
        clearTimeout(timersRef.current[tokenMint])
      }

      // Schedule new expiry
      timersRef.current[tokenMint] = setTimeout(() => {
        onExpire(tokenMint)
        delete timersRef.current[tokenMint]
      }, expiryMs)
    },
    [expiryMs, onExpire]
  )

  const clearExpiry = useCallback((tokenMint: string) => {
    if (timersRef.current[tokenMint]) {
      clearTimeout(timersRef.current[tokenMint])
      delete timersRef.current[tokenMint]
    }
  }, [])

  const clearAllTimers = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout)
    timersRef.current = {}
  }, [])

  return {
    scheduleExpiry,
    clearExpiry,
    clearAllTimers,
  }
}
