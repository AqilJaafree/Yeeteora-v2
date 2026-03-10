// src/components/damm-v2/damm-v2-feature.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { AppHero } from '@/components/app-hero'
import { NewTokenPopup } from './damm-v2-new-token-popup'
import { Button } from '../ui/button'
import { TokenData, isValidTokenData } from '@/lib/validators'
import { TokenSectionsUI } from './damm-v2-token-sections-ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { ChevronDown, Check, BookOpen } from 'lucide-react'
import { ACTIVITY_THRESHOLDS } from './damm-v2-constants'

type SortBy = 'creation_date' | 'market_cap'

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

const getWebSocketURL = () => process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? ''

// ====== Cheat Sheet Data ======

const SIGNAL_TIERS = [
  { dot: 'bg-red-500',    textColor: 'text-red-400',    label: 'Highest Activity', desc: 'Token is getting slammed on Jupiter right now. High Jup delta + high total delta — strong momentum signal.' },
  { dot: 'bg-yellow-500', textColor: 'text-yellow-400', label: 'Medium Activity',  desc: 'Notable buy pressure, not crazy yet. Worth watching — could escalate.' },
  { dot: 'bg-blue-500',   textColor: 'text-blue-400',   label: 'Normal / Low',     desc: 'Low or baseline trading activity. Could still be early — check organic score.' },
] as const

const TRADE_STATS = [
  { label: 'Changes Jupiter',  desc: 'New buys/sells that went through Jupiter in the last update window. Higher = more Jupiter-routed demand. Also shows the SOL volume behind those trades.' },
  { label: 'Changes Non-Jup',  desc: 'New buys/sells on other DEXes (Raydium, Orca, etc.) in the same window. Useful to see if demand is Jupiter-specific or broad.' },
  { label: 'Jup Txs %',        desc: 'Out of all trades recorded, how many went through Jupiter. High % = the Jupiter crowd is driving the action.' },
  { label: 'Jup Size %',       desc: 'Out of all SOL traded, what percentage was routed through Jupiter. Tells you if Jupiter trades are large or small relative to overall volume.' },
  { label: 'Total Jup Txs',    desc: 'Cumulative Jupiter trade count since the token was first seen. Good for gauging overall maturity vs. fresh signals.' },
] as const

const CARD_BADGES = [
  { label: 'Organic Score — High / Medium / Low', labelColor: 'text-green-400',  desc: <>Jupiter's score for how organic (non-bot) the trading is. <span className="text-green-400">≥70 = legit buyers</span>, <span className="text-blue-400">40–69 = mixed</span>, <span className="text-red-400">&lt;40 = likely bots/wash trading</span>. Low score = be careful.</> },
  { label: 'Holders',                              labelColor: 'text-blue-300',   desc: 'Number of unique wallets currently holding the token. Early signals usually have very few — watch this grow.' },
  { label: '✓ Pool Exists',                        labelColor: 'text-green-400',  desc: 'A Meteora DAMM v2 pool already exists. You can add liquidity to capture fees from the hype.' },
  { label: '⚠ No Pool',                            labelColor: 'text-orange-400', desc: 'No DAMM v2 pool yet. You could be the first LP — higher risk, higher reward.' },
] as const

const OTHER_TERMS = [
  { label: 'Token Age',       desc: 'How long since the token was first created (TGE). Shown as seconds (s), minutes (m), or hours (h). Fresh = higher risk, higher upside.' },
  { label: 'Demo Data badge', desc: "Shown when the live WebSocket hasn't delivered any tokens yet. Cards are placeholders — not real signals." },
] as const

export default function DammV2Feature() {
  const [tokens, setTokens] = useState<Record<string, TokenData>>({})
  const [newToken, setNewToken] = useState<TokenData | null>(null)
  const [isPopupOpen, setPopupOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('creation_date')
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false)

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

  const handlePopupClose = (open: boolean) => {
    setPopupOpen(open)
    if (!open) {
      setNewToken(null)
    }
  }

  const liveTokenArray = isMounted ? Object.values(tokens) : []
  const mockTokens = getMockTokens()
  const showMockData = isMounted && liveTokenArray.length === 0

  const applySort = (arr: TokenData[]): TokenData[] => {
    return [...arr].sort((a, b) =>
      sortBy === 'creation_date'
        ? b.tge_at - a.tge_at
        : b.total_trade_size - a.total_trade_size
    )
  }

  /**
   * Categorise a token into one of three activity tiers.
   *
   * Uses the delta-based heuristics from ACTIVITY_THRESHOLDS (aligned with the
   * same boundaries applied inside TokenCard for consistent colouring):
   *   - high   → delta_jup > HIGH_JUP_DELTA  AND totalDelta > HIGH_TOTAL_DELTA
   *   - medium → delta_jup > MEDIUM_JUP_DELTA AND totalDelta > MEDIUM_TOTAL_DELTA
   *   - normal → everything else
   *
   * Note: organic score from Jupiter is fetched lazily inside each TokenCard
   * after the card mounts, so it is not available here for initial bucketing.
   * The delta heuristics are a reliable real-time proxy.
   */
  const categorizeToken = (token: TokenData): 'high' | 'medium' | 'normal' => {
    const totalDelta = token.delta_jup + token.delta_other
    if (
      token.delta_jup > ACTIVITY_THRESHOLDS.HIGH_JUP_DELTA &&
      totalDelta > ACTIVITY_THRESHOLDS.HIGH_TOTAL_DELTA
    ) return 'high'
    if (
      token.delta_jup > ACTIVITY_THRESHOLDS.MEDIUM_JUP_DELTA &&
      totalDelta > ACTIVITY_THRESHOLDS.MEDIUM_TOTAL_DELTA
    ) return 'medium'
    return 'normal'
  }

  /** Split a sorted token array into the three activity buckets in a single pass */
  const buildTokenSections = (tokenArray: TokenData[]) => {
    const high: TokenData[] = [], medium: TokenData[] = [], normal: TokenData[] = []
    for (const t of tokenArray) {
      const tier = categorizeToken(t)
      if (tier === 'high') high.push(t)
      else if (tier === 'medium') medium.push(t)
      else normal.push(t)
    }
    return <TokenSectionsUI highTokens={high} mediumTokens={medium} normalTokens={normal} />
  }

  return (
    <div className="min-h-screen">
      <AppHero title="New Token Signal" subtitle="Fresh new signals on the rise to make the $$$" />

      <div className="px-4 sm:px-6 lg:px-[70px] mx-auto flex flex-wrap justify-between items-center gap-2 mb-4">
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
          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="px-3 py-1.5 text-xs sm:text-sm gap-1.5">
                <span className="hidden sm:inline text-muted-foreground">Sort By:</span>
                {sortBy === 'creation_date' ? 'Creation Date' : 'Market Cap'}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy('creation_date')} className="gap-2">
                <Check className={`w-4 h-4 ${sortBy === 'creation_date' ? 'opacity-100' : 'opacity-0'}`} />
                Creation Date
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('market_cap')} className="gap-2">
                <Check className={`w-4 h-4 ${sortBy === 'market_cap' ? 'opacity-100' : 'opacity-0'}`} />
                Market Cap
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="px-3 py-1.5 text-xs sm:text-sm sm:px-4 sm:py-2 gap-1.5"
            onClick={() => setIsCheatSheetOpen(true)}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Cheat Sheet
          </Button>
        </div>
      </div>

      <div className="px-3 sm:px-4 lg:px-[70px] mx-auto flex flex-col gap-3 pb-6">
        {isMounted && liveTokenArray.length > 0 && buildTokenSections(applySort(liveTokenArray))}
        {showMockData && buildTokenSections(applySort(mockTokens))}
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

      <Dialog open={isCheatSheetOpen} onOpenChange={setIsCheatSheetOpen}>
        <DialogContent className="bg-[#1a1a2e] border border-gray-600 text-white max-w-lg w-full sm:max-h-[85vh] sm:overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Cheat Sheet — Glossary
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 text-sm pt-1">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Signal Tiers</h3>
              <div className="flex flex-col gap-2">
                {SIGNAL_TIERS.map(({ dot, textColor, label, desc }) => (
                  <div key={label} className="flex items-start gap-2">
                    <span className={`mt-0.5 w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
                    <div>
                      <span className={`font-medium ${textColor}`}>{label}</span>
                      <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t border-white/10" />

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Trade Stats (in detail modal)</h3>
              <div className="flex flex-col gap-3">
                {TRADE_STATS.map(({ label, desc }) => (
                  <div key={label}>
                    <span className="font-medium text-white">{label}</span>
                    <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t border-white/10" />

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Card Badges</h3>
              <div className="flex flex-col gap-3">
                {CARD_BADGES.map(({ label, labelColor, desc }) => (
                  <div key={label}>
                    <span className={`font-medium ${labelColor}`}>{label}</span>
                    <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t border-white/10" />

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Other</h3>
              <div className="flex flex-col gap-3">
                {OTHER_TERMS.map(({ label, desc }) => (
                  <div key={label}>
                    <span className="font-medium text-white">{label}</span>
                    <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}