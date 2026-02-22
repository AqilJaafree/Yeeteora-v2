// src/components/damm-v2/damm-v2-token-card.tsx
'use client'

import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Copy, Users, AlertTriangle, TrendingUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { AddLiquidityToPool } from './damm-v2-add-liquidity'
import { TokenData } from '@/lib/validators'

// Enhanced Jupiter Token API response type
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

// Meteora API response types
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

export function TokenCard({ token }: TokenCardProps) {
  const lastNotificationRef = useRef<number>(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [poolExists, setPoolExists] = useState<boolean | null>(null)
  const [isCheckingPool, setIsCheckingPool] = useState(false)
  const [showPoolList, setShowPoolList] = useState(false)
  const [availablePools, setAvailablePools] = useState<MeteoraPool[]>([])
  const [isLoadingPools, setIsLoadingPools] = useState(false)
  const [tokenName, setTokenName] = useState<string | null>(null)
  const [isLoadingTokenName, setIsLoadingTokenName] = useState(false)

  const [jupiterTokenData, setJupiterTokenData] = useState<JupiterTokenData | null>(null)
  const [isLoadingJupiterData, setIsLoadingJupiterData] = useState(false)
  const [jupiterDataError, setJupiterDataError] = useState<string | null>(null)

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Address copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy: ', err)
      toast.error('Failed to copy address')
    }
  }

  const formatTVL = (tvl: number) => {
    if (tvl >= 1000000) return `${(tvl / 1000000).toFixed(2)}M`
    if (tvl >= 1000) return `${(tvl / 1000).toFixed(2)}K`
    return `${tvl.toFixed(2)}`
  }

  const formatFeePercentage = (baseFee: number, dynamicFee: number) => {
    return `${(baseFee + dynamicFee).toFixed(3)}%`
  }

  const getFeeScheduleText = (feeSchedulerMode: number) => {
    if (feeSchedulerMode === 0) return 'Linear'
    if (feeSchedulerMode === 1) return 'Exponential'
    return 'No Schedule'
  }

  const formatTime = (ageInSeconds: number) => {
    if (ageInSeconds < 60) return `${ageInSeconds}s`
    if (ageInSeconds < 3600) return `${Math.floor(ageInSeconds / 60)}m`
    const hours = Math.floor(ageInSeconds / 3600)
    const minutes = Math.floor((ageInSeconds % 3600) / 60)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const fetchJupiterTokenData = async (tokenMint: string): Promise<JupiterTokenData | null> => {
    try {
      setIsLoadingJupiterData(true)
      setJupiterDataError(null)

      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
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

  const fetchTokenName = async (tokenMint: string): Promise<string | null> => {
    try {
      setIsLoadingTokenName(true)
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) throw new Error('Failed to fetch from Jupiter API')
      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) return data[0].symbol || null
      return null
    } catch (error) {
      console.error('Error fetching token name from Jupiter:', error)
      return null
    } finally {
      setIsLoadingTokenName(false)
    }
  }

  const getTickerName = () => {
    if (jupiterTokenData?.symbol) return jupiterTokenData.symbol
    if (tokenName) return tokenName
    if (availablePools.length > 0) {
      const pool = availablePools[0]
      if (pool.token_a_mint === token.mint && pool.token_a_symbol !== 'SOL') return pool.token_a_symbol
      if (pool.token_b_mint === token.mint && pool.token_b_symbol !== 'SOL') return pool.token_b_symbol
    }
    return 'Unknown'
  }

  const playNotificationSound = () => {
    const audio = new Audio('/sound/noti.mp3')
    audio.play().catch(() => {})
  }

  const showBrowserNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' })
    }
  }

  const triggerAlert = (title: string) => {
    const now = Date.now()
    if (now - lastNotificationRef.current > 30) {
      playNotificationSound()
      showBrowserNotification(
        title,
        `${token.mint} — Jup: ${token.delta_jup}, Total: ${token.total + token.total_jupiter}`,
      )
      lastNotificationRef.current = now
    }
  }

  const checkPoolExists = async (tokenMint: string): Promise<boolean> => {
    try {
      setIsCheckingPool(true)
      const response = await fetch(`https://dammv2-api.meteora.ag/pools?token_a_mint=${tokenMint}`)
      if (!response.ok) throw new Error('Failed to fetch pool data')
      const data: MeteoraApiResponse = await response.json()
      if (data.data.length > 0) return true
      try {
        const responseB = await fetch(`https://dammv2-api.meteora.ag/pools?token_b_mint=${tokenMint}`)
        if (responseB.ok) {
          const dataB: MeteoraApiResponse = await responseB.json()
          return dataB.data.length > 0
        }
      } catch (err) {
        console.warn('Failed to check token_b_mint:', err)
      }
      return false
    } catch (error) {
      console.error('Error checking pool existence:', error)
      return false
    } finally {
      setIsCheckingPool(false)
    }
  }

  const getAllPoolsForToken = async (tokenMint: string): Promise<MeteoraPool[]> => {
    const pools: MeteoraPool[] = []
    try {
      const response = await fetch(`https://dammv2-api.meteora.ag/pools?token_a_mint=${tokenMint}`)
      if (response.ok) {
        const data: MeteoraApiResponse = await response.json()
        pools.push(...data.data)
      }
      const responseAll = await fetch(`https://dammv2-api.meteora.ag/pools?token_b_mint=${tokenMint}`)
      if (responseAll.ok) {
        const dataAll: MeteoraApiResponse = await responseAll.json()
        for (const pool of dataAll.data) {
          if (!pools.some(p => p.pool_address === pool.pool_address)) pools.push(pool)
        }
      }
      return pools.sort((a, b) => b.tvl - a.tvl)
    } catch (error) {
      console.error('Error fetching all pools:', error)
      return []
    }
  }

  useEffect(() => {
    const initializeTokenData = async () => {
      const [name, exists, jupiterData] = await Promise.all([
        fetchTokenName(token.mint),
        checkPoolExists(token.mint),
        fetchJupiterTokenData(token.mint),
      ])

      setTokenName(name || jupiterData?.symbol || null)
      setPoolExists(exists)
      setJupiterTokenData(jupiterData)

      if (exists) {
        const pools = await getAllPoolsForToken(token.mint)
        setAvailablePools(pools)
      }
    }

    initializeTokenData()
  }, [token.mint])

  const handleOpenGMGN = () => {
    window.open(`https://gmgn.ai/sol/token/${token.mint}`, '_blank')
  }

  const handleCreatePool = () => {
    window.open('https://www.meteora.ag/pools/create', '_blank')
  }

  const handleViewPool = async () => {
    if (isCheckingPool || !poolExists) return
    if (showPoolList) {
      setShowPoolList(false)
      return
    }
    if (availablePools.length === 0) {
      setIsLoadingPools(true)
      const pools = await getAllPoolsForToken(token.mint)
      setAvailablePools(pools)
      setIsLoadingPools(false)
    }
    setShowPoolList(true)
  }

  const getViewPoolButtonText = () => {
    if (isCheckingPool || poolExists === null) return 'Checking...'
    if (isLoadingPools) return 'Loading Pools...'
    return showPoolList ? 'Hide Pools' : 'View Pools'
  }

  // Card accent colour based on Jupiter activity
  const totalDelta = token.delta_jup + token.delta_other
  let bgColorClass = 'bg-[#2a2a3e]/50'
  let borderClass = 'border-white/5'

  if (token.delta_jup > 20 && totalDelta > 200) {
    bgColorClass = 'bg-red-400/10'
    borderClass = 'border-red-500/30'
    triggerAlert('🚨 High Jupiter Activity!')
  } else if (token.delta_jup > 10 && totalDelta > 100) {
    bgColorClass = 'bg-yellow-400/10'
    borderClass = 'border-yellow-500/30'
    triggerAlert('⚠️ Medium Jupiter Activity')
  }

  const ageInSeconds = token.timestamp - token.tge_at
  const formattedTime = formatTime(ageInSeconds)

  // Organic score badge
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
    const isHigh = score >= 70
    const isMed = score >= 40
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full inline-flex items-center gap-1 ${
        isHigh
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : isMed
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'bg-red-500/20 text-red-400 border border-red-500/30'
      }`}>
        {isHigh ? <TrendingUp className="w-3 h-3" /> : isMed ? <Users className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        {isHigh ? 'High' : isMed ? 'Medium' : 'Low'}: {score.toFixed(1)}
      </span>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 6 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={`rounded-xl border ${bgColorClass} ${borderClass} text-white overflow-hidden`}
    >
      {/* ── Collapsed header (always visible) ── */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full text-left px-3 sm:px-4 pt-3 pb-2 focus:outline-none"
        aria-expanded={isExpanded}
      >
        {/* Row 1 – name · address · copy · age · chevron */}
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
              {/* show fewer chars on small screens to prevent overflow */}
              <span className="sm:hidden">{token.mint.slice(0, 4)}...{token.mint.slice(-4)}</span>
              <span className="hidden sm:inline">{token.mint.slice(0, 8)}...{token.mint.slice(-8)}</span>
            </span>
            <button
              onClick={e => { e.stopPropagation(); copyToClipboard(token.mint) }}
              className="shrink-0 p-1 rounded hover:bg-gray-600/50 transition-colors"
              aria-label="Copy address"
            >
              <Copy className="w-3 h-3 text-gray-400" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-gray-400">{formattedTime}</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {/* Row 2 – badges */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {/* Pool badge */}
          {poolExists !== null && (
            <span className={`px-2 py-0.5 text-xs rounded-full inline-block ${
              poolExists
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
            }`}>
              {poolExists ? '✓ Pool Exists' : '⚠️ No Pool'}
            </span>
          )}
          {isCheckingPool && poolExists === null && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600/50 text-gray-300 inline-flex items-center gap-1">
              <div className="w-2 h-2 border border-gray-300 border-t-transparent rounded-full animate-spin" />
            </span>
          )}

          {/* Organic score */}
          {renderOrganicBadge()}

          {/* Holder count */}
          {jupiterTokenData && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {jupiterTokenData.holderCount.toLocaleString()}
            </span>
          )}

          {/* Jupiter data error */}
          {jupiterDataError && !isLoadingJupiterData && (
            <span
              className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 inline-flex items-center gap-1 cursor-pointer"
              title={jupiterDataError}
              onClick={e => {
                e.stopPropagation()
                toast.error(
                  jupiterDataError.includes('404') ? 'Token not found on Jupiter'
                  : jupiterDataError.includes('429') ? 'Too many requests. Please wait.'
                  : jupiterDataError.includes('API error') ? 'Jupiter API is temporarily unavailable'
                  : 'Check your internet connection and try again',
                  { duration: 5000 },
                )
              }}
            >
              <AlertTriangle className="w-3 h-3" />
              {jupiterDataError.includes('404') ? 'Not Found'
               : jupiterDataError.includes('429') ? 'Rate Limited'
               : 'API Error'}
            </span>
          )}
        </div>
      </button>

      {/* ── Expandable details ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 sm:px-4 pb-1 border-t border-white/5">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:text-sm py-3">
                <div>
                  <div className="text-muted-foreground text-xs font-serif">Changes Jupiter</div>
                  <div className="text-green-500">
                    +{token.delta_jup}
                    <span className="text-gray-400 ml-1">
                      ({(token.delta_jupiter_trade_size / 1_000_000_000).toFixed(2)} SOL)
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs font-serif">Changes Non-Jup</div>
                  <div>
                    +{token.delta_other}
                    <span className="text-gray-400 ml-1">
                      ({(token.delta_total_trade_size / 1_000_000_000).toFixed(2)} SOL)
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs font-serif">Jup Txs Pct</div>
                  <div className="text-green-500">{token.jupiter_pct.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs font-serif">Jup Size Pct</div>
                  <div className="text-green-500">
                    {((token.delta_jupiter_trade_size / token.delta_total_trade_size) * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs font-serif">Total Jup Txs</div>
                  <div>{token.total_jupiter}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pb-3">
                <Button
                  size="sm"
                  className="flex-1 min-w-[70px] bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none text-xs"
                  onClick={handleOpenGMGN}
                >
                  GMGN
                </Button>

                {!poolExists && poolExists !== null && (
                  <Button
                    size="sm"
                    className="flex-1 min-w-[90px] bg-primary hover:bg-secondary text-xs"
                    onClick={handleCreatePool}
                  >
                    Create Pool
                  </Button>
                )}

                {poolExists && (
                  <Button
                    size="sm"
                    className="flex-1 min-w-[90px] bg-green-600 hover:bg-green-500 border-none text-xs"
                    onClick={handleViewPool}
                    disabled={isCheckingPool || poolExists === null}
                  >
                    {getViewPoolButtonText()}
                  </Button>
                )}
              </div>

              {/* Pool list */}
              <AnimatePresence>
                {showPoolList && availablePools.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="mb-3 bg-[#1a1a2e] border border-gray-600 rounded-lg overflow-hidden"
                  >
                    <div className="max-h-[300px] overflow-y-auto scrollbar-thin p-3 space-y-2">
                      {availablePools.map((pool) => (
                        <div
                          key={pool.pool_address}
                          className="p-3 bg-[#2a2a3e] border border-gray-600 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white mb-1">
                                {pool.token_a_symbol}/{pool.token_b_symbol}
                              </div>
                              <div className="text-xs text-gray-400 font-mono truncate">
                                {pool.pool_address.slice(0, 8)}...{pool.pool_address.slice(-8)}
                              </div>
                            </div>
                            <div className="text-right ml-3 space-y-1">
                              <div className="text-sm font-medium text-green-400">{formatTVL(pool.tvl)}</div>
                              <div className="text-xs text-blue-400">
                                Fee: {formatFeePercentage(pool.base_fee || 0, pool.dynamic_fee || 0)}
                              </div>
                              <div className="text-xs text-yellow-400">
                                {getFeeScheduleText(pool.fee_scheduler_mode || 0)}
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
                                setShowPoolList(false)
                              }}
                            >
                              View Pool
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <style jsx>{`
                      .scrollbar-thin::-webkit-scrollbar { width: 6px; }
                      .scrollbar-thin::-webkit-scrollbar-track { background: #374151; border-radius: 3px; }
                      .scrollbar-thin::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 3px; }
                      .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
                      .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #6b7280 #374151; }
                    `}</style>
                  </motion.div>
                )}

                {isLoadingPools && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mb-3 bg-[#1a1a2e] border border-gray-600 rounded-lg p-4 text-center text-sm text-gray-400"
                  >
                    Loading available pools...
                  </motion.div>
                )}

                {showPoolList && !isLoadingPools && availablePools.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mb-3 bg-[#1a1a2e] border border-gray-600 rounded-lg p-4 text-center text-sm text-gray-400"
                  >
                    No pools found for this token
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
