// src/components/account/unified-positions-ui.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { TrendingUp, Info, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { RangeBar } from './RangeBar'
import { useGetLPPositions, usePositionActions, type LBPairPositionInfo } from './lp-positions-data-access'
import { useGetDammV2Positions, useRemoveAllLiquidityAndClosePosition, type DammV2Position } from '../damm-v2/damm-v2-data-access'

interface UnifiedPositionsProps {
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

// Helper to format USD value (compact format)
function formatNumber(num: number): string {
  if (!num || num === 0) return '$0'
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

interface TokenMeta {
  icon: string
  symbol: string
  usdPrice?: number
  decimals?: number
  [key: string]: unknown
}

// Custom hook to fetch token meta for a position
function useTokenMetaForPosition(tokenAMint: string, tokenBMint: string) {
  const [tokenAMeta, setTokenAMeta] = useState<TokenMeta | null>(null)
  const [tokenBMeta, setTokenBMeta] = useState<TokenMeta | null>(null)

  useEffect(() => {
    if (tokenAMint) {
      fetchTokenMeta(tokenAMint).then(setTokenAMeta)
    }
    if (tokenBMint) {
      fetchTokenMeta(tokenBMint).then(setTokenBMeta)
    }
  }, [tokenAMint, tokenBMint])

  return { tokenAMeta, tokenBMeta }
}

// DLMM Position Item Component
function DLMMPositionItem({
  lbPairAddress,
  positionInfo,
  refreshPositions,
}: {
  lbPairAddress: string
  positionInfo: LBPairPositionInfo
  refreshPositions: () => void
}) {
  const pos = positionInfo.lbPairPositionsData[0]
  const pool = positionInfo.lbPair

  // Extract mint addresses
  const tokenXMint = pool.tokenXMint && typeof (pool.tokenXMint as { toBase58?: () => string }).toBase58 === 'function'
    ? (pool.tokenXMint as { toBase58: () => string }).toBase58()
    : String(pool.tokenXMint)
  const tokenYMint = pool.tokenYMint && typeof (pool.tokenYMint as { toBase58?: () => string }).toBase58 === 'function'
    ? (pool.tokenYMint as { toBase58: () => string }).toBase58()
    : String(pool.tokenYMint)

  const { tokenAMeta: tokenXMeta, tokenBMeta: tokenYMeta } = useTokenMetaForPosition(tokenXMint, tokenYMint)

  // Use shared hook for actions
  const {
    closing,
    claiming,
    handleCloseAndWithdraw,
    handleClaimFees,
    publicKey,
  } = usePositionActions(lbPairAddress, pos, refreshPositions)

  // Calculate position data
  const binData = pos.positionData.positionBinData as Array<{ binId: number; pricePerToken?: string | number }>
  const minPrice =
    binData && binData.length > 0 && binData[0].pricePerToken !== undefined
      ? Number(binData[0].pricePerToken)
      : 0
  const maxPrice =
    binData && binData.length > 0 && binData[binData.length - 1].pricePerToken !== undefined
      ? Number(binData[binData.length - 1].pricePerToken)
      : 0
  let currentPrice = 0
  if (binData && binData.length > 0 && pool.activeId !== undefined) {
    const activeBin = binData.find((b) => b.binId === pool.activeId)
    if (activeBin && activeBin.pricePerToken !== undefined) {
      currentPrice = Number(activeBin.pricePerToken)
    } else {
      const mid = Math.floor(binData.length / 2)
      currentPrice = binData[mid] && binData[mid].pricePerToken !== undefined
        ? Number(binData[mid].pricePerToken)
        : 0
    }
  }

  // Get decimals from token metadata
  const xDecimals = tokenXMeta?.decimals ?? 0
  const yDecimals = tokenYMeta?.decimals ?? 0

  const xBalance = pos.positionData.totalXAmount
    ? Number(pos.positionData.totalXAmount) / Math.pow(10, xDecimals)
    : 0
  const yBalance = pos.positionData.totalYAmount
    ? Number(pos.positionData.totalYAmount) / Math.pow(10, yDecimals)
    : 0
  const xFee = pos.positionData.feeX
    ? Number(pos.positionData.feeX) / Math.pow(10, xDecimals)
    : 0
  const yFee = pos.positionData.feeY
    ? Number(pos.positionData.feeY) / Math.pow(10, yDecimals)
    : 0
  const totalLiquidityUSD =
    tokenXMeta && tokenYMeta
      ? xBalance * Number(tokenXMeta.usdPrice || 0) +
        yBalance * Number(tokenYMeta.usdPrice || 0)
      : 0
  const claimedFeeX = pos.positionData.totalClaimedFeeXAmount
    ? Number(pos.positionData.totalClaimedFeeXAmount) / Math.pow(10, xDecimals)
    : 0
  const claimedFeeY = pos.positionData.totalClaimedFeeYAmount
    ? Number(pos.positionData.totalClaimedFeeYAmount) / Math.pow(10, yDecimals)
    : 0
  const claimedFeesUSD =
    tokenXMeta && tokenYMeta
      ? claimedFeeX * Number(tokenXMeta.usdPrice || 0) +
        claimedFeeY * Number(tokenYMeta.usdPrice || 0)
      : 0

  // Token pair display with icons
  const TokenPairDisplay = () => (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center">
          {tokenXMeta && tokenXMeta.icon ? (
            <Image
              src={tokenXMeta.icon}
              alt={tokenXMeta.symbol}
              width={32}
              height={32}
              className="rounded-full border-2 border-border"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold">
              {tokenXMeta?.symbol?.slice(0, 2) || 'X'}
            </div>
          )}
          {tokenYMeta && tokenYMeta.icon ? (
            <Image
              src={tokenYMeta.icon}
              alt={tokenYMeta.symbol}
              width={32}
              height={32}
              className="rounded-full border-2 border-border -ml-2"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold -ml-2">
              {tokenYMeta?.symbol?.slice(0, 2) || 'Y'}
            </div>
          )}
        </div>
        <div>
          <div className="text-white font-serif font-semibold">
            {tokenXMeta && tokenYMeta
              ? `${tokenXMeta.symbol} / ${tokenYMeta.symbol}`
              : 'Loading...'}
          </div>
          <div className="mt-1">
            <div className="text-blue-400 font-medium font-serif text-xs bg-blue-500/20 px-2 py-1 rounded-[8px] inline-block">
              DLMM
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
        {showIcons && tokenXMeta && tokenXMeta.icon && (
          <Image
            src={tokenXMeta.icon}
            alt={tokenXMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {xBalance === 0 ? '0' : formatBalanceWithSub(xBalance, 6)}{' '}
          {tokenXMeta ? tokenXMeta.symbol : ''}
        </span>
        {tokenXMeta && xBalance !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${(xBalance * Number(tokenXMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenYMeta && tokenYMeta.icon && (
          <Image
            src={tokenYMeta.icon}
            alt={tokenYMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {yBalance === 0 ? '0' : formatBalanceWithSub(yBalance, 6)}{' '}
          {tokenYMeta ? tokenYMeta.symbol : ''}
        </span>
        {tokenYMeta && yBalance !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${(yBalance * Number(tokenYMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
    </>
  )

  // Shared fee display
  const FeeDisplay = ({ showIcons = false, size = 'text-lg' }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenXMeta && tokenXMeta.icon && (
          <Image
            src={tokenXMeta.icon}
            alt={tokenXMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {xFee === 0 ? '0' : formatBalanceWithSub(xFee, 6)}{' '}
          {tokenXMeta ? tokenXMeta.symbol : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenYMeta && tokenYMeta.icon && (
          <Image
            src={tokenYMeta.icon}
            alt={tokenYMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-serif font-semibold ${size}`}>
          {yFee === 0 ? '0' : formatBalanceWithSub(yFee, 6)}{' '}
          {tokenYMeta ? tokenYMeta.symbol : ''}
        </span>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop Table Row (lg and above) */}
      <div className="hidden lg:block">
        <div
          className="grid grid-cols-7 gap-4 p-6 border border-border rounded-[12px] hover:bg-primary/50 transition-all duration-200"
          style={{
            background: 'linear-gradient(180deg, rgba(51, 133, 255, 0.1) 0%, rgba(51, 133, 255, 0) 100%)',
          }}
        >
          {/* Pair Column */}
          <TokenPairDisplay />

          {/* Total Liquidity Column */}
          <div className="flex items-center justify-end">
            <div className="text-white font-medium font-serif text-sm">
              {formatNumber(totalLiquidityUSD)}
            </div>
          </div>

          {/* Fees Earned (Claimed) Column */}
          <div className="flex items-center justify-end">
            <div className="text-center">
              <div className="text-white font-medium font-serif text-sm mb-1">
                {claimedFeesUSD === 0 ? '$0' : formatNumber(claimedFeesUSD)}
              </div>
            </div>
          </div>

          {/* Current Balance Column */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-white font-medium font-serif text-sm mb-1">
                {xBalance === 0 ? '0' : formatBalanceWithSub(xBalance, 6)} {tokenXMeta?.symbol || ''}
                {tokenXMeta && xBalance !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${(xBalance * Number(tokenXMeta.usdPrice || 0)).toFixed(2)})
                  </span>
                )}
              </div>
              <div className="text-white font-medium font-serif text-sm">
                {yBalance === 0 ? '0' : formatBalanceWithSub(yBalance, 6)} {tokenYMeta?.symbol || ''}
                {tokenYMeta && yBalance !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${(yBalance * Number(tokenYMeta.usdPrice || 0)).toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Unclaimed Fees Column */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-white font-medium font-serif text-sm mb-1">
                {xFee === 0 ? '0' : formatBalanceWithSub(xFee, 6)} {tokenXMeta?.symbol || ''}
              </div>
              <div className="text-white font-medium font-serif text-sm">
                {yFee === 0 ? '0' : formatBalanceWithSub(yFee, 6)} {tokenYMeta?.symbol || ''}
              </div>
            </div>
          </div>

          {/* Range Column */}
          <div className="flex items-center justify-center">
            <div className="w-full">
              <RangeBar min={minPrice} max={maxPrice} current={currentPrice} />
            </div>
          </div>

          {/* Action Buttons Column */}
          <div className="flex items-center justify-center">
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={handleClaimFees}
                disabled={claiming || !publicKey}
              >
                {claiming ? 'CLAIMING...' : 'CLAIM FEES'}
              </Button>
              <Button
                onClick={handleCloseAndWithdraw}
                disabled={closing || !publicKey}
              >
                {closing ? 'CLOSING...' : 'CLOSE POSITION'}
              </Button>
            </div>
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
          {/* Header with Pair Name and Type Badge */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                {tokenXMeta && tokenXMeta.icon ? (
                  <Image
                    src={tokenXMeta.icon}
                    alt={tokenXMeta.symbol}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-border"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold">
                    {tokenXMeta?.symbol?.slice(0, 2) || 'X'}
                  </div>
                )}
                {tokenYMeta && tokenYMeta.icon ? (
                  <Image
                    src={tokenYMeta.icon}
                    alt={tokenYMeta.symbol}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-border -ml-2"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center text-xs font-bold -ml-2">
                    {tokenYMeta?.symbol?.slice(0, 2) || 'Y'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-white font-serif font-semibold text-lg">
                  {tokenXMeta && tokenYMeta
                    ? `${tokenXMeta.symbol} / ${tokenYMeta.symbol}`
                    : 'Loading...'}
                </div>
              </div>
            </div>
            <div className="mt-1">
              <div className="text-blue-400 font-medium font-serif text-xs bg-blue-500/20 px-2 py-1 rounded-[8px] inline-block">
                DLMM
              </div>
            </div>
          </div>

          {/* Two Column Grid for Key Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Total Liquidity</div>
              <div className="text-primary font-medium font-serif">{formatNumber(totalLiquidityUSD)}</div>
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Claimed Fees</div>
              <div className="text-white font-medium font-serif">{formatNumber(claimedFeesUSD)}</div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Current Balance</div>
              <BalanceDisplay size="text-sm" />
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground font-serif mb-1">Unclaimed Fees</div>
              <FeeDisplay size="text-sm" />
            </div>
          </div>

          {/* Range */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground font-serif mb-2 text-center">Range</div>
            <RangeBar min={minPrice} max={maxPrice} current={currentPrice} />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-2 pt-2 border-t border-border/30">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleClaimFees}
              disabled={claiming || !publicKey}
            >
              {claiming ? 'CLAIMING...' : 'CLAIM FEES'}
            </Button>
            <Button
              className="flex-1"
              onClick={handleCloseAndWithdraw}
              disabled={closing || !publicKey}
            >
              {closing ? 'CLOSING...' : 'CLOSE POSITION'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// DAMM v2 Position Item Component
function DammV2PositionItem({
  position,
  refreshPositions,
}: {
  position: DammV2Position
  refreshPositions: () => void
}) {
  const { tokenAMeta, tokenBMeta } = useTokenMetaForPosition(
    position.poolState.tokenAMint.toString(),
    position.poolState.tokenBMint.toString()
  )
  const { publicKey } = useWallet()

  // Withdraw mutation
  const withdrawMutation = useRemoveAllLiquidityAndClosePosition({
    poolAddress: position.poolAddress,
  })

  const handleWithdraw = async () => {
    if (!publicKey) return

    try {
      await withdrawMutation.mutateAsync({
        positionAddress: position.positionPubkey,
        positionNftAccount: position.nftMint,
      })
      refreshPositions()
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

  // Token pair display with icons
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
            <div className="text-purple-400 font-medium font-serif text-xs bg-purple-500/20 px-2 py-1 rounded-[8px] inline-block">
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

  return (
    <>
      {/* Desktop Table Row (lg and above) */}
      <div className="hidden lg:block">
        <div
          className="grid grid-cols-7 gap-4 p-6 border border-border rounded-[12px] hover:bg-primary/50 transition-all duration-200"
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

          {/* Fees Earned (Combined for DAMM v2) Column */}
          <div className="flex items-center justify-end">
            <div className="text-center">
              <div className="text-primary font-medium font-serif text-sm mb-1">
                {totalFeesUSD === 0 ? '$0' : formatNumber(totalFeesUSD)}
              </div>
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

          {/* Unclaimed Fees Column */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-white font-medium font-serif text-sm mb-1">
                {feeAAmount === 0 ? '0' : formatBalanceWithSub(feeAAmount, 6)} {tokenAMeta?.symbol || ''}
              </div>
              <div className="text-white font-medium font-serif text-sm">
                {feeBAmount === 0 ? '0' : formatBalanceWithSub(feeBAmount, 6)} {tokenBMeta?.symbol || ''}
              </div>
            </div>
          </div>

          {/* Status/Range Column */}
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
              disabled={withdrawMutation.isPending || !publicKey}
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
          {/* Header with Pair Name and Type Badge */}
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
              <div className="text-purple-400 font-medium font-serif text-xs bg-purple-500/20 px-2 py-1 rounded-[8px] inline-block">
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
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center pt-2 border-t border-border/30">
            <Button
              onClick={handleWithdraw}
              disabled={withdrawMutation.isPending || !publicKey}
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

// Main Unified Positions Component
export function UnifiedPositions({ address }: UnifiedPositionsProps) {
  const { connected, connecting } = useWallet()
  const [isMounted, setIsMounted] = useState(false)

  // Ensure component is mounted before running queries
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Only run queries when mounted and connected
  const dlmmQuery = useGetLPPositions({
    address: isMounted && connected ? address : new PublicKey('11111111111111111111111111111112'),
  })

  const dammV2Query = useGetDammV2Positions({
    address: isMounted && connected ? address : new PublicKey('11111111111111111111111111111112'),
  })

  const refreshPositions = () => {
    if (isMounted && connected) {
      dlmmQuery.refetch()
      dammV2Query.refetch()
    }
  }

  // Convert Map to Array for DLMM positions
  const dlmmPositionsArray = dlmmQuery.data ? Array.from(dlmmQuery.data.entries()) : []
  const dammV2PositionsArray = dammV2Query.data || []

  // Calculate total positions count
  const totalPositions = dlmmPositionsArray.length + dammV2PositionsArray.length

  // Determine loading state
  const isLoading = dlmmQuery.isLoading || dammV2Query.isLoading
  const hasError = dlmmQuery.isError || dammV2Query.isError

  // Don't render anything until mounted
  if (!isMounted) {
    return (
      <div className="lg:px-[70px] px-4 mx-auto space-y-12">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Your Positions</h1>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="lg:px-[70px] px-4 mx-auto space-y-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Your Positions</h1>
        <span className="text-sm text-muted-foreground">{totalPositions} positions found</span>
      </div>

      {/* Error Message */}
      {hasError && (
        <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2">
            <Info className="w-5 h-5 text-primary" />
            <span className="text-primary">
              Error loading positions. Please try refreshing.
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-lg shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sub-text">Loading positions...</p>
        </div>
      )}

      {/* Positions List */}
      {!isLoading && connected && totalPositions > 0 ? (
        <div>
          {/* Desktop Table Header (lg and above) */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-7 gap-4 px-4 py-4 mb-4 border-b border-border/30 bg-background/50 rounded-lg">
              <div className="text-left text-xs font-medium text-muted-foreground tracking-wider font-serif">Pair</div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Total Liquidity
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Fees Earned
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Current Balance
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Unclaimed Fees
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Range/Status
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                Actions
              </div>
            </div>
          </div>

          {/* Responsive Rows/Cards with gaps */}
          <div className="space-y-4">
            {/* DLMM Positions */}
            {dlmmPositionsArray.map(([lbPairAddress, positionInfo]) => (
              <DLMMPositionItem
                key={lbPairAddress}
                lbPairAddress={lbPairAddress}
                positionInfo={positionInfo}
                refreshPositions={refreshPositions}
              />
            ))}

            {/* DAMM v2 Positions */}
            {dammV2PositionsArray.map((position) => (
              <DammV2PositionItem
                key={position.positionPubkey.toString()}
                position={position}
                refreshPositions={refreshPositions}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Empty State */}
      {!isLoading && connected && totalPositions === 0 && (
        <div className="rounded-lg shadow-sm p-8 text-center">
          <TrendingUp className="w-12 h-12 text-white mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            No Positions Found
          </h3>
          <p className="text-sub-text">
            You don&apos;t have any liquidity positions yet.
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
            Please connect your wallet to view your positions.
          </p>
        </div>
      )}
    </div>
  )
}
