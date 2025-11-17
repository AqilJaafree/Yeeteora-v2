// src/components/account/dammv2-positions-ui.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { TrendingUp, Wallet, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { useGetDammV2Positions, useRemoveAllLiquidityAndClosePosition, type DammV2Position } from '../damm-v2/damm-v2-data-access'

interface DammV2PositionsProps {
  address: PublicKey
}

// Jupiter Lite API integration for token metadata
const tokenMetaCache: Record<string, TokenMeta> = {}

async function fetchTokenMeta(mint: string): Promise<TokenMeta | null> {
  if (tokenMetaCache[mint]) return tokenMetaCache[mint]

  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`)
    const data = await res.json()
    const token = data[0]
    tokenMetaCache[mint] = token
    return token
  } catch (error) {
    console.error('Error fetching token metadata:', error)
    return null
  }
}

interface TokenMeta {
  icon: string
  symbol: string
  usdPrice?: number
  decimals?: number
  [key: string]: unknown
}

// Helper to format balance with dynamic superscript for leading zeros after decimal
function formatBalanceWithSub(balance: number, decimals = 6) {
  if (balance === 0) return '0'
  const str = balance.toFixed(decimals)
  const match = str.match(/^([0-9]+)\.(0+)(\d*)$/)
  if (!match) return str
  const [, intPart, zeros, rest] = match
  return (
    <>
      {intPart}.0{sub(zeros.length)}
      {rest}
    </>
  )
  function sub(n: number | null) {
    return n && n > 1 ? (
      <sub style={{ fontSize: '0.7em', verticalAlign: 'baseline' }}>{n}</sub>
    ) : null
  }
}

// Helper to format USD value (compact format matching DLMM)
function formatNumber(num: number): string {
  if (!num || num === 0) return '$0'
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

// Position Item Component - unified component for card/table matching DLMM design
function PositionItem({ position }: { position: DammV2Position }) {
  const [tokenAMeta, setTokenAMeta] = useState<TokenMeta | null>(null)
  const [tokenBMeta, setTokenBMeta] = useState<TokenMeta | null>(null)
  const { publicKey } = useWallet()

  // Withdraw mutation
  const withdrawMutation = useRemoveAllLiquidityAndClosePosition({
    poolAddress: position.poolAddress,
  })

  useEffect(() => {
    fetchTokenMeta(position.poolState.tokenAMint.toString()).then(setTokenAMeta)
    fetchTokenMeta(position.poolState.tokenBMint.toString()).then(setTokenBMeta)
  }, [position])

  const handleWithdraw = async () => {
    if (!publicKey) return

    try {
      await withdrawMutation.mutateAsync({
        positionAddress: position.positionPubkey,
        positionNftAccount: position.nftMint,
      })
    } catch (error) {
      console.error('Withdraw error:', error)
    }
  }

  // Convert BN to number with decimals
  const tokenAAmount = position.tokenAAmount.toNumber() / Math.pow(10, tokenAMeta?.decimals || 9)
  const tokenBAmount = position.tokenBAmount.toNumber() / Math.pow(10, tokenBMeta?.decimals || 9)

  const feeAAmount = position.feeOwedA.toNumber() / Math.pow(10, tokenAMeta?.decimals || 9)
  const feeBAmount = position.feeOwedB.toNumber() / Math.pow(10, tokenBMeta?.decimals || 9)

  // Calculate USD values for position
  const tokenAValue = tokenAAmount * (tokenAMeta?.usdPrice || 0)
  const tokenBValue = tokenBAmount * (tokenBMeta?.usdPrice || 0)
  const totalValue = tokenAValue + tokenBValue

  // Calculate USD values for fees
  const feeAValue = feeAAmount * (tokenAMeta?.usdPrice || 0)
  const feeBValue = feeBAmount * (tokenBMeta?.usdPrice || 0)
  const totalFeesUSD = feeAValue + feeBValue

  // Calculate if position is in range by comparing sqrt prices directly
  const sqrtPrice = position.poolState.sqrtPrice
  const sqrtMinPrice = position.poolState.sqrtMinPrice
  const sqrtMaxPrice = position.poolState.sqrtMaxPrice
  const inRange = sqrtPrice.gte(sqrtMinPrice) && sqrtPrice.lte(sqrtMaxPrice)

  // Token pair display with icons matching DLMM design
  const TokenPairDisplay = () => (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center">
          {tokenAMeta && tokenAMeta.icon ? (
            <Image
              src={tokenAMeta.icon}
              alt={tokenAMeta.symbol}
              width={32}
              height={32}
              className="rounded-full border-2 border-border"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold">
              {tokenAMeta?.symbol?.slice(0, 2) || 'A'}
            </div>
          )}
          {tokenBMeta && tokenBMeta.icon ? (
            <Image
              src={tokenBMeta.icon}
              alt={tokenBMeta.symbol}
              width={32}
              height={32}
              className="rounded-full border-2 border-border -ml-2"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold -ml-2">
              {tokenBMeta?.symbol?.slice(0, 2) || 'B'}
            </div>
          )}
        </div>
        <div>
          <div className="text-white font-serif font-semibold">
            {tokenAMeta && tokenBMeta
              ? `${tokenAMeta.symbol} / ${tokenBMeta.symbol}`
              : 'Loading...'}
          </div>
          <div className="mt-1">
            <div className="text-primary font-medium font-serif text-xs bg-secondary-foreground px-2 py-1 rounded-[8px] inline-block">
              DAMM v2
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // Shared balance display
  const BalanceDisplay = ({ showIcons = false, size = 'text-lg' }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenAMeta && tokenAMeta.icon && (
          <Image
            src={tokenAMeta.icon}
            alt={tokenAMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {tokenAAmount === 0 ? '0' : formatBalanceWithSub(tokenAAmount, 6)}{' '}
          {tokenAMeta ? tokenAMeta.symbol : ''}
        </span>
        {tokenAMeta && tokenAAmount !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${(tokenAAmount * Number(tokenAMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenBMeta && tokenBMeta.icon && (
          <Image
            src={tokenBMeta.icon}
            alt={tokenBMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {tokenBAmount === 0 ? '0' : formatBalanceWithSub(tokenBAmount, 6)}{' '}
          {tokenBMeta ? tokenBMeta.symbol : ''}
        </span>
        {tokenBMeta && tokenBAmount !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${(tokenBAmount * Number(tokenBMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
    </>
  )

  // Shared fee display with USD values
  const FeeDisplay = ({ showIcons = false, size = 'text-lg' }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenAMeta && tokenAMeta.icon && (
          <Image
            src={tokenAMeta.icon}
            alt={tokenAMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {feeAAmount === 0 ? '0' : formatBalanceWithSub(feeAAmount, 6)}{' '}
          {tokenAMeta ? tokenAMeta.symbol : ''}
        </span>
        {tokenAMeta && feeAAmount !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${feeAValue.toFixed(2)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenBMeta && tokenBMeta.icon && (
          <Image
            src={tokenBMeta.icon}
            alt={tokenBMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {feeBAmount === 0 ? '0' : formatBalanceWithSub(feeBAmount, 6)}{' '}
          {tokenBMeta ? tokenBMeta.symbol : ''}
        </span>
        {tokenBMeta && feeBAmount !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${feeBValue.toFixed(2)})
          </span>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Desktop Table Row (lg and above) */}
      <div className="hidden lg:block">
        <div
          className="grid grid-cols-6 gap-4 p-6 border border-border rounded-[12px] hover:bg-primary/50 transition-all duration-200"
          style={{
            background: 'linear-gradient(180deg, rgba(51, 133, 255, 0.1) 0%, rgba(51, 133, 255, 0) 100%)',
          }}
        >
          {/* Pair Column */}
          <TokenPairDisplay />

          {/* Total Liquidity Column */}
          <div className="flex items-center justify-end">
            <div className="text-white font-medium font-serif text-sm">
              {formatNumber(totalValue)}
            </div>
          </div>

          {/* Current Balance Column */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-white font-medium font-serif text-sm mb-1">
                {tokenAAmount === 0 ? '0' : formatBalanceWithSub(tokenAAmount, 6)} {tokenAMeta?.symbol || ''}
                {tokenAMeta && tokenAAmount !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${(tokenAAmount * Number(tokenAMeta.usdPrice || 0)).toFixed(2)})
                  </span>
                )}
              </div>
              <div className="text-white font-medium font-serif text-sm">
                {tokenBAmount === 0 ? '0' : formatBalanceWithSub(tokenBAmount, 6)} {tokenBMeta?.symbol || ''}
                {tokenBMeta && tokenBAmount !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${(tokenBAmount * Number(tokenBMeta.usdPrice || 0)).toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Fees Generated Column */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-primary font-medium font-serif text-sm mb-2">
                {formatNumber(totalFeesUSD)}
              </div>
              <div className="text-white font-medium font-serif text-xs mb-1">
                {feeAAmount === 0 ? '0' : formatBalanceWithSub(feeAAmount, 6)} {tokenAMeta?.symbol || ''}
                {tokenAMeta && feeAAmount !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${feeAValue.toFixed(2)})
                  </span>
                )}
              </div>
              <div className="text-white font-medium font-serif text-xs">
                {feeBAmount === 0 ? '0' : formatBalanceWithSub(feeBAmount, 6)} {tokenBMeta?.symbol || ''}
                {tokenBMeta && feeBAmount !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${feeBValue.toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Range Status Column */}
          <div className="flex items-center justify-center">
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium font-serif ${
                inRange ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'
              }`}
            >
              {inRange ? 'In Range' : 'Out of Range'}
            </div>
          </div>

          {/* Action Buttons Column */}
          <div className="flex items-center justify-center">
            <Button
              onClick={handleWithdraw}
              disabled={withdrawMutation.isPending}
              className="w-full"
            >
              {withdrawMutation.isPending ? 'WITHDRAWING...' : 'WITHDRAW'}
            </Button>
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
          {/* Header with Pair Name */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                {tokenAMeta && tokenAMeta.icon ? (
                  <Image
                    src={tokenAMeta.icon}
                    alt={tokenAMeta.symbol}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-border"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold">
                    {tokenAMeta?.symbol?.slice(0, 2) || 'A'}
                  </div>
                )}
                {tokenBMeta && tokenBMeta.icon ? (
                  <Image
                    src={tokenBMeta.icon}
                    alt={tokenBMeta.symbol}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-border -ml-2"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold -ml-2">
                    {tokenBMeta?.symbol?.slice(0, 2) || 'B'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-white font-serif font-semibold text-lg">
                  {tokenAMeta && tokenBMeta
                    ? `${tokenAMeta.symbol} / ${tokenBMeta.symbol}`
                    : 'Loading...'}
                </div>
              </div>
            </div>
            <div className="mt-1">
              <div className="text-primary font-medium font-serif text-xs bg-secondary-foreground px-2 py-1 rounded-[8px] inline-block">
                DAMM v2
              </div>
            </div>
          </div>

          {/* Two Column Grid for Key Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Total Liquidity</div>
              <div className="text-primary font-medium font-serif">{formatNumber(totalValue)}</div>
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Status</div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium font-serif inline-block ${
                  inRange ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'
                }`}
              >
                {inRange ? 'In Range' : 'Out of Range'}
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Current Balance</div>
              <BalanceDisplay size="text-sm" />
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Fees Generated</div>
              <div className="text-primary font-medium font-serif text-sm mb-1">
                {formatNumber(totalFeesUSD)}
              </div>
              <FeeDisplay size="text-xs" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center pt-2 border-t border-border/30">
            <Button
              onClick={handleWithdraw}
              disabled={withdrawMutation.isPending}
              className="w-full"
            >
              {withdrawMutation.isPending ? 'WITHDRAWING...' : 'WITHDRAW'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// Main Component
export function DammV2Positions({ address }: DammV2PositionsProps) {
  const { connected, connecting } = useWallet()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Only run query when mounted and connected
  const query = useGetDammV2Positions({
    address: isMounted && connected ? address : new PublicKey('11111111111111111111111111111112'),
  })

  // Don't render anything until mounted
  if (!isMounted) {
    return (
      <div className="lg:px-[70px] px-4 mx-auto space-y-12">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">DAMM v2 Positions</h1>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="lg:px-[70px] px-4 mx-auto space-y-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">DAMM v2 Positions</h1>
        <span className="text-sm text-muted-foreground">
          {query.data ? `${query.data.length} positions found` : '0 positions found'}
        </span>
      </div>

      {/* Error Message */}
      {query.isError && (
        <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2">
            <Info className="w-5 h-5 text-primary" />
            <span className="text-primary">
              Error loading DAMM v2 positions: {query.error instanceof Error ? query.error.message : 'Unknown error'}. Please try refreshing.
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {query.isLoading && (
        <div className="rounded-lg shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sub-text">Loading positions...</p>
        </div>
      )}

      {/* Positions List */}
      {!query.isLoading && connected && query.data && query.data.length > 0 ? (
        <div>
          {/* Desktop Table Header (lg and above) */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-6 gap-4 px-4 py-4 mb-4 border-b border-border/30 bg-background/50 rounded-lg">
              <div className="text-left text-xs font-medium text-muted-foreground tracking-wider font-serif">Pair</div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Total Liquidity
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Current Balance
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Fees Generated
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Status
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Action
              </div>
            </div>
          </div>

          {/* Responsive Rows/Cards with gaps */}
          <div className="space-y-4">
            {query.data.map((position) => (
              <PositionItem key={position.positionPubkey.toString()} position={position} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Empty State */}
      {!query.isLoading && connected && query.data && query.data.length === 0 && (
        <div className="rounded-lg shadow-sm p-8 text-center">
          <TrendingUp className="w-12 h-12 text-white mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            No DAMM v2 Positions Found
          </h3>
          <p className="text-sub-text">
            You don&apos;t have any DAMM v2 positions yet.
          </p>
        </div>
      )}

      {/* Not Connected State */}
      {!connected && !connecting && (
        <div className="rounded-lg shadow-sm p-8 text-center">
          <Wallet className="w-12 h-12 text-white mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            Connect Your Wallet
          </h3>
          <p className="text-sub-text">
            Please connect your wallet to view your DAMM v2 positions.
          </p>
        </div>
      )}
    </div>
  )
}
