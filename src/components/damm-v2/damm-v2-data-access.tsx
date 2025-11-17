// src/components/damm-v2/damm-v2-data-access.tsx
'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, type Mint } from '@solana/spl-token'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CpAmm, getSqrtPriceFromPrice, getUnClaimReward } from '@meteora-ag/cp-amm-sdk'
import { toast } from 'sonner'
import BN from 'bn.js'

// DAMM v2 Position interface
export interface DammV2Position {
  positionPubkey: PublicKey
  poolAddress: PublicKey
  liquidity: BN
  tokenAAmount: BN
  tokenBAmount: BN
  feeOwedA: BN
  feeOwedB: BN
  rewardOne: BN
  rewardTwo: BN
  nftMint: PublicKey
  poolState: {
    tokenAMint: PublicKey
    tokenBMint: PublicKey
    tokenAVault: PublicKey
    tokenBVault: PublicKey
    sqrtPrice: BN
    sqrtMinPrice: BN
    sqrtMaxPrice: BN
    currentPrice: number
    minPrice: number
    maxPrice: number
  }
}

// Get user's DAMM v2 positions using the SDK method
export function useGetDammV2Positions({ address }: { address: PublicKey }) {
  const { connection } = useConnection()

  return useQuery({
    queryKey: ['damm-v2-positions', { endpoint: connection.rpcEndpoint, address: address.toString() }],
    queryFn: async (): Promise<DammV2Position[]> => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('🚀 Starting DAMM v2 position discovery...')
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

        const cpAmm = new CpAmm(discoveryConnection)

        // Use the SDK's built-in method to get all user positions
        // This method internally uses getProgramAccounts to find position NFTs
        const userPositions = await cpAmm.getPositionsByUser(address)

        if (process.env.NODE_ENV === 'development') {
          console.log(`🎉 DISCOVERY COMPLETE! Found ${userPositions.length} DAMM v2 position(s)`)
        }

        const positions: DammV2Position[] = []

        // Process each position to fetch additional data
        for (const userPosition of userPositions) {
          try {
            const positionState = userPosition.positionState

            // Fetch pool state
            const poolState = await cpAmm.fetchPoolState(positionState.pool)

            if (!poolState) {
              if (process.env.NODE_ENV === 'development') {
                console.warn(`⚠️ Could not fetch pool state for position ${userPosition.position.toString()}`)
              }
              continue
            }

            // For DAMM v2, we'll use a simpler approach to avoid BigNumber overflow
            // Store sqrt prices directly and calculate relative price for range checking
            // We don't need exact decimal prices, just need to know if position is in range

            // Simple range check: compare sqrt prices directly
            // If sqrtMinPrice < sqrtPrice < sqrtMaxPrice, position is in range
            const currentPrice = 0 // Placeholder - will be calculated in UI if needed
            const minPrice = 0 // Placeholder
            const maxPrice = 0 // Placeholder

            // Calculate token amounts from liquidity using withdraw quote
            const liquidity = positionState.unlockedLiquidity || new BN(0)

            // Calculate what the position is worth in tokens
            let tokenAAmount = new BN(0)
            let tokenBAmount = new BN(0)

            try {
              if (liquidity.gt(new BN(0))) {
                const withdrawQuote = cpAmm.getWithdrawQuote({
                  liquidityDelta: liquidity,
                  sqrtPrice: poolState.sqrtPrice,
                  minSqrtPrice: poolState.sqrtMinPrice,
                  maxSqrtPrice: poolState.sqrtMaxPrice,
                })

                tokenAAmount = withdrawQuote.outAmountA
                tokenBAmount = withdrawQuote.outAmountB
              }
            } catch (quoteError: unknown) {
              if (process.env.NODE_ENV === 'development') {
                console.warn(`⚠️ Could not calculate withdraw quote for position ${userPosition.position.toString()}:`, quoteError)
              }
              // Continue with zero amounts if quote calculation fails
            }

            // Calculate unclaimed fees using SDK function
            let feeOwedA = new BN(0)
            let feeOwedB = new BN(0)

            try {
              const unclaimedReward = getUnClaimReward(poolState, positionState)
              feeOwedA = unclaimedReward.feeTokenA || new BN(0)
              feeOwedB = unclaimedReward.feeTokenB || new BN(0)

              if (process.env.NODE_ENV === 'development') {
                console.log(`💰 Position ${userPosition.position.toString().slice(0, 8)}... unclaimed fees:`)
                console.log(`   Fee A: ${feeOwedA.toString()}`)
                console.log(`   Fee B: ${feeOwedB.toString()}`)
              }
            } catch (feeError: unknown) {
              if (process.env.NODE_ENV === 'development') {
                console.warn(`⚠️ Could not calculate unclaimed fees for position ${userPosition.position.toString()}:`, feeError)
              }
              // Continue with zero fees if calculation fails
            }

            positions.push({
              positionPubkey: userPosition.position,
              poolAddress: positionState.pool,
              liquidity,
              tokenAAmount,
              tokenBAmount,
              feeOwedA,
              feeOwedB,
              rewardOne: new BN(0), // Rewards need separate calculation
              rewardTwo: new BN(0), // Rewards need separate calculation
              nftMint: userPosition.positionNftAccount, // Use the NFT account from SDK response
              poolState: {
                tokenAMint: poolState.tokenAMint,
                tokenBMint: poolState.tokenBMint,
                tokenAVault: poolState.tokenAVault,
                tokenBVault: poolState.tokenBVault,
                sqrtPrice: poolState.sqrtPrice,
                sqrtMinPrice: poolState.sqrtMinPrice,
                sqrtMaxPrice: poolState.sqrtMaxPrice,
                currentPrice,
                minPrice,
                maxPrice,
              },
            })

            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Processed position ${userPosition.position.toString()}`)
              console.log(`   Pool: ${positionState.pool.toString()}`)
              console.log(`   Liquidity: ${liquidity.toString()}`)
            }
          } catch (error: unknown) {
            if (process.env.NODE_ENV === 'development') {
              console.error(`❌ Error processing position ${userPosition.position.toString()}:`, error)
            }
            // Skip this position but continue processing others
            continue
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Successfully processed ${positions.length} DAMM v2 positions`)
        }

        return positions
      } catch (error: unknown) {
        // Enhanced error handling
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ DAMM v2 position discovery failed:', error)
        }

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
        }

        // Return empty array instead of throwing to prevent UI crashes
        return []
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
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
        console.log(`🔄 Retrying DAMM v2 position discovery... (attempt ${failureCount + 1}/3)`)
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
      toast.error('Failed to add liquidity', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

/**
 * Create a new position and add liquidity to an existing pool
 * This is what most users will use to add liquidity
 */
export function useCreatePositionAndAddLiquidity({ poolAddress }: { poolAddress: PublicKey }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['create-position-add-liquidity', { endpoint: connection.rpcEndpoint, pool: poolAddress.toString() }],
    mutationFn: async (input: {
      tokenAAmount: BN
      tokenBAmount: BN
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(poolAddress)

      // Calculate liquidity delta
      const liquidityDelta = cpAmm.getLiquidityDelta({
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        sqrtMaxPrice: poolState.sqrtMaxPrice,
        sqrtMinPrice: poolState.sqrtMinPrice,
        sqrtPrice: poolState.sqrtPrice,
      }) as BN

      // Generate new position NFT keypair
      const positionNft = Keypair.generate()

      // Create position and add liquidity in one transaction
      const tx = await cpAmm.createPositionAndAddLiquidity({
        owner: publicKey,
        pool: poolAddress,
        positionNft: positionNft.publicKey, // Changed from positionNftAccount
        liquidityDelta,
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        tokenAAmountThreshold: input.tokenAAmount,
        tokenBAmountThreshold: input.tokenBAmount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      })

      const signature = await sendTransaction(tx, connection, {
        signers: [positionNft],
      })

      await connection.confirmTransaction(signature, 'confirmed')

      return { signature, position: positionNft.publicKey }
    },
    onSuccess: async ({ signature, position }) => {
      toast.success('Position created and liquidity added!', {
        description: `Position: ${position.toString().slice(0, 8)}...${position.toString().slice(-8)}`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${signature}`, '_blank'),
        },
      })
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })
      await client.invalidateQueries({
        queryKey: ['damm-v2-pool-state'],
      })
    },
    onError: (error) => {
      toast.error('Failed to add liquidity', {
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
      toast.error('Failed to close position', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Helper to get CpAmm instance
export function getCpAmmInstance(connection: Connection) {
  return new CpAmm(connection)
}

// Create custom pool with dynamic config
export function useCreateDammV2Pool() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()

  return useMutation({
    mutationKey: ['create-damm-v2-pool', { endpoint: connection.rpcEndpoint }],
    mutationFn: async (input: {
      // Required: Token Configuration
      tokenAMint: PublicKey
      tokenBMint: PublicKey
      tokenAAmount: BN // Raw amount with decimals
      tokenBAmount: BN // Raw amount with decimals
      
      // Required: Price Configuration
      initPrice: number // Initial price (token B per token A)
      minPrice: number // Minimum price for concentrated liquidity
      maxPrice: number // Maximum price for concentrated liquidity
      
      // Required: Decimals
      tokenADecimal: number
      tokenBDecimal: number
      
      // Required: Fee Configuration
      baseFeeNumerator: number // Base fee in basis points (e.g., 25 = 0.25%)
      maxDynamicFee: number // Max dynamic fee in basis points (e.g., 25 = 0.25%)
      
      // Optional: Fee Scheduler (anti-sniper)
      enableFeeScheduler?: boolean
      endFeeNumerator?: number // End fee in basis points (only if scheduler enabled)
      feeSchedulerMode?: number // 0: Linear, 1: Exponential
      numberOfPeriods?: number // Number of fee reduction periods
      periodFrequency?: number // Frequency in seconds
      
      // Optional: Pool Features
      collectFeeMode?: number // 0: Both tokens, 1: Only token B
      hasAlphaVault?: boolean // Enable alpha vault (presale)
      activationPoint?: BN | null // When pool activates
      activationType?: number // 0: slot, 1: timestamp
      
      // Optional: Config & Authority
      config?: PublicKey // Pool config key (uses default if not provided)
      poolCreatorAuthority?: PublicKey // Pool creator authority
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)

      // Calculate sqrt prices using SDK helper function
      // getSqrtPriceFromPrice accepts price as string and properly handles Q64.64 conversion
      const sqrtPrice = getSqrtPriceFromPrice(
        input.initPrice.toString(),
        input.tokenADecimal,
        input.tokenBDecimal
      )
      const sqrtMinPrice = getSqrtPriceFromPrice(
        input.minPrice.toString(),
        input.tokenADecimal,
        input.tokenBDecimal
      )
      const sqrtMaxPrice = getSqrtPriceFromPrice(
        input.maxPrice.toString(),
        input.tokenADecimal,
        input.tokenBDecimal
      )

      // Calculate liquidity delta
      const liquidityDelta = cpAmm.getLiquidityDelta({
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        sqrtMaxPrice,
        sqrtMinPrice,
        sqrtPrice,
      }) as BN

      // Build base fee params
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

      // Build dynamic fee params
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
          maxDynamicFee: maxFee * 10000,
        }
      }

      // Build pool fees configuration
      const baseFeeParams = getBaseFeeParams(
        input.baseFeeNumerator / 10000, // Convert basis points back to decimal
        input.enableFeeScheduler ? (input.endFeeNumerator || input.baseFeeNumerator) / 10000 : input.baseFeeNumerator / 10000,
        input.feeSchedulerMode ?? 0,
        input.enableFeeScheduler ? (input.numberOfPeriods ?? 0) : 0,
        input.enableFeeScheduler ? (input.periodFrequency ?? 0) : 0
      )

      const dynamicFeeParams = getDynamicFeeParams(input.maxDynamicFee / 10000)

      const poolFees = {
        baseFee: baseFeeParams,
        padding: [],
        dynamicFee: dynamicFeeParams,
      }

      // Use default config if not provided
      const configAddress = input.config || new PublicKey(
        'CPMMooJH2TY8zVr43UzoPBfLNFVxJh8M3A6ARaYRkMz3'
      )

      // Generate position NFT keypair
      const positionNft = Keypair.generate()

      // Create pool
      const { tx, pool, position } = await cpAmm.createCustomPoolWithDynamicConfig({
        payer: publicKey,
        creator: publicKey,
        config: configAddress,
        poolCreatorAuthority: input.poolCreatorAuthority || publicKey,
        positionNft: positionNft.publicKey,
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

      const signature = await sendTransaction(tx, connection, {
        signers: [positionNft],
      })

      await connection.confirmTransaction(signature, 'confirmed')

      return { signature, pool, position }
    },
    onSuccess: async ({ pool }) => {
      toast.success('Pool created successfully!', {
        description: `Pool: ${pool.toString().slice(0, 8)}...${pool.toString().slice(-8)}`,
        action: {
          label: 'View on Meteora',
          onClick: () => window.open(`https://meteora.ag/dammv2/${pool.toString()}`, '_blank'),
        },
      })

      await client.invalidateQueries({
        queryKey: ['damm-v2-pool-state'],
      })
    },
    onError: (error) => {
      toast.error('Failed to create pool', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Helper function to calculate deposit quote (useful for UI)
export async function calculateDepositQuote(
  connection: Connection,
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

// Helper function to calculate withdraw quote (useful for UI)
export async function calculateWithdrawQuote(
  connection: Connection,
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
  connection: Connection,
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