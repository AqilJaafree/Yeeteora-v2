// src/components/damm-v2/damm-v2-token-card.tsx
'use client'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Copy, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { AddLiquidityToPool } from './damm-v2-add-liquidity'

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

// Jupiter Token API response type
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
    if (tvl >= 1000000) {
      return `${(tvl / 1000000).toFixed(2)}M`
    } else if (tvl >= 1000) {
      return `${(tvl / 1000).toFixed(2)}K`
    } else {
      return `${tvl.toFixed(2)}`
    }
  }

  const formatFeePercentage = (baseFee: number, dynamicFee: number) => {
    const totalFee = baseFee + dynamicFee
    return `${totalFee.toFixed(3)}%`
  }

  const getFeeScheduleText = (feeSchedulerMode: number) => {
    if (feeSchedulerMode === 0) return 'Linear'
    if (feeSchedulerMode === 1) return 'Exponential'
    return 'No Schedule'
  }

  const formatTime = (ageInSeconds: number) => {
    if (ageInSeconds < 60) {
      return `${ageInSeconds}s`
    } else if (ageInSeconds < 3600) {
      return `${Math.floor(ageInSeconds / 60)}m`
    } else {
      const hours = Math.floor(ageInSeconds / 3600)
      const minutes = Math.floor((ageInSeconds % 3600) / 60)
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
    }
  }

  const fetchJupiterTokenData = async (tokenMint: string): Promise<JupiterTokenData | null> => {
    try {
      setIsLoadingJupiterData(true)
      setJupiterDataError(null)
      
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`, {
        headers: {
          'Accept': 'application/json'
        }
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token not found in Jupiter database')
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded')
        } else {
          throw new Error(`API error: ${response.status}`)
        }
      }
      
      const data = await response.json()
      
      if (Array.isArray(data) && data.length > 0) {
        return data[0]
      }
      
      throw new Error('No token data found')
      
    } catch (error) {
      console.error('Error fetching Jupiter token data:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setJupiterDataError(errorMessage)
      return null
    } finally {
      setIsLoadingJupiterData(false)
    }
  }

  const fetchTokenName = async (tokenMint: string): Promise<string | null> => {
    try {
      setIsLoadingTokenName(true)
      
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`, {
        headers: {
          'Accept': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch from Jupiter API')
      }
      
      const data = await response.json()
      
      if (Array.isArray(data) && data.length > 0) {
        const token = data[0]
        return token.symbol || null
      }
      
      return null
    } catch (error) {
      console.error('Error fetching token name from Jupiter:', error)
      return null
    } finally {
      setIsLoadingTokenName(false)
    }
  }

  const getTickerName = () => {
    if (jupiterTokenData?.symbol) {
      return jupiterTokenData.symbol
    }
    
    if (tokenName) {
      return tokenName
    }
    
    if (availablePools.length > 0) {
      const pool = availablePools[0]
      if (pool.token_a_mint === token.mint && pool.token_a_symbol !== 'SOL') {
        return pool.token_a_symbol
      } else if (pool.token_b_mint === token.mint && pool.token_b_symbol !== 'SOL') {
        return pool.token_b_symbol
      }
    }
    
    return 'Unknown'
  }

  const playNotificationSound = () => {
    const audio = new Audio('/notification.mp3')
    audio.play().catch(() => {})
  }

  const showBrowserNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' })
    }
  }

  const triggerAlert = (title: string) => {
    const now = Date.now()
    if (now - lastNotificationRef.current > 3000) {
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
      
      if (!response.ok) {
        throw new Error('Failed to fetch pool data')
      }
      
      const data: MeteoraApiResponse = await response.json()
      
      const hasPoolAsTokenA = data.data.length > 0
      
      if (hasPoolAsTokenA) {
        return true
      }
      
      try {
        const responseB = await fetch(`https://dammv2-api.meteora.ag/pools?token_b_mint=${tokenMint}`)
        if (responseB.ok) {
          const dataB: MeteoraApiResponse = await responseB.json()
          const hasPoolAsTokenB = dataB.data.length > 0
          return hasPoolAsTokenB
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
          const exists = pools.some(p => p.pool_address === pool.pool_address)
          if (!exists) {
            pools.push(pool)
          }
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
        fetchJupiterTokenData(token.mint)
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

  const handlePumpSwap = () => {
    window.open(
      `https://swap.pump.fun/?input=So11111111111111111111111111111111111111112&output=${token.mint}`,
      '_blank',
    )
  }

  const handleCreatePool = () => {
    window.open('https://www.meteora.ag/pools/create', '_blank')
  }

  const handleViewPool = async () => {
    if (poolExists === null || isCheckingPool || !poolExists) {
      return
    }

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

  const handlePoolSelect = (pool: MeteoraPool) => {
    window.open(`https://meteora.ag/dammv2/${pool.pool_address}`, '_blank')
    setShowPoolList(false)
  }

  const getViewPoolButtonText = () => {
    if (isCheckingPool || poolExists === null) {
      return 'Checking...'
    }
    if (isLoadingPools) {
      return 'Loading Pools...'
    }
    return showPoolList ? 'Hide Pools' : 'View Pools'
  }

  const getViewPoolButtonStyle = () => {
    if (isCheckingPool || poolExists === null) {
      return 'bg-gray-500 hover:bg-gray-600'
    }
    return 'bg-green-600 hover:bg-green-500 border-none'
  }

  const totalDelta = token.delta_jup + token.delta_other
  let bgColorClass = 'bg-[#2a2a3e]/50 text-white'

  if (token.delta_jup > 20 && totalDelta > 200) {
    bgColorClass = 'bg-red-400/25 text-white'
    triggerAlert('🚨 High Jupiter Activity!')
  } else if (token.delta_jup > 10 && totalDelta > 100) {
    bgColorClass = 'bg-yellow-400/25 text-white'
    triggerAlert('⚠️ Medium Jupiter Activity')
  }

  const ageInSeconds = token.timestamp - token.tge_at
  const formattedTime = formatTime(ageInSeconds)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <Card className={`${bgColorClass} border-0`}>
        <CardHeader className="pb-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold truncate flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-primary">
                    {isLoadingTokenName ? (
                      <span className="inline-flex items-center gap-1">
                        <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin"></div>
                        Loading...
                      </span>
                    ) : (
                      getTickerName()
                    )}
                  </span>
                  <span className="text-gray-400 text-xs">•</span>
                  <span className="text-xs text-gray-400 truncate">{token.mint.slice(0, 8)}...{token.mint.slice(-8)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(token.mint)}
                    className="h-6 w-6 p-0 hover:bg-gray-600/50"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </CardTitle>
              <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                {formattedTime}
              </span>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {poolExists !== null && (
                <span className={`px-2 py-1 text-xs rounded-full inline-block ${
                  poolExists 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                }`}>
                  {poolExists ? '✓ Pool Exists' : '⚠️ No Pool'}
                </span>
              )}

              {isLoadingJupiterData && (
                <span className="px-2 py-1 text-xs rounded-full bg-gray-600/50 text-gray-300 inline-flex items-center gap-1">
                  <div className="w-2 h-2 border border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </span>
              )}

              {jupiterTokenData && (
                <>
                  <span className={`px-2 py-1 text-xs rounded-full inline-flex items-center gap-1 ${
                    jupiterTokenData.organicScore >= 70 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : jupiterTokenData.organicScore >= 40
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {jupiterTokenData.organicScore >= 70 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : jupiterTokenData.organicScore >= 40 ? (
                      <Users className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {jupiterTokenData.organicScore >= 70 ? 'High' : jupiterTokenData.organicScore >= 40 ? 'Medium' : 'Low'}: {jupiterTokenData.organicScore.toFixed(1)}
                  </span>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    <Users className="w-3 h-3 inline mr-1" />
                    {jupiterTokenData.holderCount.toLocaleString()}
                  </span>
                </>
              )}

              {jupiterDataError && !isLoadingJupiterData && (
                <span 
                  className="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 inline-flex items-center gap-1 cursor-pointer hover:bg-red-500/30 transition-colors"
                  title={jupiterDataError}
                  onClick={() => {
                    toast.error(
                      jupiterDataError.includes('404') ? 'Token not found on Jupiter' :
                      jupiterDataError.includes('429') ? 'Too many requests. Please wait.' :
                      jupiterDataError.includes('API error') ? 'Jupiter API is temporarily unavailable' :
                      'Check your internet connection and try again',
                      { duration: 5000 }
                    )
                  }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {jupiterDataError.includes('404') ? 'Not Found' :
                   jupiterDataError.includes('429') ? 'Rate Limited' :
                   jupiterDataError.includes('API error') ? 'API Error' :
                   'Error'}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs font-serif">Changes Jupiter</div>
            <div className="text-[1rem] text-green-500">
              +{token.delta_jup} ({(token.delta_jupiter_trade_size / 1_000_000_000).toFixed(2)} SOL)
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-serif">Changes Non-Jupiter</div>
            <div className="text-[1rem]">
              +{token.delta_other} ({(token.delta_total_trade_size / 1_000_000_000).toFixed(2)} SOL)
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-serif">Jupiter Txs Pct</div>
            <div className="text-[1rem] text-green-500">{token.jupiter_pct.toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-serif">Jupiter Size Pct</div>
            <div className="text-[1rem] text-green-500">
              {((token.delta_jupiter_trade_size / token.delta_total_trade_size) * 100).toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-serif">Total Jupiter Txs</div>
            <div>{token.total_jupiter}</div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <Button className="flex-1 bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none" onClick={handleOpenGMGN}>
              GMGN
            </Button>
            <Button className="flex-1 bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none" onClick={handlePumpSwap}>
              SWAP
            </Button>
          </div>
          
          <Button 
            className="w-full bg-primary hover:bg-secondary" 
            onClick={handleCreatePool}
          >
            Create Pool
          </Button>
          
          {poolExists && (
            <Button 
              className={`w-full ${getViewPoolButtonStyle()}`} 
              onClick={handleViewPool}
              disabled={isCheckingPool || poolExists === null}
            >
              {getViewPoolButtonText()}
            </Button>
          )}
          
          {poolExists === null && isCheckingPool && (
            <Button className="w-full bg-gray-500 hover:bg-gray-600" disabled>
              Checking Pool...
            </Button>
          )}

          <motion.div
            className="w-full"
            initial={false}
            animate={{
              height: showPoolList ? 'auto' : 0,
              opacity: showPoolList ? 1 : 0,
            }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden' }}
          >
            {showPoolList && availablePools.length > 0 && (
              <motion.div
                className="w-full bg-[#1a1a2e] border border-gray-600 rounded-lg overflow-hidden mt-2"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <div className="max-h-[300px] overflow-y-auto scrollbar-thin p-3 space-y-2">
                  {availablePools.map((pool) => (
                    <motion.div
                      key={pool.pool_address}
                      className="p-3 bg-[#2a2a3e] border border-gray-600 rounded-lg"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white mb-1">
                            {pool.token_a_symbol}/{pool.token_b_symbol}
                          </div>
                          <div className="text-xs text-gray-400 font-serif truncate">
                            {pool.pool_address.slice(0, 8)}...{pool.pool_address.slice(-8)}
                          </div>
                        </div>
                        <div className="text-right ml-3 space-y-1">
                          <div className="text-sm font-medium text-green-400">
                            {formatTVL(pool.tvl)}
                          </div>
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
                            <Button
                              className="w-full bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none"
                            >
                              Add Liquidity
                            </Button>
                          </AddLiquidityToPool>
                        </div>

                        <Button
                          className="flex-1 bg-[#4a4a6e] hover:bg-[#5a5a7e] border-none"
                          onClick={() => handlePoolSelect(pool)}
                        >
                          View Pool
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <style jsx>{`
                  .scrollbar-thin::-webkit-scrollbar {
                    width: 6px;
                  }
                  .scrollbar-thin::-webkit-scrollbar-track {
                    background: #374151;
                    border-radius: 3px;
                  }
                  .scrollbar-thin::-webkit-scrollbar-thumb {
                    background: #6b7280;
                    border-radius: 3px;
                  }
                  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
                    background: #9ca3af;
                  }
                  .scrollbar-thin {
                    scrollbar-width: thin;
                    scrollbar-color: #6b7280 #374151;
                  }
                `}</style>
              </motion.div>
            )}

            {isLoadingPools && (
              <motion.div
                className="w-full bg-[#1a1a2e] border border-gray-600 rounded-lg p-4 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-sm text-gray-400">Loading available pools...</div>
              </motion.div>
            )}

            {!isLoadingPools && availablePools.length === 0 && (
              <motion.div
                className="w-full bg-[#1a1a2e] border border-gray-600 rounded-lg p-4 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-sm text-gray-400">No pools found for this token</div>
              </motion.div>
            )}
          </motion.div>
        </CardFooter>
      </Card>
    </motion.div>
  )
}