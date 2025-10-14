// src/components/damm-v2/damm-v2-data-access.tsx
'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, type Mint } from '@solana/spl-token'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { toast } from 'sonner'
import BN from 'bn.js'

// Get user's DAMM v2 positions (Note: SDK might not have this method, implement if needed)
export function useGetDammV2Positions({ address }: { address: PublicKey }) {
  const { connection } = useConnection()

  return useQuery({
    queryKey: ['damm-v2-positions', { endpoint: connection.rpcEndpoint, address: address.toString() }],
    queryFn: async () => {
      try {
        // TODO: Implement position fetching when SDK method is available
        // For now, return empty array
        console.log('Position fetching not yet implemented for:', address.toString())
        return []
      } catch (error) {
        console.error('Error fetching DAMM v2 positions:', error)
        return []
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!address,
  })
}

// Get pool state
export function useGetPoolState({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()

  return useQuery({
    queryKey: ['damm-v2-pool-state', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    queryFn: async () => {
      const cpAmm = new CpAmm(connection)
      return await cpAmm.fetchPoolState(poolAddress)
    },
    staleTime: 60 * 1000, // 1 minute
    enabled: !!poolAddress,
  })
}

// Get position state
export function useGetPositionState({ positionAddress }: { positionAddress: PublicKey }) {
  const { connection } = useConnection()

  return useQuery({
    queryKey: ['damm-v2-position-state', { endpoint: connection.rpcEndpoint, position: positionAddress.toString() }],
    queryFn: async () => {
      const cpAmm = new CpAmm(connection)
      return await cpAmm.fetchPositionState(positionAddress)
    },
    staleTime: 60 * 1000, // 1 minute
    enabled: !!positionAddress,
  })
}

// Add liquidity to position
export function useAddLiquidity({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['add-liquidity-damm-v2', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    mutationFn: async (input: {
      positionAddress: PublicKey
      positionNftAccount: PublicKey
      tokenAAmount: BN
      tokenBAmount: BN
      liquidityDelta: BN
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(poolAddress)

      const addLiqTx = await cpAmm.addLiquidity({
        owner: publicKey,
        pool: poolAddress,
        position: input.positionAddress,
        positionNftAccount: input.positionNftAccount,
        liquidityDelta: input.liquidityDelta,
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        tokenAAmountThreshold: input.tokenAAmount,
        tokenBAmountThreshold: input.tokenBAmount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      })

      const signature = await sendTransaction(addLiqTx, connection)

      await connection.confirmTransaction(signature, 'confirmed')
      return signature
    },
    onSuccess: async (signature) => {
      toast.success('Liquidity added successfully!', {
        description: `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })
      await client.invalidateQueries({
        queryKey: ['damm-v2-position-state'],
      })
    },
    onError: (error) => {
      console.error('Add liquidity error:', error)
      toast.error('Failed to add liquidity', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Remove liquidity from position
export function useRemoveLiquidity({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['remove-liquidity-damm-v2', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    mutationFn: async (input: {
      positionAddress: PublicKey
      positionNftAccount: PublicKey
      liquidityDelta: BN
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(poolAddress)

      const removeLiqTx = await cpAmm.removeLiquidity({
        owner: publicKey,
        pool: poolAddress,
        position: input.positionAddress,
        positionNftAccount: input.positionNftAccount,
        liquidityDelta: input.liquidityDelta,
        tokenAAmountThreshold: new BN(0),
        tokenBAmountThreshold: new BN(0),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        currentPoint: new BN(Math.floor(Date.now() / 1000)),
        vestings: [],
      })

      const signature = await sendTransaction(removeLiqTx, connection)

      await connection.confirmTransaction(signature, 'confirmed')
      return signature
    },
    onSuccess: async (signature) => {
      toast.success('Liquidity removed successfully!', {
        description: `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })
      await client.invalidateQueries({
        queryKey: ['damm-v2-position-state'],
      })
    },
    onError: (error) => {
      console.error('Remove liquidity error:', error)
      toast.error('Failed to remove liquidity', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Remove all liquidity from position
export function useRemoveAllLiquidity({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['remove-all-liquidity-damm-v2', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    mutationFn: async (input: {
      positionAddress: PublicKey
      positionNftAccount: PublicKey
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(poolAddress)

      const removeAllTx = await cpAmm.removeAllLiquidity({
        owner: publicKey,
        pool: poolAddress,
        position: input.positionAddress,
        positionNftAccount: input.positionNftAccount,
        tokenAAmountThreshold: new BN(0),
        tokenBAmountThreshold: new BN(0),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        currentPoint: new BN(Math.floor(Date.now() / 1000)),
        vestings: [],
      })

      const signature = await sendTransaction(removeAllTx, connection)

      await connection.confirmTransaction(signature, 'confirmed')
      return signature
    },
    onSuccess: async (signature) => {
      toast.success('All liquidity removed successfully!', {
        description: `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })
      await client.invalidateQueries({
        queryKey: ['damm-v2-position-state'],
      })
    },
    onError: (error) => {
      console.error('Remove all liquidity error:', error)
      toast.error('Failed to remove all liquidity', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Remove all liquidity and close position
export function useRemoveAllLiquidityAndClosePosition({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['close-position-damm-v2', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    mutationFn: async (input: {
      positionAddress: PublicKey
      positionNftAccount: PublicKey
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(poolAddress)
      const positionState = await cpAmm.fetchPositionState(input.positionAddress)

      const closeTx = await cpAmm.removeAllLiquidityAndClosePosition({
        owner: publicKey,
        position: input.positionAddress,
        positionNftAccount: input.positionNftAccount,
        positionState,
        poolState,
        tokenAAmountThreshold: new BN(0),
        tokenBAmountThreshold: new BN(0),
        currentPoint: new BN(Math.floor(Date.now() / 1000)),
        vestings: [],
      })

      const signature = await sendTransaction(closeTx, connection)

      await connection.confirmTransaction(signature, 'confirmed')
      return signature
    },
    onSuccess: async (signature) => {
      toast.success('Position closed successfully!', {
        description: `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })
    },
    onError: (error) => {
      console.error('Close position error:', error)
      toast.error('Failed to close position', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Claim partner fee
export function useClaimPartnerFee({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['claim-partner-fee-damm-v2', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    mutationFn: async (input: {
      maxAmountA: BN
      maxAmountB: BN
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)

      const claimTx = await cpAmm.claimPartnerFee({
        partner: publicKey,
        pool: poolAddress,
        maxAmountA: input.maxAmountA,
        maxAmountB: input.maxAmountB,
      })

      const signature = await sendTransaction(claimTx, connection)

      await connection.confirmTransaction(signature, 'confirmed')
      return signature
    },
    onSuccess: async (signature) => {
      toast.success('Partner fee claimed successfully!', {
        description: `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-pool-state'],
      })
    },
    onError: (error) => {
      console.error('Claim partner fee error:', error)
      toast.error('Failed to claim partner fee', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Helper function to calculate deposit quote
export async function calculateDepositQuote(
  connection: ReturnType<typeof useConnection>['connection'],
  poolAddress: PublicKey,
  inAmount: BN,
  isTokenA: boolean,
  inputTokenInfo?: { mint: Mint; currentEpoch: number },
  outputTokenInfo?: { mint: Mint; currentEpoch: number }
) {
  const cpAmm = new CpAmm(connection)
  const poolState = await cpAmm.fetchPoolState(poolAddress)

  return await cpAmm.getDepositQuote({
    inAmount,
    isTokenA,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    sqrtPrice: poolState.sqrtPrice,
    inputTokenInfo,
    outputTokenInfo,
  })
}

// Helper function to calculate withdraw quote
export async function calculateWithdrawQuote(
  connection: ReturnType<typeof useConnection>['connection'],
  poolAddress: PublicKey,
  liquidityDelta: BN
) {
  const cpAmm = new CpAmm(connection)
  const poolState = await cpAmm.fetchPoolState(poolAddress)

  return await cpAmm.getWithdrawQuote({
    liquidityDelta,
    sqrtPrice: poolState.sqrtPrice,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
  })
}

// Helper function to calculate swap quote (exact input)
export async function calculateSwapQuote(
  connection: ReturnType<typeof useConnection>['connection'],
  poolAddress: PublicKey,
  inAmount: BN,
  inputTokenMint: PublicKey,
  slippage: number,
  tokenADecimal: number,
  tokenBDecimal: number,
  inputTokenInfo?: { mint: Mint; currentEpoch: number },
  outputTokenInfo?: { mint: Mint; currentEpoch: number }
) {
  const cpAmm = new CpAmm(connection)
  const poolState = await cpAmm.fetchPoolState(poolAddress)
  
  // Get current time and slot
  const currentTime = Math.floor(Date.now() / 1000)
  const slot = await connection.getSlot()

  return await cpAmm.getQuote({
    inAmount,
    inputTokenMint,
    slippage,
    poolState,
    currentTime,
    currentSlot: slot,
    tokenADecimal,
    tokenBDecimal,
    inputTokenInfo,
    outputTokenInfo,
  })
}

// Helper to get CpAmm instance
export function getCpAmmInstance(connection: ReturnType<typeof useConnection>['connection']) {
  return new CpAmm(connection)
}

// Create custom pool with dynamic config
export function useCreateCustomPool() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['create-custom-pool-damm-v2', { endpoint: connection.rpcEndpoint }],
    mutationFn: async (input: {
      config: PublicKey
      poolCreatorAuthority?: PublicKey
      positionNft: PublicKey
      tokenAMint: PublicKey
      tokenBMint: PublicKey
      tokenAAmount: BN
      tokenBAmount: BN
      tokenADecimal: number
      tokenBDecimal: number
      initPrice: number
      minPrice: number
      maxPrice: number
      // Fee Scheduler Configuration
      enableFeeScheduler?: boolean
      baseFeeNumerator: number // base fee in basis points (e.g., 25 = 0.25%)
      endFeeNumerator?: number // end fee in basis points (only if fee scheduler enabled)
      feeSchedulerMode?: number // 0: Linear, 1: Exponential
      numberOfPeriods?: number // number of fee reduction periods
      periodFrequency?: number // frequency in seconds or slots
      // Dynamic Fee Configuration
      maxDynamicFee: number // max dynamic fee in basis points (e.g., 25 = 0.25%)
      hasAlphaVault?: boolean
      collectFeeMode?: number // 0: Both tokens, 1: Only token B
      activationPoint?: BN | null
      activationType?: number // 0: slot, 1: timestamp
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)

      // Helper functions from SDK
      const getSqrtPriceFromPrice = (price: string, tokenADecimals: number, tokenBDecimals: number): BN => {
        const priceNum = parseFloat(price)
        const decimalDiff = tokenBDecimals - tokenADecimals
        const adjustedPrice = priceNum * Math.pow(10, decimalDiff)
        const sqrtPrice = Math.sqrt(adjustedPrice)
        return new BN(Math.floor(sqrtPrice * Math.pow(2, 64)))
      }

      // Calculate sqrt prices
      const sqrtPrice = getSqrtPriceFromPrice(input.initPrice.toString(), input.tokenADecimal, input.tokenBDecimal)
      const sqrtMinPrice = getSqrtPriceFromPrice(input.minPrice.toString(), input.tokenADecimal, input.tokenBDecimal)
      const sqrtMaxPrice = getSqrtPriceFromPrice(input.maxPrice.toString(), input.tokenADecimal, input.tokenBDecimal)

      // Get liquidity delta - SDK returns BN directly
      const liquidityDelta = cpAmm.getLiquidityDelta({
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        sqrtMaxPrice,
        sqrtMinPrice,
        sqrtPrice,
      }) as BN

      // Base fee params helper - Updated to match SDK structure
      const getBaseFeeParams = (
        cliffFee: number,
        endFee: number,
        mode: number,
        numberOfPeriod: number,
        periodFrequency: number
      ) => {
        let reductionFactor = 0
        
        if (numberOfPeriod > 0) {
          if (mode === 0) {
            // Linear: fee = cliffFee - (period × reductionFactor)
            reductionFactor = Math.floor(((cliffFee - endFee) * 10000) / numberOfPeriod)
          } else if (mode === 1) {
            // Exponential: fee = cliffFee × (1 - reductionFactor/10_000)^period
            const ratio = endFee / cliffFee
            const base = Math.pow(ratio, 1 / numberOfPeriod)
            reductionFactor = Math.floor((1 - base) * 10000)
          }
        }
        
        return {
          cliffFeeNumerator: new BN(cliffFee * 10000),
          firstFactor: numberOfPeriod,
          secondFactor: [periodFrequency],
          thirdFactor: new BN(reductionFactor),
          baseFeeMode: mode,
        }
      }

      // Dynamic fee params helper
      const getDynamicFeeParams = (maxFee: number) => {
        return {
          initialized: true,
          binStep: 1,
          binStepU128: new BN('1844674407370955'),
          filterPeriod: 10,
          decayPeriod: 120,
          reductionFactor: 5000,
          variableFeeControl: 2000000,
          maxVolatilityAccumulator: 100000,
          maxDynamicFee: maxFee * 10000, // Convert basis points to fee numerator
        }
      }

      // Build pool fees configuration
      const baseFeeParams = getBaseFeeParams(
        input.baseFeeNumerator,
        input.endFeeNumerator ?? input.baseFeeNumerator, // If no end fee, keep it flat
        input.feeSchedulerMode ?? 0,
        input.enableFeeScheduler ? (input.numberOfPeriods ?? 0) : 0,
        input.enableFeeScheduler ? (input.periodFrequency ?? 0) : 0
      )

      const dynamicFeeParams = getDynamicFeeParams(input.maxDynamicFee)

      const poolFees = {
        baseFee: baseFeeParams,
        padding: [],
        dynamicFee: dynamicFeeParams,
      }

      // Create pool
      const { tx, pool, position } = await cpAmm.createCustomPoolWithDynamicConfig({
        payer: publicKey,
        creator: publicKey,
        config: input.config,
        poolCreatorAuthority: input.poolCreatorAuthority || publicKey,
        positionNft: input.positionNft,
        tokenAMint: input.tokenAMint,
        tokenBMint: input.tokenBMint,
        tokenAAmount: input.tokenAAmount,
        tokenBAmount: input.tokenBAmount,
        sqrtMinPrice,
        sqrtMaxPrice,
        initSqrtPrice: sqrtPrice,
        liquidityDelta,
        poolFees,
        hasAlphaVault: input.hasAlphaVault ?? false,
        collectFeeMode: input.collectFeeMode ?? 0,
        activationPoint: input.activationPoint ?? null,
        activationType: input.activationType ?? 1,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      })

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')

      return { signature, pool, position }
    },
    onSuccess: async ({ signature, pool }) => {
      toast.success('Pool created successfully!', {
        description: `Pool: ${pool.toString().slice(0, 8)}...${pool.toString().slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })

      await client.invalidateQueries({
        queryKey: ['damm-v2-pool-state'],
      })
    },
    onError: (error) => {
      console.error('Create pool error:', error)
      toast.error('Failed to create pool', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}