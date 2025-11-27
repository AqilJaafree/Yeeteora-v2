// src/components/account/lp-positions-data-access.tsx
'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Connection } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import DLMM from '@meteora-ag/dlmm'
import BN from 'bn.js'
import { toast } from 'sonner'

// Standard SendOptions for consistent transaction handling
const SEND_OPTIONS = {
  skipPreflight: false,
  preflightCommitment: 'confirmed' as const,
  maxRetries: 3,
}

// Import the actual types from DLMM library
import type { PositionInfo } from '@meteora-ag/dlmm'

// Export the position type to match the DLMM library structure
export type PositionType = {
  publicKey: PublicKey
  positionData: {
    lowerBinId: number
    upperBinId: number
    lastUpdatedAt: BN
    totalXAmount: string
    totalYAmount: string
    feeX: BN
    feeY: BN
    totalClaimedFeeXAmount: BN
    totalClaimedFeeYAmount: BN
    positionBinData: Array<{
      binId: number
      price: string
      pricePerToken: string
      binXAmount: string
      binYAmount: string
      binLiquidity: string
      positionLiquidity: string
      positionXAmount: string
      positionYAmount: string
      positionFeeXAmount: string
      positionFeeYAmount: string
    }>
  }
  tokenXDecimals?: number
  tokenYDecimals?: number
}

// Use the actual PositionInfo type from DLMM library
export type LBPairPositionInfo = PositionInfo

// Hook to get all LP positions for a wallet using the working sample pattern
export function useGetLPPositions({ address }: { address: PublicKey }) {
  const { connection } = useConnection()

  return useQuery({
    queryKey: ['get-lp-positions', { endpoint: connection.rpcEndpoint, address: address.toString() }],
    queryFn: async (): Promise<Map<string, PositionInfo>> => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('🚀 Starting LP position discovery...')
        }
        
        // Use custom RPC for heavy operations if available
        const customRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
          process.env.NEXT_PUBLIC_Custom_RPC_URL ||
          process.env.NEXT_PUBLIC_HEAVY_RPC_URL ||
          connection.rpcEndpoint
        
        // Create optimized connection for heavy operations
        const discoveryConnection = customRpcUrl !== connection.rpcEndpoint
          ? new Connection(
              customRpcUrl,
              {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000,
              }
            )
          : connection
        
        // Test connection first
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log('🧪 Testing RPC connection...')
          }
          await discoveryConnection.getVersion()
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ RPC connection successful')
          }
        } catch (rpcError: unknown) {
          console.error('❌ RPC connection test failed:', rpcError instanceof Error ? rpcError.message : 'Unknown RPC error')
          throw new Error(`RPC connection failed: ${rpcError instanceof Error ? rpcError.message : 'Unknown RPC error'}`)
        }
        
        // Get all positions using the working DLMM method
        const userPositions = await DLMM.getAllLbPairPositionsByUser(
          discoveryConnection,
          address
        )
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`🎉 DISCOVERY COMPLETE! Found ${userPositions.size} position(s)`)
        }
        
        return userPositions
        
      } catch (error: unknown) {
        // Only log detailed error info in development
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ LP position discovery failed:', error)
        }
        
        // Enhanced error handling and guidance
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
          if (process.env.NODE_ENV === 'development') {
            console.error('💡 RPC Error Solution:')
            console.error('   - Your RPC is blocking heavy operations (getProgramAccounts)')
            console.error('   - Set NEXT_PUBLIC_SOLANA_RPC_URL in your .env.local file')
            console.error('   - Use a paid RPC provider like Alchemy, QuickNode, or Helius')
          }
        } else if (errorMessage.includes('timeout')) {
          if (process.env.NODE_ENV === 'development') {
            console.error('💡 Timeout Error Solution:')
            console.error('   - Position discovery took longer than expected')
            console.error('   - Try again in a few minutes')
            console.error('   - Consider using a faster RPC provider')
          }
        } else if (errorMessage.includes('connection')) {
          if (process.env.NODE_ENV === 'development') {
            console.error('💡 Connection Error Solution:')
            console.error('   - Check your internet connection')
            console.error('   - Verify your RPC URL is correct')
            console.error('   - Try switching to a different RPC endpoint')
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.error(`💡 Unexpected Error: ${errorMessage}`)
          console.error('   - This might be a temporary issue')
          console.error('   - Try refreshing the page')
        }
        
        // Return empty Map instead of throwing to prevent UI crashes
        return new Map()
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - positions don't change frequently
    retry: (failureCount, error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Don't retry certain errors that won't resolve with retries
      if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Not retrying 403 errors - RPC configuration issue')
        }
        return false
      }
      if (errorMessage.includes('connection')) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Not retrying connection errors - check RPC URL')
        }
        return false
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Retrying position discovery... (attempt ${failureCount + 1}/3)`)
      }
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => {
      const delay = Math.min(1000 * 2 ** attemptIndex, 30000)
      if (process.env.NODE_ENV === 'development') {
        console.log(`⏳ Waiting ${delay}ms before retry...`)
      }
      return delay
    },
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid excessive API calls
    enabled: !!address, // Only run when address is available
  })
}

// Hook for position actions (close and claim)
export function usePositionActions(
  lbPairAddress: string,
  pos: PositionType,
  refreshPositions: () => void
) {
  const [closing, setClosing] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()

  const handleCloseAndWithdraw = async () => {
    if (!publicKey) return
    setClosing(true)
    try {
      const posKey = pos.publicKey
      const user = publicKey
      const lowerBinId = Number(pos.positionData.lowerBinId)
      const upperBinId = Number(pos.positionData.upperBinId)
      
      const customRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || connection.rpcEndpoint
      const closeConnection = customRpcUrl !== connection.rpcEndpoint
        ? new Connection(customRpcUrl, { commitment: 'confirmed' })
        : connection

      const dlmmPool = await DLMM.create(
        closeConnection,
        new PublicKey(lbPairAddress)
      )
      
      const txOrTxs = await dlmmPool.removeLiquidity({
        user,
        position: posKey,
        fromBinId: lowerBinId,
        toBinId: upperBinId,
        bps: new BN(10000),
        shouldClaimAndClose: true,
      })
      
      if (Array.isArray(txOrTxs)) {
        for (const tx of txOrTxs) {
          await sendTransaction(tx, closeConnection, SEND_OPTIONS)
        }
      } else {
        await sendTransaction(txOrTxs, closeConnection, SEND_OPTIONS)
      }
      
      toast.success("Your position has been closed and your funds have been withdrawn.")
      
      // Add delay to allow blockchain state to update before refreshing
      setTimeout(() => {
        refreshPositions()
      }, 10000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      toast.error("Failed to close position: " + errorMessage)
      
      // Only log detailed error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Close position error:', err)
      }
    } finally {
      setClosing(false)
    }
  }

  const handleClaimFees = async () => {
    if (!publicKey) return
    setClaiming(true)
    try {
      const posKey = pos.publicKey
      const user = publicKey
      
      const customRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || connection.rpcEndpoint
      const closeConnection = customRpcUrl !== connection.rpcEndpoint
        ? new Connection(customRpcUrl, { commitment: 'confirmed' })
        : connection

      const dlmmPool = await DLMM.create(
        closeConnection,
        new PublicKey(lbPairAddress)
      )
      
      const position = await dlmmPool.getPosition(posKey)
      const tx = await dlmmPool.claimSwapFee({
        owner: user,
        position,
      })
      
      if (tx) {
        if (Array.isArray(tx)) {
          for (const transaction of tx) {
            await sendTransaction(transaction, closeConnection, SEND_OPTIONS)
          }
        } else {
          await sendTransaction(tx, closeConnection, SEND_OPTIONS)
        }
        toast.success("Your fees have been claimed.")
        
        // Add delay to allow blockchain state to update before refreshing
        setTimeout(() => {
          refreshPositions()
        }, 10000)
      } else {
        toast.error("You don't have any fees to claim.")
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      toast.error("Failed to claim fees: " + errorMessage)
      
      // Only log detailed error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Claim fees error:', err)
      }
    } finally {
      setClaiming(false)
    }
  }

  return {
    closing,
    claiming,
    handleCloseAndWithdraw,
    handleClaimFees,
    publicKey,
  }
}