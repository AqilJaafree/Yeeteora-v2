'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, TrendingUp, Activity, Search } from 'lucide-react'
// import { YeetModal } from './yeet-modal'
import { useQuery } from '@tanstack/react-query'
import { AddLPPosition } from './meteora-add-lp-position'

// Types based on actual Meteora DLMM API response structure
interface DLMMPair {
  address: string
  name: string
  mint_x: string
  mint_y: string
  reserve_x: string
  reserve_y: string
  reserve_x_amount: number
  reserve_y_amount: number
  bin_step: number
  base_fee_percentage: string
  max_fee_percentage: string
  protocol_fee_percentage: string
  liquidity: string
  reward_mint_x: string
  reward_mint_y: string
  fees_24h: number
  today_fees: number
  trade_volume_24h: number
  cumulative_trade_volume: string
  cumulative_fee_volume: string
  current_price: number
  apr: number
  apy: number
  farm_apr: number
  farm_apy: number
  hide: boolean
  is_blacklisted: boolean
  launchpad?: string | null
  fees: {
    min_30: number
    hour_1: number
    hour_2: number
    hour_4: number
    hour_12: number
    hour_24: number
  }
  fee_tvl_ratio: {
    min_30: number
    hour_1: number
    hour_2: number
    hour_4: number
    hour_12: number
    hour_24: number
  }
  volume: {
    min_30: number
    hour_1: number
    hour_2: number
    hour_4: number
    hour_12: number
    hour_24: number
  }
  tags: string[]
}

interface DLMMGroup {
  name: string
  pairs: DLMMPair[]
}

interface DLMMResponse {
  groups: DLMMGroup[]
  total: number
}

// Hook for fetching Meteora data
function useMeteoraData() {
  return useQuery({
    queryKey: ['meteora-dlmm-pairs'],
    queryFn: async (): Promise<DLMMResponse> => {
      const response = await fetch('https://dlmm-api.meteora.ag/pair/all_by_groups')
      if (!response.ok) {
        throw new Error('Failed to fetch Meteora data')
      }
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  })
}

// Filter functions - specific strategies with their own criteria
const filterStrategies = {
  oneSided: (pairs: DLMMPair[]): DLMMPair[] => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'

    return pairs.filter((pair) => {
      // Must be a SOL pair
      const isSOLPair = pair.mint_x === SOL_MINT || pair.mint_y === SOL_MINT
      if (!isSOLPair) return false

      // Skip pairs with missing essential data or blacklisted pairs
      if (!pair.liquidity || !pair.trade_volume_24h || pair.is_blacklisted || pair.hide) return false

      // Convert liquidity string to number (TVL)
      const tvl = parseFloat(pair.liquidity)

      // Estimate market cap from TVL (rough estimation)
      const estimatedMarketCap = tvl * 2

      // Get 6h volume from the volume object
      const volume6h =
        pair.volume?.hour_1 * 6 || pair.volume?.hour_2 * 3 || pair.volume?.hour_4 * 1.5 || pair.trade_volume_24h / 4

      return (
        estimatedMarketCap > 1_000_000 && // > $1M market cap
        pair.trade_volume_24h > 2_000_000 && // > $2M 24h volume
        volume6h > 400_000 // > $400k 6h volume
      )
    })
  },

  // Add future strategies here...
  // futureStrategy: (pairs: DLMMPair[]): DLMMPair[] => { ... }
}

// Get all pairs that match ANY strategy
const getAllStrategyPairs = (pairs: DLMMPair[]): DLMMPair[] => {
  const allStrategyPairs = new Set<DLMMPair>()

  // Collect pairs from all individual strategies
  Object.values(filterStrategies).forEach((strategyFilter) => {
    const strategyPairs = strategyFilter(pairs)
    strategyPairs.forEach((pair) => allStrategyPairs.add(pair))
  })

  return Array.from(allStrategyPairs)
}

type FilterStrategy = keyof typeof filterStrategies | 'all'

// LP Pair Card Component
function LPPairCard({ pair}: { pair: DLMMPair; rank: number }) {

  const isSOLPair = (pair: DLMMPair): boolean => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    return pair.mint_x === SOL_MINT || pair.mint_y === SOL_MINT
  }

  // Determine which strategy this pair matches
  const getPairStrategy = (pair: DLMMPair): string => {
    const strategies: { name: string; filter: (pairs: DLMMPair[]) => DLMMPair[] }[] = [
      { name: 'One Sided', filter: filterStrategies.oneSided },
      // Add more strategies here as they're implemented
    ]

    for (const strategy of strategies) {
      const matchingPairs = strategy.filter([pair])
      if (matchingPairs.length > 0) {
        return strategy.name
      }
    }

    return 'General'
  }

  const formatNumber = (num?: number) => {
    if (!num || num === 0) return 'N/A'
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  return (
    <>
      {/* Desktop Table Row (lg and above) */}
      <div className="hidden lg:block">
        <div
          className="grid grid-cols-9 gap-4 p-6 border border-border rounded-[12px] hover:bg-primary/50 transition-all duration-200"
          style={{
            background: 'linear-gradient(180deg, rgba(51, 133, 255, 0.1) 0%, rgba(51, 133, 255, 0) 100%)',
          }}
        >
          {/* Pair Column */}
          <div className="flex flex-col items-start gap-3">
            <div>
              <div className="text-white font-serif font-semibold">{pair.name}</div>
              <div className="text-sm text-muted-foreground font-serif">
                {pair.address.slice(0, 8)}...{pair.address.slice(-8)}
              </div>
            </div>
          </div>

          {/* 24hr APR Column */}
          <div className="flex items-center justify-end">
            <div className="text-primary font-medium font-serif text-sm">
              {pair.apr ? `${pair.apr.toFixed(2)}%` : 'N/A'}
            </div>
          </div>

          {/* TVL Column */}
          <div className="flex items-center justify-end">
            <div className="text-white font-medium font-serif text-sm">
              {formatNumber(parseFloat(pair.liquidity || '0'))}
            </div>
          </div>

          {/* 24h Volume Column */}
          <div className="flex items-center justify-end">
            <div className="text-white font-medium font-serif text-sm">{formatNumber(pair.trade_volume_24h)}</div>
          </div>

          {/* 24h Fees Column */}
          <div className="flex items-center justify-end">
            <div className="text-white font-medium font-serif text-sm">{formatNumber(pair.fees_24h)}</div>
          </div>

          {/* Current Price Column */}
          <div className="flex items-center justify-end">
            <div className="text-white font-medium font-serif text-sm">
              {pair.current_price ? pair.current_price.toFixed(6) : 'N/A'}
            </div>
          </div>

          {/* Bin Step Column */}
          <div className="flex items-ce
nter justify-center">
            <div className="text-white font-medium font-serif text-sm">{pair.bin_step || 'N/A'}</div>
          </div>

          {/* Strategy Column */}
          <div className="flex items-center justify-center">
            <div className="text-primary font-medium font-serif text-sm bg-secondary-foreground px-2 py-1 rounded-[8px]">
              {getPairStrategy(pair)}
            </div>
          </div>

          {/* Add LP Column */}
          <div className="flex items-center justify-center">
            <AddLPPosition pairAddress={pair.address} pairName={pair.name} isSOLPair={isSOLPair(pair)} />
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Card Layout (below lg) */}
      <div className="block lg:hidden">
        <div
          className="p-4 border border-border rounded-[12px] hover:bg-primary/50 transition-all duration-200"
          style={{
            background: 'linear-gradient(180deg, rgba(51, 133, 255, 0.1) 0%, rgba(51, 133, 255, 0) 100%)',
          }}
        >
          {/* Header with Pair Name and Strategy */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-white font-serif font-semibold text-lg">{pair.name}</div>
                <div className="text-xs text-muted-foreground font-serif">
                  {pair.address.slice(0, 8)}...{pair.address.slice(-8)}
                </div>
              </div>
            </div>
            <div className="text-primary font-medium font-serif text-xs bg-secondary-foreground px-2 py-1 rounded-[8px]">
              {getPairStrategy(pair)}
            </div>
          </div>

          {/* Two Column Grid for Key Metrics */}
          <div className="grid md:grid-cols-3 grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-serif mb-1">24hr APR</div>
              <div className="text-primary font-medium font-serif">{pair.apr ? `${pair.apr.toFixed(2)}%` : 'N/A'}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-serif mb-1">TVL</div>
              <div className="text-white font-medium font-serif">{formatNumber(parseFloat(pair.liquidity || '0'))}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-serif mb-1">24h Volume</div>
              <div className="text-white font-medium font-serif text-sm">{formatNumber(pair.trade_volume_24h)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-serif mb-1">24h Fees</div>
              <div className="text-white font-medium font-serif text-sm">{formatNumber(pair.fees_24h)}</div>
            </div>
             <div className="text-center">
              <div className="text-xs text-muted-foreground font-serif mb-1">Price</div>
              <div className="text-white font-medium font-serif text-sm">
                {pair.current_price ? pair.current_price.toFixed(6) : 'N/A'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-serif mb-1">Bin Step</div>
              <div className="text-white font-medium font-serif text-sm">{pair.bin_step || 'N/A'}</div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center pt-2 border-t border-border/30">
            <AddLPPosition pairAddress={pair.address} pairName={pair.name} isSOLPair={isSOLPair(pair)} />
          </div>
        </div>
      </div>
    </>
  )

  /* Old card-based layout (commented out)
  return (
    <div className="gradient-card rounded-2xl p-4 hover:scale-[1.02] transition-all duration-200 border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold ${getRankColor(rank)}`}>
            {rank <= 3 ? <Award className="w-5 h-5" /> : rank}
          </div>
          <div>
            <h3 className="font-semibold text-white text-lg leading-tight">{pair.name}</h3>
            <p className="text-xs text-muted-foreground font-mono">
              {pair.address.slice(0, 8)}...{pair.address.slice(-8)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {rank <= 10 && (
            <YeetModal pairName={pair.name}>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-full transition-all duration-200"
              >
                <Zap className="w-4 h-4" />
              </Button>
            </YeetModal>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-primary"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="text-center p-3 rounded-lg bg-background/50">
          <p className="text-xs text-muted-foreground mb-1">24h APR</p>
          <p className="text-lg font-bold text-green-400">
            {pair.apr ? `${pair.apr.toFixed(2)}%` : 'N/A'}
          </p>
        </div>
        <div className="text-center p-3 rounded-lg bg-background/50">
          <p className="text-xs text-muted-foreground mb-1">TVL</p>
          <p className="text-lg font-bold text-primary">
            {formatNumber(parseFloat(pair.liquidity || '0'))}
          </p>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/30 pt-3 mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">24h Volume</p>
              <p className="text-sm font-medium">{formatNumber(pair.trade_volume_24h)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">24h Fees</p>
              <p className="text-sm font-medium">{formatNumber(pair.fees_24h)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Current Price</p>
              <p className="text-sm font-medium font-mono">
                {pair.current_price ? `$${pair.current_price.toFixed(6)}` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Bin Step</p>
              <p className="text-sm font-medium">{pair.bin_step || 'N/A'}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => window.open(`https://solscan.io/account/${pair.address}`, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View on Solscan
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border/30">
        <AddLPPosition
          pairAddress={pair.address}
          pairName={pair.name}
          isSOLPair={isSOLPair(pair)}
        />
      </div>
    </div>
  )
  */
}

export function MeteoraStrategyFilter() {
  const [activeFilter, setActiveFilter] = useState<FilterStrategy>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const { data: meteoraData, isLoading, isError, refetch } = useMeteoraData()

  // Get all pairs from all groups
  const allPairs = meteoraData?.groups.flatMap((group) => group.pairs) || []

  // Apply selected filter and search query, then sort by APR
  const filteredPairs = (
    activeFilter === 'all' ? getAllStrategyPairs(allPairs) : filterStrategies[activeFilter](allPairs)
  )
    .filter((pair) => {
      if (!searchQuery.trim()) return true

      const query = searchQuery.toLowerCase().trim()

      // Search by pair name
      if (pair.name?.toLowerCase().includes(query)) return true

      // Search by pair address
      if (pair.address?.toLowerCase().includes(query)) return true

      return false
    })
    .sort((a, b) => (b.apr || 0) - (a.apr || 0))

  if (isError) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">Failed to load Meteora data</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="lg:px-[70px] px-4 mx-auto space-y-12">
      {/* Filter Controls */}
      <div>
        <div className="flex flex-col lg:flex-row lg:items-center item-start justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              onClick={() => {
                setActiveFilter('all')
              }}
            >
              <Activity className="h-4 w-4" />
              All Strategies
            </Button>

            <Button
              variant={activeFilter === 'oneSided' ? 'default' : 'outline'}
              onClick={() => {
                setActiveFilter('oneSided')
              }}
            >
              <TrendingUp className="h-4 w-4" />
              One Sided
            </Button>
          </div>

          <div className="flex items-center flex-wrap md:flex-nowrap mt-6 lg:mt-0 gap-3">
            <span className="text-sm text-muted-foreground text-nowrap">{filteredPairs.length} pairs found</span>
            {/* Refresh Button */}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {/* Search Input */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by token name or contract"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-primary rounded-[8px] h-[32px]"
              />
            </div>
          </div>
        </div>

        {/* Strategy Info Panel */}
        {/* {activeFilter === 'all' && (
          <div className="mt-4 p-4 rounded-xl gradient-accent/10 border border-primary/20">
            <h3 className="font-semibold text-primary mb-2 text-sm">All Strategies Combined</h3>
            <p className="text-xs text-muted-foreground">
              Showing all pairs that meet any strategy requirements. One-sided strategy includes SOL pairs with strong
              fundamentals.
            </p>
          </div>
        )}

        {activeFilter === 'oneSided' && (
          <div className="mt-4 p-4 rounded-xl gradient-accent/10 border border-primary/20">
            <h3 className="font-semibold text-primary mb-2 text-sm">One Sided Strategy</h3>
            <p className="text-xs text-muted-foreground">
              SOL pairs with market cap &gt; $1M, 24h volume &gt; $2M, and strong 6h volume.
            </p>
          </div>
        )} */}
      </div>

      {/* LP Pairs List */}
      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading top LP opportunities...</p>
        </div>
      ) : filteredPairs.length === 0 ? (
        <div className="text-center py-12 glass-effect rounded-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full gradient-primary/20 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Opportunities Found</h3>
          <p className="text-muted-foreground text-sm">
            {activeFilter === 'all'
              ? 'No pairs meet any strategy requirements at the moment.'
              : 'No pairs meet the selected strategy requirements.'}
          </p>
        </div>
      ) : (
        <div>
          {/* Desktop Table Header (lg and above) */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-9 gap-4 px-4 py-4 mb-4 border-b border-border/30 bg-background/50 rounded-lg">
              <div className="text-left text-xs font-medium text-muted-foreground tracking-wider font-serif">Pair</div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                24hr APR
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">TVL</div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                24h Volume
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                24h Fees
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Current Price
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Bin Step
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Strategy
              </div>
              {/* <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
              Yeet
            </div> */}
            </div>
          </div>

          {/* Responsive Rows/Cards with gaps */}
          <div className="space-y-4">
            {filteredPairs.slice(0, 20).map((pair, index) => (
              <LPPairCard key={pair.address} pair={pair} rank={index + 1} />
            ))}
          </div>

          {filteredPairs.length > 20 && (
            <div className="text-center pt-6 mt-6 border-t border-border/30">
              <p className="text-sm text-muted-foreground">
                Showing top 20 opportunities. {filteredPairs.length - 20} more available.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
