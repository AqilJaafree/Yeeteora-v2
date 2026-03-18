// src/components/damm-v2/hooks/useNotificationMute.ts
'use client'

import { useCallback, useState } from 'react'

/**
 * Hook for managing notification mute state.
 *
 * Provides synchronous mute/unmute handlers for immediate effect
 * (avoiding useEffect timing issues with sounds).
 */
export function useNotificationMute(muteCallback: (muted: boolean) => void) {
  const [isMuted, setIsMuted] = useState(false)

  const mute = useCallback(() => {
    muteCallback(true)
    setIsMuted(true)
  }, [muteCallback])

  const unmute = useCallback(() => {
    muteCallback(false)
    setIsMuted(false)
  }, [muteCallback])

  const toggle = useCallback((shouldMute: boolean) => {
    if (shouldMute) {
      mute()
    } else {
      unmute()
    }
  }, [mute, unmute])

  return {
    isMuted,
    mute,
    unmute,
    toggle,
  }
}
