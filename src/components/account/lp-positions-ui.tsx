// src/components/account/lp-positions-ui.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { RangeBar } from "./RangeBar";
import {
  TrendingUp,
  Info,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useGetLPPositions, usePositionActions, type PositionType, type LBPairPositionInfo } from './lp-positions-data-access';
import type { PositionInfo } from '@meteora-ag/dlmm';

interface LPPositionsProps {
  address: PublicKey;
}

// Jupiter Lite API integration for token metadata
const tokenMetaCache: Record<string, TokenMeta> = {};

async function fetchTokenMeta(mint: string) {
  if (tokenMetaCache[mint]) return tokenMetaCache[mint];
  
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
    const data = await res.json();
    const token = data[0];
    tokenMetaCache[mint] = token;
    return token;
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    return null;
  }
}

// Helper to format balance with dynamic superscript for leading zeros after decimal
function formatBalanceWithSub(balance: number, decimals = 6) {
  if (balance === 0) return "0";
  const str = balance.toFixed(decimals);
  const match = str.match(/^([0-9]+)\.(0+)(\d*)$/);
  if (!match) return str;
  const [, intPart, zeros, rest] = match;
  return (
    <>
      {intPart}.0{sub(zeros.length)}
      {rest}
    </>
  );
  function sub(n: number | null) {
    return n && n > 1 ? (
      <sub style={{ fontSize: "0.7em", verticalAlign: "baseline" }}>{n}</sub>
    ) : null;
  }
}

interface TokenMeta {
  icon: string;
  symbol: string;
  usdPrice?: number;
  [key: string]: unknown;
}

interface PoolWithActiveId {
  activeId?: number;
  tokenXMint?: unknown;
  tokenYMint?: unknown;
  [key: string]: unknown;
}

type BinData = { binId: number; pricePerToken?: string | number };

type MaybeBase58 = { toBase58?: () => string };

// Custom hook to fetch token meta for a pool
function useTokenMeta(pool: PoolWithActiveId) {
  const [tokenXMeta, setTokenXMeta] = React.useState<TokenMeta | null>(null);
  const [tokenYMeta, setTokenYMeta] = React.useState<TokenMeta | null>(null);
  
  React.useEffect(() => {
    if (!pool) return;
    const xMint = pool.tokenXMint && typeof (pool.tokenXMint as MaybeBase58).toBase58 === 'function'
      ? (pool.tokenXMint as MaybeBase58).toBase58!()
      : pool.tokenXMint;
    const yMint = pool.tokenYMint && typeof (pool.tokenYMint as MaybeBase58).toBase58 === 'function'
      ? (pool.tokenYMint as MaybeBase58).toBase58!()
      : pool.tokenYMint;
    
    if (xMint) {
      fetchTokenMeta(xMint as string).then(setTokenXMeta);
    }
    if (yMint) {
      fetchTokenMeta(yMint as string).then(setTokenYMeta);
    }
  }, [pool]);
  
  return { tokenXMeta, tokenYMeta };
}

type PositionInfoLike = PositionInfo

// Custom hook for extracting and formatting position display data
function usePositionDisplayData(
  pos: PositionType,
  pool: PoolWithActiveId,
  tokenXMeta: TokenMeta | null,
  tokenYMeta: TokenMeta | null,
  positionInfo?: PositionInfoLike
) {
  const binData = pos.positionData.positionBinData as BinData[];
  const minPrice =
    binData && binData.length > 0 && binData[0].pricePerToken !== undefined
      ? Number(binData[0].pricePerToken)
      : 0;
  const maxPrice =
    binData && binData.length > 0 && binData[binData.length - 1].pricePerToken !== undefined
      ? Number(binData[binData.length - 1].pricePerToken)
      : 0;
  let currentPrice = 0;
  if (binData && binData.length > 0 && pool.activeId !== undefined) {
    const activeBin = binData.find((b: BinData) => b.binId === pool.activeId);
    if (activeBin && activeBin.pricePerToken !== undefined) {
      currentPrice = Number(activeBin.pricePerToken);
    } else {
      const mid = Math.floor(binData.length / 2);
      currentPrice = binData[mid] && binData[mid].pricePerToken !== undefined
        ? Number(binData[mid].pricePerToken)
        : 0;
    }
  }
  
  // Improved fallback for decimals
  let xDecimals: number = 0;
  if (typeof pos.tokenXDecimals === 'number') xDecimals = pos.tokenXDecimals;
  else if (typeof pool.tokenXDecimals === 'number') xDecimals = pool.tokenXDecimals;
  else if (typeof positionInfo?.tokenX?.mint?.decimals === 'number') xDecimals = positionInfo.tokenX.mint.decimals;
  else xDecimals = 0;

  let yDecimals: number = 0;
  if (typeof pos.tokenYDecimals === 'number') yDecimals = pos.tokenYDecimals;
  else if (typeof pool.tokenYDecimals === 'number') yDecimals = pool.tokenYDecimals;
  else if (typeof positionInfo?.tokenY?.mint?.decimals === 'number') yDecimals = positionInfo.tokenY.mint.decimals;
  else yDecimals = 0;

  const xBalance = pos.positionData.totalXAmount
    ? Number(pos.positionData.totalXAmount) / Math.pow(10, xDecimals)
    : 0;
  const yBalance = pos.positionData.totalYAmount
    ? Number(pos.positionData.totalYAmount) / Math.pow(10, yDecimals)
    : 0;
  const xFee = pos.positionData.feeX
    ? Number(pos.positionData.feeX) / Math.pow(10, xDecimals)
    : 0;
  const yFee = pos.positionData.feeY
    ? Number(pos.positionData.feeY) / Math.pow(10, yDecimals)
    : 0;
  const totalLiquidityUSD =
    tokenXMeta && tokenYMeta
      ? xBalance * Number(tokenXMeta.usdPrice || 0) +
        yBalance * Number(tokenYMeta.usdPrice || 0)
      : 0;
  const claimedFeeX = pos.positionData.totalClaimedFeeXAmount
    ? Number(pos.positionData.totalClaimedFeeXAmount) / Math.pow(10, xDecimals)
    : 0;
  const claimedFeeY = pos.positionData.totalClaimedFeeYAmount
    ? Number(pos.positionData.totalClaimedFeeYAmount) / Math.pow(10, yDecimals)
    : 0;
  const claimedFeesUSD =
    tokenXMeta && tokenYMeta
      ? claimedFeeX * Number(tokenXMeta.usdPrice || 0) +
        claimedFeeY * Number(tokenYMeta.usdPrice || 0)
      : 0;
  return {
    minPrice,
    maxPrice,
    currentPrice,
    xBalance,
    yBalance,
    xFee,
    yFee,
    totalLiquidityUSD,
    claimedFeesUSD,
    xDecimals,
    yDecimals,
    claimedFeeX,
    claimedFeeY,
  };
}

// Position Item Component - unified component for card/table
function PositionItem({
  lbPairAddress,
  positionInfo,
  refreshPositions,
}: {
  lbPairAddress: string;
  positionInfo: LBPairPositionInfo;
  refreshPositions: () => void;
}) {
  const pos = positionInfo.lbPairPositionsData[0];
  const pool = positionInfo.lbPair;
  const { tokenXMeta, tokenYMeta } = useTokenMeta(pool);
  
  // Use shared hook for actions
  const {
    closing,
    claiming,
    handleCloseAndWithdraw,
    handleClaimFees,
    publicKey,
  } = usePositionActions(lbPairAddress, pos, refreshPositions);
  
  // Use shared hook for display data
  const {
    minPrice,
    maxPrice,
    currentPrice,
    xBalance,
    yBalance,
    xFee,
    yFee,
    totalLiquidityUSD,
    claimedFeesUSD,
  } = usePositionDisplayData(pos, pool, tokenXMeta, tokenYMeta, positionInfo);

  const formatNumber = (num: number) => {
    if (!num || num === 0) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  // Determine strategy for the position (similar to Meteora strategy filter)
  const getPositionStrategy = (): string | null => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    
    // Check if it's a SOL pair
    const tokenXMint = pool.tokenXMint && typeof (pool.tokenXMint as { toBase58?: () => string }).toBase58 === 'function'
      ? (pool.tokenXMint as { toBase58: () => string }).toBase58()
      : pool.tokenXMint
    const tokenYMint = pool.tokenYMint && typeof (pool.tokenYMint as { toBase58?: () => string }).toBase58 === 'function'
      ? (pool.tokenYMint as { toBase58: () => string }).toBase58()
      : pool.tokenYMint
      
    const isSOLPair = tokenXMint === SOL_MINT || tokenYMint === SOL_MINT
    
    if (isSOLPair && totalLiquidityUSD > 1_000_000) {
      return 'One Sided'
    }
    
    // Return null if no specific strategy applies
    return null
  }

  // Token pair display with icons matching Meteora design
  const TokenPairDisplay = () => (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center">
          {tokenXMeta && (
            <Image
              src={tokenXMeta.icon}
              alt={tokenXMeta.symbol}
              width={32}
              height={32}
              className="rounded-full border-2 border-border"
              unoptimized
            />
          )}
          {tokenYMeta && (
            <Image
              src={tokenYMeta.icon}
              alt={tokenYMeta.symbol}
              width={32}
              height={32}
              className="rounded-full border-2 border-border -ml-2"
              unoptimized 
            />
          )}
        </div>
        <div>
          <div className="text-white font-serif font-semibold">
            {tokenXMeta && tokenYMeta
              ? `${tokenXMeta.symbol} / ${tokenYMeta.symbol}`
              : "Loading..."}
          </div>
          {getPositionStrategy() && (
            <div className="mt-1">
              <div className="text-primary font-medium font-serif text-xs bg-secondary-foreground px-2 py-1 rounded-[8px] inline-block">
                {getPositionStrategy()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Shared balance display for responsive
  const BalanceDisplay = ({ showIcons = false, size = "text-lg" }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenXMeta && (
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
          {xBalance === 0 ? "0" : formatBalanceWithSub(xBalance, 6)}{" "}
          {tokenXMeta ? tokenXMeta.symbol : ""}
        </span>
        {tokenXMeta && xBalance !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${(xBalance * Number(tokenXMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenYMeta && (
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
          {yBalance === 0 ? "0" : formatBalanceWithSub(yBalance, 6)}{" "}
          {tokenYMeta ? tokenYMeta.symbol : ""}
        </span>
        {tokenYMeta && yBalance !== 0 && (
          <span className="text-xs text-sub-text ml-1 font-serif">
            (${(yBalance * Number(tokenYMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
    </>
  );

  // Shared fee display for responsive
  const FeeDisplay = ({ showIcons = false, size = "text-lg" }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenXMeta && (
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
          {xFee === 0 ? "0" : formatBalanceWithSub(xFee, 6)}{" "}
          {tokenXMeta ? tokenXMeta.symbol : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenYMeta && (
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
          {yFee === 0 ? "0" : formatBalanceWithSub(yFee, 6)}{" "}
          {tokenYMeta ? tokenYMeta.symbol : ""}
        </span>
      </div>
    </>
  );

  // Return the new Meteora-style layout regardless of viewMode
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
                {claimedFeesUSD === 0 ? "$0" : formatNumber(claimedFeesUSD)}
              </div>
            </div>
          </div>

          {/* Current Balance Column */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-white font-medium font-serif text-sm mb-1">
                {xBalance === 0 ? "0" : formatBalanceWithSub(xBalance, 6)} {tokenXMeta?.symbol || ""}
                {tokenXMeta && xBalance !== 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (${(xBalance * Number(tokenXMeta.usdPrice || 0)).toFixed(2)})
                  </span>
                )}
              </div>
              <div className="text-white font-medium font-serif text-sm">
                {yBalance === 0 ? "0" : formatBalanceWithSub(yBalance, 6)} {tokenYMeta?.symbol || ""}
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
                {xFee === 0 ? "0" : formatBalanceWithSub(xFee, 6)} {tokenXMeta?.symbol || ""}
              </div>
              <div className="text-white font-medium font-serif text-sm">
                {yFee === 0 ? "0" : formatBalanceWithSub(yFee, 6)} {tokenYMeta?.symbol || ""}
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
                {claiming ? "CLAIMING..." : "CLAIM FEES"}
              </Button>
              <Button
                onClick={handleCloseAndWithdraw}
                disabled={closing || !publicKey}
              >
                {closing ? "CLOSING..." : "CLOSE POSITION"}
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
          {/* Header with Pair Name and Position Tag */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                {tokenXMeta && (
                  <Image
                    src={tokenXMeta.icon}
                    alt={tokenXMeta.symbol}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-border"
                    unoptimized
                  />
                )}
                {tokenYMeta && (
                  <Image
                    src={tokenYMeta.icon}
                    alt={tokenYMeta.symbol}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-border -ml-2"
                    unoptimized 
                  />
                )}
              </div>
              <div>
                <div className="text-white font-serif font-semibold text-lg">
                  {tokenXMeta && tokenYMeta
                    ? `${tokenXMeta.symbol} / ${tokenYMeta.symbol}`
                    : "Loading..."}
                </div>
              </div>
            </div>
            {getPositionStrategy() && (
            <div className="mt-1">
              <div className="text-primary font-medium font-serif text-xs bg-secondary-foreground px-2 py-1 rounded-[8px] inline-block">
                {getPositionStrategy()}
              </div>
            </div>
          )}
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
              {claiming ? "CLAIMING..." : "CLAIM FEES"}
            </Button>
            <Button
            className="flex-1"
              onClick={handleCloseAndWithdraw}
              disabled={closing || !publicKey}
            >
              {closing ? "CLOSING..." : "CLOSE POSITION"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function LPPositions({ address }: LPPositionsProps) {
  const { connected, connecting } = useWallet();
  const [isMounted, setIsMounted] = useState(false);
  
  // Ensure component is mounted before running queries
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only run query when mounted and connected
  const query = useGetLPPositions({
    address: isMounted && connected ? address : new PublicKey('11111111111111111111111111111112')
  });

  const refreshPositions = () => {
    if (isMounted && connected) {
      query.refetch();
    }
  };

  // Convert Map to Array for rendering
  const positionsArray = query.data ? Array.from(query.data.entries()) : [];

  // Don't render anything until mounted
  if (!isMounted) {
    return (
      <div className="lg:px-[70px] px-4 mx-auto space-y-12">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Your Positions</h1>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:px-[70px] px-4 mx-auto space-y-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Your Positions</h1>
        <span className="text-sm text-muted-foreground">{positionsArray.length} positions found</span>
      </div>

        {/* Error Message */}
        {query.isError && (
          <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <Info className="w-5 h-5 text-primary" />
              <span className="text-primary">
                Error loading LP positions: {query.error instanceof Error ? query.error.message : 'Unknown error'}. Please try refreshing.
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
        {!query.isLoading && connected && positionsArray.length > 0 ? (
          <div>
            {/* Desktop Table Header (lg and above) */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-7 gap-4 px-4 py-4 mb-4 border-b border-border/30 bg-background/50 rounded-lg">
                <div className="text-left text-xs font-medium text-muted-foreground tracking-wider font-serif">Pair</div>
                <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                  Total Liquidity
                </div>
                <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                  Fees Earned (Claimed)
                </div>
                <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                  Current Balance
                </div>
                <div className="text-right text-xs font-medium text-muted-foreground tracking-wider font-serif">
                  Unclaimed Fees
                </div>
                <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                  Range
                </div>
                <div className="text-center text-xs font-medium text-muted-foreground tracking-wider font-serif">
                  Actions
                </div>
              </div>
            </div>

            {/* Responsive Rows/Cards with gaps */}
            <div className="space-y-4">
              {positionsArray.map(([lbPairAddress, positionInfo]) => (
                <PositionItem
                  key={lbPairAddress}
                  lbPairAddress={lbPairAddress}
                  positionInfo={positionInfo}
                  refreshPositions={refreshPositions}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Empty State */}
        {!query.isLoading && connected && positionsArray.length === 0 && (
          <div className="rounded-lg shadow-sm p-8 text-center">
            <TrendingUp className="w-12 h-12 text-white mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No Positions Found
            </h3>
            <p className="text-sub-text">
              You don&apos;t have any LB pair positions yet.
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
              Please connect your wallet to view your LB pair positions.
            </p>
          </div>
        )}
      </div>
  );
}