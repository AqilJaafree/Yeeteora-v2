// src/components/damm-v2/damm-v2-token-card.tsx
'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Copy, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { AddLiquidityToPool } from './damm-v2-add-liquidity'
import { TokenData } from '@/lib/validators'
import {
  formatCompactNumber,
  formatFeePercentage,
  getFeeScheduleLabel,
  formatTokenAge,
  lamportsToSol,
  truncateAddress,
  parseJupiterError,
  getErrorLabel,
} from './damm-v2-utils'
import { ACTIVITY_THRESHOLDS, ORGANIC_SCORE, NOTIFICATION } from './damm-v2-constants'

// ====== Types ======

interface JupiterTokenData {
  id: string
  name: string
  symbol: string
  icon: string
  decimals: number
  twitter?: string
  website?: string
  coingeckoId?: string
  description?: string
  tags?: string[]
  dev: string
  circSupply: number
  totalSupply: number
  holderCount: number
  organicScore: number
  organicScoreLabel: string
  fdv: number
  mcap: number
  usdPrice: number
  liquidity: number
  stats24h: {
    priceChange: number
    holderChange: number
    liquidityChange: number
    buyVolume: number
    sellVolume: number
    buyOrganicVolume: number
    sellOrganicVolume: number
    numBuys: number
    numSells: number
    numTraders: number
    numOrganicBuyers: number
    numNetBuyers: number
  }
  updatedAt: string
}

interface MeteoraPool {
  pool_address: string
  pool_name: string
  token_a_mint: string
  token_b_mint: string
  token_a_symbol: string
  token_b_symbol: string
  tvl: number
  apr: number
  volume24h: number
  fee24h: number
  base_fee: number
  dynamic_fee: number
  fee_scheduler_mode: number
  [key: string]: unknown
}

interface MeteoraApiResponse {
  status: number
  total: number
  pages: number
  current_page: number
  data: MeteoraPool[]
}

interface TokenCardProps {
  token: TokenData
}

interface ActivityLevel {
  bg: string
  border: string
  alertTitle?: string
}

type OrganicScoreLevel = 'high' | 'medium' | 'low'

// ====== Sub-components ======

function Tip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span className="relative group/tip">
      {children}
      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50 border border-gray-700 shadow-lg">
        {label}
      </span>
    </span>
  )
}

// ====== Pure helpers (module-level, no React deps) ======

/** Determine card colour and optional alert title based on Jupiter activity */
function getActivityLevel(jupDelta: number, totalDelta: number): ActivityLevel {
  if (
    jupDelta > ACTIVITY_THRESHOLDS.HIGH_JUP_DELTA &&
    totalDelta > ACTIVITY_THRESHOLDS.HIGH_TOTAL_DELTA
  ) {
    return { bg: 'bg-red-400/10', border: 'border-red-500/30', alertTitle: '🚨 High Jupiter Activity!' }
  }

  if (
    jupDelta > ACTIVITY_THRESHOLDS.MEDIUM_JUP_DELTA &&
    totalDelta > ACTIVITY_THRESHOLDS.MEDIUM_TOTAL_DELTA
  ) {
    return { bg: 'bg-yellow-400/10', border: 'border-yellow-500/30', alertTitle: '⚠️ Medium Jupiter Activity' }
  }

  return { bg: 'bg-blue-400/10', border: 'border-blue-500/30' }
}

/** Map an organic score number to a tier label */
function getOrganicScoreLevel(score: number): OrganicScoreLevel {
  if (score >= ORGANIC_SCORE.HIGH_THRESHOLD) return 'high'
  if (score >= ORGANIC_SCORE.MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}

// ====== Main Component ======

export function TokenCard({ token }: TokenCardProps) {
  // ── State ──
  const lastNotificationRef = useRef<number>(0)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showPoolModal, setShowPoolModal]     = useState(false)
  const [poolExists, setPoolExists]           = useState<boolean | null>(null)
  const [isCheckingPool, setIsCheckingPool]   = useState(false)
  const [availablePools, setAvailablePools]   = useState<MeteoraPool[]>([])
  const [isLoadingPools, setIsLoadingPools]   = useState(false)
  const [tokenName, setTokenName]             = useState<string | null>(null)
  const [isLoadingTokenName, setIsLoadingTokenName] = useState(false)
  const [jupiterTokenData, setJupiterTokenData]     = useState<JupiterTokenData | null>(null)
  const [isLoadingJupiterData, setIsLoadingJupiterData] = useState(false)
  const [jupiterDataError, setJupiterDataError]         = useState<string | null>(null)

  // ── Computed values ──

  const totalDelta    = token.delta_jup + token.delta_other
  const activityLevel = getActivityLevel(token.delta_jup, totalDelta)
  const formattedAge  = formatTokenAge(token.timestamp - token.tge_at)

  /** Best available display name for this token */
  const getTickerName = (): string => {
    if (jupiterTokenData?.symbol) return jupiterTokenData.symbol
    if (tokenName) return tokenName

    const firstPool = availablePools[0]
    if (firstPool) {
      if (firstPool.token_a_mint === token.mint && firstPool.token_a_symbol !== 'SOL') {
        return firstPool.token_a_symbol
      }
      if (firstPool.token_b_mint === token.mint && firstPool.token_b_symbol !== 'SOL') {
        return firstPool.token_b_symbol
      }
    }

    return 'Unknown'
  }

  // ── Notification helpers ──

  const playNotificationSound = () => {
    new Audio(NOTIFICATION.SOUND_PATH).play().catch(() => {})
  }

  const showBrowserNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: NOTIFICATION.ICON_PATH })
    }
  }

  /**
   * Trigger sound + browser notification with a cooldown to prevent spam.
   * Only fires once per NOTIFICATION.COOLDOWN_MS window per token.
   */
  const triggerAlert = (title: string) => {
    const now = Date.now()
    if (now - lastNotificationRef.current <= NOTIFICATION.COOLDOWN_MS) return

    playNotificationSound()
    showBrowserNotification(
      title,
      `${token.mint} — Jup: ${token.delta_jup}, Total: ${token.total + token.total_jupiter}`,
    )
    lastNotificationRef.current = now
  }

  // ── API functions ──
  // TODO: Extract to damm-v2-data-access.tsx with React Query

  /**
   * Fetch full token metadata from Jupiter API.
   * Single call covers both symbol lookup and organic score.
   */
  const fetchJupiterTokenData = async (tokenMint: string): Promise<JupiterTokenData | null> => {
    try {
      setIsLoadingJupiterData(true)
      setJupiterDataError(null)

      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`, {
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        if (response.status === 404) throw new Error('Token not found in Jupiter database')
        if (response.status === 429) throw new Error('Rate limit exceeded')
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) return data[0]

      throw new Error('No token data found')
    } catch (error) {
      console.error('Error fetching Jupiter token data:', error)
      setJupiterDataError(error instanceof Error ? error.message : 'Unknown error')
      return null
    } finally {
      setIsLoadingJupiterData(false)
    }
  }

  /** Check if a Meteora DAMM v2 pool exists for either side of the pair */
  const checkPoolExists = async (tokenMint: string): Promise<boolean> => {
    try {
      setIsCheckingPool(true)

      const [responseA, responseB] = await Promise.all([
        fetch(`https://dammv2-api.meteora.ag/pools?token_a_mint=${tokenMint}`),
        fetch(`https://dammv2-api.meteora.ag/pools?token_b_mint=${tokenMint}`),
      ])

      const hasPool = async (res: Response): Promise<boolean> => {
        if (!res.ok) return false
        const data: MeteoraApiResponse = await res.json()
        return data.data.length > 0
      }

      const [hasPoolA, hasPoolB] = await Promise.all([hasPool(responseA), hasPool(responseB)])

      return hasPoolA || hasPoolB
    } catch (error) {
      console.error('Error checking pool existence:', error)
      return false
    } finally {
      setIsCheckingPool(false)
    }
  }

  /** Fetch all pools for this token, deduped and sorted by TVL descending */
  const getAllPoolsForToken = async (tokenMint: string): Promise<MeteoraPool[]> => {
    const pools: MeteoraPool[] = []

    try {
      const [responseA, responseB] = await Promise.all([
        fetch(`https://dammv2-api.meteora.ag/pools?token_a_mint=${tokenMint}`),
        fetch(`https://dammv2-api.meteora.ag/pools?token_b_mint=${tokenMint}`),
      ])

      if (responseA.ok) {
        const data: MeteoraApiResponse = await responseA.json()
        pools.push(...data.data)
      }

      if (responseB.ok) {
        const dataB: MeteoraApiResponse = await responseB.json()
        for (const pool of dataB.data) {
          if (!pools.some(p => p.pool_address === pool.pool_address)) pools.push(pool)
        }
      }

      return pools.sort((a, b) => b.tvl - a.tvl)
    } catch (error) {
      console.error('Error fetching all pools:', error)
      return []
    }
  }

  // ── Effects ──

  /** Fire alert on each new WebSocket update (token.timestamp changes per message) */
  useEffect(() => {
    if (activityLevel.alertTitle) {
      triggerAlert(activityLevel.alertTitle)
    }
  }, [token.timestamp])

  /** Initialise token metadata once per mint address */
  useEffect(() => {
    const initializeTokenData = async () => {
      setIsLoadingTokenName(true)

      const [jupiterData, exists] = await Promise.all([
        fetchJupiterTokenData(token.mint),
        checkPoolExists(token.mint),
      ])

      setJupiterTokenData(jupiterData)
      setTokenName(jupiterData?.symbol ?? null)
      setPoolExists(exists)
      setIsLoadingTokenName(false)

      if (exists) {
        const pools = await getAllPoolsForToken(token.mint)
        setAvailablePools(pools)
      }
    }

    initializeTokenData()
  }, [token.mint])

  // ── Event handlers ──

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Address copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Failed to copy address')
    }
  }

  const handleOpenGMGN = () => window.open(`https://gmgn.ai/sol/token/${token.mint}`, '_blank')
  const handleCreatePool = () => window.open('https://www.meteora.ag/pools/create', '_blank')

  const handleViewPool = async () => {
    if (isCheckingPool || !poolExists) return
    setShowPoolModal(true)

    if (availablePools.length === 0) {
      setIsLoadingPools(true)
      const pools = await getAllPoolsForToken(token.mint)
      setAvailablePools(pools)
      setIsLoadingPools(false)
    }
  }

  // ── Render helpers ──

  const renderOrganicBadge = () => {
    if (isLoadingJupiterData) {
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600/50 text-gray-300 inline-flex items-center gap-1">
          <div className="w-2 h-2 border border-gray-300 border-t-transparent rounded-full animate-spin" />
        </span>
      )
    }

    if (!jupiterTokenData) return null

    const score = jupiterTokenData.organicScore
    const level = getOrganicScoreLevel(score)

    const config: Record<OrganicScoreLevel, {
      className: string
      icon: typeof TrendingUp
      label: string
      tooltip: string
    }> = {
      high: {
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: TrendingUp,
        label: 'High',
        tooltip: 'High organic score (≥70): mostly authentic, non-bot trading activity',
      },
      medium: {
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        icon: Users,
        label: 'Medium',
        tooltip: 'Medium organic score (40–69): mix of organic and bot activity',
      },
      low: {
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: AlertTriangle,
        label: 'Low',
        tooltip: 'Low organic score (<40): likely high bot or wash-trading activity',
      },
    }

    const { className, icon: Icon, label, tooltip } = config[level]

    return (
      <Tip label={tooltip}>
        <span className={`px-2 py-0.5 text-xs rounded-full inline-flex items-center gap-1 border ${className}`}>
          <Icon className="w-3 h-3" />
          {label}: {score.toFixed(1)}
        </span>
      </Tip>
    )
  }

  // ── JSX ──

  return (
    <>
      {/* Token card row */}
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className={`rounded-xl border ${activityLevel.bg} ${activityLevel.border} text-white cursor-pointer hover:brightness-110 transition-[filter]`}
        onClick={() => setShowDetailModal(true)}
        role="button"
        aria-label={`Open details for ${getTickerName()}`}
      >
        <div className="px-3 sm:px-4 pt-3 pb-2">
          {/* Name · address · age */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="font-bold text-primary text-sm shrink-0 max-w-[80px] sm:max-w-none truncate">
                {isLoadingTokenName ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
                  </span>
                ) : (
                  getTickerName()
                )}
              </span>
              <span className="text-gray-500 text-xs shrink-0">•</span>
              <span className="text-xs text-gray-400 font-mono truncate">
                <span className="sm:hidden">{truncateAddress(token.mint, { mobile: true })}</span>
                <span className="hidden sm:inline">{truncateAddress(token.mint)}</span>
              </span>
              <button
                onClick={e => { e.stopPropagation(); copyToClipboard(token.mint) }}
                className="shrink-0 p-1 rounded hover:bg-gray-600/50 transition-colors"
                aria-label="Copy address"
              >
                <Copy className="w-3 h-3 text-gray-400" />
              </button>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{formattedAge}</span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {poolExists !== null && (
              <Tip label={poolExists
                ? 'A Meteora DAMM v2 pool exists for this token'
                : 'No Meteora DAMM v2 pool found — you can create one'}
              >
                <span className={`px-2 py-0.5 text-xs rounded-full inline-block ${
                  poolExists
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                }`}>
                  {poolExists ? '✓ Pool Exists' : '⚠️ No Pool'}
                </span>
              </Tip>
            )}
            {isCheckingPool && poolExists === null && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600/50 text-gray-300 inline-flex items-center gap-1">
                <div className="w-2 h-2 border border-gray-300 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
            {renderOrganicBadge()}
            {jupiterTokenData && (
              <Tip label="Number of unique wallets holding this token">
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {jupiterTokenData.holderCount.toLocaleString()}
                </span>
              </Tip>
            )}
            {jupiterDataError && !isLoadingJupiterData && (
              <span
                className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 inline-flex items-center gap-1 cursor-pointer"
                title={jupiterDataError}
                onClick={e => {
                  e.stopPropagation()
                  toast.error(parseJupiterError(jupiterDataError), { duration: 5000 })
                }}
              >
                <AlertTriangle className="w-3 h-3" />
                {getErrorLabel(jupiterDataError)}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Detail modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="bg-[#1a1a2e] border border-gray-600 text-white max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <span className="text-primary">{getTickerName()}</span>
              <span className="text-xs text-gray-400 font-mono font-normal">
                {truncateAddress(token.mint)}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-white/10 pt-4">
            <div>
              <Tip label="How many new buys/sells happened on Jupiter recently">
                <div className="text-muted-foreground text-xs mb-0.5 cursor-default w-fit">Changes Jupiter</div>
              </Tip>
              <div className="text-green-500 font-medium">
                +{token.delta_jup}
                <span className="text-gray-400 ml-1 font-normal">
                  ({lamportsToSol(token.delta_jupiter_trade_size).toFixed(2)} SOL)
                </span>
              </div>
            </div>
            <div>
              <Tip label="How many new buys/sells happened outside of Jupiter (other DEXes)">
                <div className="text-muted-foreground text-xs mb-0.5 cursor-default w-fit">Changes Non-Jup</div>
              </Tip>
              <div className="font-medium">
                +{token.delta_other}
                <span className="text-gray-400 ml-1 font-normal">
                  ({lamportsToSol(token.delta_total_trade_size).toFixed(2)} SOL)
                </span>
              </div>
            </div>
            <div>
              <Tip label="Out of all trades, how many were made through Jupiter">
                <div className="text-muted-foreground text-xs mb-0.5 cursor-default w-fit">Jup Txs Pct</div>
              </Tip>
              <div className="text-green-500 font-medium">{token.jupiter_pct.toFixed(2)}%</div>
            </div>
            <div>
              <Tip label="Out of all SOL traded, how much went through Jupiter">
                <div className="text-muted-foreground text-xs mb-0.5 cursor-default w-fit">Jup Size Pct</div>
              </Tip>
              <div className="text-green-500 font-medium">
                {((token.delta_jupiter_trade_size / token.delta_total_trade_size) * 100).toFixed(2)}%
              </div>
            </div>
            <div>
              <Tip label="Total number of Jupiter trades ever recorded for this token">
                <div className="text-muted-foreground text-xs mb-0.5 cursor-default w-fit">Total Jup Txs</div>
              </Tip>
              <div className="font-medium">{token.total_jupiter}</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <Button className="flex-1 bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none" onClick={handleOpenGMGN}>
              GMGN
            </Button>
            {!poolExists && poolExists !== null && (
              <Button className="flex-1 bg-primary hover:bg-secondary" onClick={handleCreatePool}>
                Create Pool
              </Button>
            )}
            {poolExists && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-500 border-none"
                onClick={handleViewPool}
                disabled={isCheckingPool || poolExists === null}
              >
                {isCheckingPool || poolExists === null ? 'Checking...' : 'View Pools'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pool list modal */}
      <Dialog open={showPoolModal} onOpenChange={setShowPoolModal}>
        <DialogContent className="bg-[#1a1a2e] border border-gray-600 text-white max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="text-white">Pools for {getTickerName()}</DialogTitle>
          </DialogHeader>

          {isLoadingPools && (
            <div className="flex items-center justify-center py-8 gap-3 text-sm text-gray-400">
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Loading available pools...
            </div>
          )}

          {!isLoadingPools && availablePools.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">
              No pools found for this token
            </div>
          )}

          {!isLoadingPools && availablePools.length > 0 && (
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {availablePools.map((pool) => (
                <div key={pool.pool_address} className="p-3 bg-[#2a2a3e] border border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white mb-1">
                        {pool.token_a_symbol}/{pool.token_b_symbol}
                      </div>
                      <div className="text-xs text-gray-400 font-mono truncate">
                        {truncateAddress(pool.pool_address)}
                      </div>
                    </div>
                    <div className="text-right ml-3 space-y-1">
                      <div className="text-sm font-medium text-green-400">
                        {formatCompactNumber(pool.tvl)}
                      </div>
                      <div className="text-xs text-blue-400">
                        Fee: {formatFeePercentage(pool.base_fee || 0, pool.dynamic_fee || 0)}
                      </div>
                      <div className="text-xs text-yellow-400">
                        {getFeeScheduleLabel(pool.fee_scheduler_mode || 0)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <AddLiquidityToPool
                        poolAddress={pool.pool_address}
                        poolName={pool.pool_name}
                        tokenAMint={pool.token_a_mint}
                        tokenBMint={pool.token_b_mint}
                        tokenASymbol={pool.token_a_symbol}
                        tokenBSymbol={pool.token_b_symbol}
                      >
                        <Button size="sm" className="w-full bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none">
                          Add Liquidity
                        </Button>
                      </AddLiquidityToPool>
                    </div>
                    <Button
                      size="sm"
                      className="flex-1 bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none"
                      onClick={() => {
                        window.open(`https://meteora.ag/dammv2/${pool.pool_address}`, '_blank')
                        setShowPoolModal(false)
                      }}
                    >
                      View Pool
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
