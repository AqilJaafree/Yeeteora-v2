// src/components/damm-v2/damm-v2-add-liquidity.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Keypair } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Info, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import BN from 'bn.js'
import { useMutation, useQueryClient } from '@tanstack/react-query'

// Standard SendOptions for consistent transaction handling
const SEND_OPTIONS = {
  skipPreflight: false,
  preflightCommitment: 'confirmed' as const,
  maxRetries: 3,
}

interface AddLiquidityToPoolProps {
  poolAddress: string
  poolName: string
  tokenAMint: string
  tokenBMint: string
  tokenASymbol: string
  tokenBSymbol: string
  children?: React.ReactNode
}

export function AddLiquidityToPool({
  poolAddress,
  poolName,
  tokenAMint,
  tokenBMint,
  tokenASymbol,
  tokenBSymbol,
  children,
}: AddLiquidityToPoolProps) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const client = useQueryClient()
  
  const [isOpen, setIsOpen] = useState(false)
 
 const [activeTab, setActiveTab] = useState<'liquidity' | 'swap'>('liquidity')
  const [tokenAAmount, setTokenAAmount] = useState('')
  const [tokenBAmount, setTokenBAmount] = useState('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [tokenABalance, setTokenABalance] = useState<number>(0)
  const [tokenBBalance, setTokenBBalance] = useState<number>(0)
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  const [jupiterContainerId, setJupiterContainerId] = useState<string | null>(null)

  // Debounce timer ref to prevent excessive RPC calls during typing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Get the non-SOL token mint for Jupiter swap
  const getSwapTokenMint = useCallback(() => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    if (tokenAMint === SOL_MINT) return tokenBMint
    if (tokenBMint === SOL_MINT) return tokenAMint
    return tokenAMint // fallback
  }, [tokenAMint, tokenBMint])

  // Fetch token balances
  const fetchBalances = useCallback(async () => {
    if (!publicKey) return

    try {
 
     setIsLoadingBalances(true)

      const SOL_MINT = 'So11111111111111111111111111111111111111112'
      let balanceA = 0
      let balanceB = 0

      // For SOL, use getAccountInfo instead of getBalance (RPC-safe)
      if (tokenAMint === SOL_MINT || tokenBMint === SOL_MINT) {
        try {
          const accountInfo = await connection.getAccountInfo(publicKey)
          const solBalance = accountInfo ? accountInfo.lamports / 1000000000 : 0

          if (tokenAMint === SOL_MINT) {
            balanceA = solBalance
          }
          if (tokenBMint === SOL_MINT) {
            balanceB = solBalance
          }
        } catch (error) {
          console.error('[Balance Fetch] Failed to fetch SOL balance:', error)
        }
      }

      // Get SPL token accounts from BOTH Token Program and Token-2022 Program
      // FIX: Check both programs to ensure we find all tokens
      const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')

      const [tokenAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }).catch(() => ({ value: [] })) // Gracefully handle if Token-2022 not supported
      ])

      // Check standard Token Program accounts
      tokenAccounts.value.forEach((accountInfo) => {
        const parsedInfo = accountInfo.account.data.parsed.info
        const mintAddress = parsedInfo.mint

        if (mintAddress === tokenAMint && tokenAMint !== SOL_MINT) {
          balanceA = parsedInfo.tokenAmount.uiAmount || 0
        }
        if (mintAddress === tokenBMint && tokenBMint !== SOL_MINT) {
          balanceB = parsedInfo.tokenAmount.uiAmount || 0
        }
      })

      // Check Token-2022 Program accounts
      token2022Accounts.value.forEach((accountInfo) => {
        const parsedInfo = accountInfo.account.data.parsed.info
        const mintAddress = parsedInfo.mint

        if (mintAddress === tokenAMint && tokenAMint !== SOL_MINT) {
          balanceA = parsedInfo.tokenAmount.uiAmount || 0
        }
        if (mintAddress === tokenBMint && tokenBMint !== SOL_MINT) {
          balanceB = parsedInfo.tokenAmount.uiAmount || 0
        }
      })

      setTokenABalance(balanceA)
      setTokenBBalance(balanceB)
    } catch (error) {
      console.error('Error fetching balances:', error)
      toast.error('Failed to fetch token balances')
    } finally {
      setIsLoadingBalances(false)
    }
  }, [publicKey, connection, tokenAMint, tokenBMint])

  // Initialize Jupiter widget when swap tab is active
  useEffect(() => {
    if (activeTab === 'swap' && isOpen && typeof window !== 'undefined') {
      const initJupiter = () => {
        const container = document.getElementById("jupiter-swap-container")
        if (container && window.Jupiter) {
          try {
            const uniqueId = `jupiter-${Date.now()}`
            setJupiterContainerId(uniqueId)
            
            window.Jupiter.init({
              displayMode: "integrated",
              integratedTargetId: "jupiter-swap-container",
              formProps: {
                initialInputMint: "So11111111111111111111111111111111111111112",
                initialOutputMint: getSwapTokenMint(),
                swapMode: "ExactIn",
              },
              containerStyles: {
                borderRadius: '8px',
              },
              containerClassName: 'w-full h-full',
            })
          } catch (error) {
            console.error('Jupiter initialization error:', error)
          }
        } else {
          setTimeout(initJupiter, 100)
        }
      }
      
      setTimeout(initJupiter, 200)
    }
  }, [activeTab, isOpen, getSwapTokenMint, publicKey])

  // Clear Jupiter container when switching to liquidity tab
  useEffect(() => {
    if (activeTab === 'liquidity' && isOpen) {
      const container = document.getElementById("jupiter-swap-container")
      if (container) {
        container.style.display = 'none'
        container.innerHTML = ''
      }
      setJupiterContainerId(null)
    } else if (activeTab === 'swap' && isOpen) {
      const container = document.getElementById("jupiter-swap-container")
      if (container) {
        container.style.display = 'block'
      }
    }
  }, [activeTab, isOpen])

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      const container = document.getElementById("jupiter-swap-container")
      if (container) {
        container.innerHTML = ''
        container.style.display = 'block' // Reset display for next time
      }
      setJupiterContainerId(null)

      // Clear debounce timer when dialog closes
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [isOpen])

  // Fetch balances when dialog opens and auto-refresh every 5 seconds
  useEffect(() => {
    if (!isOpen || !publicKey) return

    fetchBalances()

    const interval = setInterval(() => {
      fetchBalances()
    }, 5000)

    return () => clearInterval(interval)
  }, [isOpen, publicKey, fetchBalances])

  // Cleanup debounce timer on component unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const setMaxTokenA = () => {
    if (tokenABalance > 0) {
      setTokenAAmount(tokenABalance.toString())
      calculateEstimatedAmount(tokenABalance.toString(), true)
    }
  }

  const setMaxTokenB = () => {
    if (tokenBBalance > 0) {
      setTokenBAmount(tokenBBalance.toString())
      calculateEstimatedAmount(tokenBBalance.toString(), false)
    }
  }

  const calculateEstimatedAmount = async (amount: string, isTokenA: boolean) => {
    if (!amount || amount === '0') {
      if (isTokenA) {
        setTokenBAmount('')
      } else {
        setTokenAAmount('')
      }
      return
    }

    try {
      setIsCalculating(true)
      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress))

      // FIX: Fetch token decimals safely using getParsedAccountInfo instead of getMint
      // This works for both Token Program and Token-2022 Program
      let tokenADecimals = 9 // Default fallback
      let tokenBDecimals = 9 // Default fallback

      try {
        const [tokenAAccountInfo, tokenBAccountInfo] = await Promise.all([
          connection.getParsedAccountInfo(new PublicKey(tokenAMint)),
          connection.getParsedAccountInfo(new PublicKey(tokenBMint)),
        ])

        // Extract decimals from parsed account data
        if (tokenAAccountInfo.value?.data && 'parsed' in tokenAAccountInfo.value.data) {
          tokenADecimals = tokenAAccountInfo.value.data.parsed.info.decimals
        }
        if (tokenBAccountInfo.value?.data && 'parsed' in tokenBAccountInfo.value.data) {
          tokenBDecimals = tokenBAccountInfo.value.data.parsed.info.decimals
        }
      } catch (mintError) {
        console.error('[Token Decimals] Could not fetch mint decimals, using defaults:', mintError)
        // Use default decimals (9) if fetching fails
      }

      const rawAmount = new BN(
        Math.floor(
          parseFloat(amount) * Math.pow(10, isTokenA ? tokenADecimals : tokenBDecimals)
        )
      )

      // Use getDepositQuote method
      const quote = await cpAmm.getDepositQuote({
        inAmount: rawAmount,
        isTokenA,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
      })

      const otherAmount = parseFloat(quote.outputAmount.toString()) /
        Math.pow(10, isTokenA ? tokenBDecimals : tokenADecimals)

      if (isTokenA) {
        setTokenBAmount(otherAmount.toFixed(6))
      } else {
        setTokenAAmount(otherAmount.toFixed(6))
      }
    } catch (error) {
      console.error('Error calculating amount:', error)
      // Only show error toast for critical errors, not for calculation issues
      if (error instanceof Error && !error.message.includes('decimals')) {
        toast.error('Failed to calculate estimated amount', {
          description: 'Please try entering the amount manually'
        })
      }
    } finally {
      setIsCalculating(false)
    }
  }

  const handleTokenAChange = (value: string) => {
    setTokenAAmount(value)

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (value && value !== '0') {
      // Debounce calculation by 500ms to prevent excessive RPC calls during typing
      debounceTimerRef.current = setTimeout(() => {
        calculateEstimatedAmount(value, true)
      }, 500)
    } else {
      setTokenBAmount('')
    }
  }

  const handleTokenBChange = (value: string) => {
    setTokenBAmount(value)

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (value && value !== '0') {
      // Debounce calculation by 500ms to prevent excessive RPC calls during typing
      debounceTimerRef.current = setTimeout(() => {
        calculateEstimatedAmount(value, false)
      }, 500)
    } else {
      setTokenAAmount('')
    }
  }

  const addLiquidityMutation = useMutation({
    mutationKey: ['add-liquidity-new-position', poolAddress],
    mutationFn: async (input: {
      tokenAAmount: BN
      tokenBAmount: BN
      tokenADecimals: number
      tokenBDecimals: number
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress))

      const liquidityDelta = cpAmm.getLiquidityDelta({
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        sqrtMaxPrice: poolState.sqrtMaxPrice,
        sqrtMinPrice: poolState.sqrtMinPrice,
        sqrtPrice: poolState.sqrtPrice,
      }) as BN

      const positionNft = Keypair.generate()

      // CRITICAL: Detect which token program each token uses (Token Program vs Token-2022)
      // This prevents "IncorrectProgramId" errors when tokens use different programs
      const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')

      // Fetch token account info to determine the correct program
      const [tokenAAccountInfo, tokenBAccountInfo] = await Promise.all([
        connection.getParsedAccountInfo(poolState.tokenAMint),
        connection.getParsedAccountInfo(poolState.tokenBMint),
      ])

      // SECURITY: Validate account info exists before proceeding
      if (!tokenAAccountInfo.value || !tokenBAccountInfo.value) {
        throw new Error('Failed to fetch token mint information. The token may not exist or the RPC endpoint may be unavailable.')
      }

      // Determine which program owns each token
      const tokenAProgram = tokenAAccountInfo.value.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID

      const tokenBProgram = tokenBAccountInfo.value.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID

      if (process.env.NODE_ENV === 'development') {
        console.log('[Token Programs]', {
          tokenA: poolState.tokenAMint.toBase58().slice(0, 8) + '...',
          tokenAProgram: tokenAProgram.toBase58(),
          tokenB: poolState.tokenBMint.toBase58().slice(0, 8) + '...',
          tokenBProgram: tokenBProgram.toBase58(),
        })
      }

      const tx = await cpAmm.createPositionAndAddLiquidity({
        owner: publicKey,
        pool: new PublicKey(poolAddress),
        positionNft: positionNft.publicKey,
        liquidityDelta,
        maxAmountTokenA: input.tokenAAmount,
        maxAmountTokenB: input.tokenBAmount,
        tokenAAmountThreshold: input.tokenAAmount,
        tokenBAmountThreshold: input.tokenBAmount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram,  // Now uses the correct detected program
        tokenBProgram,  // Now uses the correct detected program
      })

      // SECURITY: Fetch blockhash and prepare transaction for signing
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.lastValidBlockHeight = lastValidBlockHeight
      tx.feePayer = publicKey

      // IMPORTANT: Partially sign with positionNft BEFORE sending to wallet
      // This is required for transactions with multiple signers
      tx.partialSign(positionNft)

      // Send transaction using wallet adapter (works for all wallets including Phantom)
      // The wallet adapter automatically uses the correct signing method for each wallet
      const signature = await sendTransaction(tx, connection, SEND_OPTIONS)

      // Confirm transaction using the new non-deprecated method
      const latestBlockhash = await connection.getLatestBlockhash('confirmed')
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed')

      return { signature, position: positionNft.publicKey }
    },
    onSuccess: async ({ position }) => {
      toast.success('Liquidity added successfully!', {
        description: `Position: ${position.toString().slice(0, 8)}...${position.toString().slice(-8)}`,
      })
      
      setIsOpen(false)
      setTokenAAmount('')
      setTokenBAmount('')
      
      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })
    },
    onError: (error) => {
      console.error('Add liquidity error:', error)
      toast.error('Failed to add liquidity', {
        description: error instanceof Error ? error.message : 'Please try again later',
      })
    },
  })

  const handleAddLiquidity = async () => {
    if (!tokenAAmount || !tokenBAmount) {
      toast.error('Please enter amounts for both tokens')
      return
    }

    try {
      // FIX: Fetch token decimals safely using getParsedAccountInfo instead of getMint
      // This works for both Token Program and Token-2022 Program
      let tokenADecimals = 9 // Default fallback
      let tokenBDecimals = 9 // Default fallback

      try {
        const [tokenAAccountInfo, tokenBAccountInfo] = await Promise.all([
          connection.getParsedAccountInfo(new PublicKey(tokenAMint)),
          connection.getParsedAccountInfo(new PublicKey(tokenBMint)),
        ])

        // Extract decimals from parsed account data
        if (tokenAAccountInfo.value?.data && 'parsed' in tokenAAccountInfo.value.data) {
          tokenADecimals = tokenAAccountInfo.value.data.parsed.info.decimals
        }
        if (tokenBAccountInfo.value?.data && 'parsed' in tokenBAccountInfo.value.data) {
          tokenBDecimals = tokenBAccountInfo.value.data.parsed.info.decimals
        }
      } catch (mintError) {
        console.error('[Token Decimals] Could not fetch mint decimals, using defaults:', mintError)
        toast.warning('Using default token decimals. Transaction may fail if tokens use non-standard decimals.')
      }

      const tokenAAmountBN = new BN(parseFloat(tokenAAmount) * Math.pow(10, tokenADecimals))
      const tokenBAmountBN = new BN(parseFloat(tokenBAmount) * Math.pow(10, tokenBDecimals))

      await addLiquidityMutation.mutateAsync({
        tokenAAmount: tokenAAmountBN,
        tokenBAmount: tokenBAmountBN,
        tokenADecimals,
        tokenBDecimals,
      })
    } catch (error) {
      console.error('Error preparing add liquidity:', error)
      if (error instanceof Error) {
        toast.error('Failed to add liquidity', {
          description: error.message
        })
      }
    }
  }

  return (
    <>
      {children ? (
        <div onClick={() => setIsOpen(true)}>{children}</div>
      ) : (
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Liquidity
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] bg-[#1a1a2e] border-gray-600 text-white p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-gray-600/30">
            <DialogTitle className="flex items-center gap-2 text-white">
              {tokenASymbol}-{tokenBSymbol}
            </DialogTitle>
            
            {/* Tab Navigation */}
            <div className="flex gap-1 bg-[#2a2a3e] rounded-lg p-1 mt-4">
              <button
                onClick={() => setActiveTab('liquidity')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'liquidity'
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Add Liquidity
              </button>
              <button
                onClick={() => setActiveTab('swap')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'swap'
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4 inline mr-2" />
                Swap
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'liquidity' && (
              <div className="space-y-4 p-4">
                {/* Pool Info */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-400 mb-1">
                    Pool: {poolName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {poolAddress.slice(0, 8)}...{poolAddress.slice(-8)}
                  </p>
                </div>

                {/* Token A Amount */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tokenAAmount" className="flex items-center gap-2 text-white">
                      {tokenASymbol} Amount
                      <Info className="w-3 h-3 text-gray-400" />
                    </Label>
                    <div className="flex items-center gap-2">
                      {isLoadingBalances ? (
                        <div className="text-xs text-gray-400">Loading...</div>
                      ) : (
                        <>
                          <span className="text-xs text-gray-400">
                            Balance: {tokenABalance.toFixed(6)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={setMaxTokenA}
                            className="h-6 px-2 text-xs bg-transparent border-gray-600 text-gray-400 hover:bg-gray-800"
                          >
                            MAX
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <Input
                    id="tokenAAmount"
                    type="number"
                    placeholder="0.0"
                    value={tokenAAmount}
                    onChange={(e) => handleTokenAChange(e.target.value)}
                    className="bg-[#2a2a3e] border-gray-600 text-white"
                    disabled={isCalculating}
                  />
                </div>

                {/* Token B Amount */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tokenBAmount" className="flex items-center gap-2 text-white">
                      {tokenBSymbol} Amount
                      <Info className="w-3 h-3 text-gray-400" />
                    </Label>
                    <div className="flex items-center gap-2">
                      {isLoadingBalances ? (
                        <div className="text-xs text-gray-400">Loading...</div>
                      ) : (
                        <>
                          <span className="text-xs text-gray-400">
                            Balance: {tokenBBalance.toFixed(6)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={setMaxTokenB}
                            className="h-6 px-2 text-xs bg-transparent border-gray-600 text-gray-400 hover:bg-gray-800"
                          >
                            MAX
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <Input
                    id="tokenBAmount"
                    type="number"
                    placeholder="0.0"
                    value={tokenBAmount}
                    onChange={(e) => handleTokenBChange(e.target.value)}
                    className="bg-[#2a2a3e] border-gray-600 text-white"
                    disabled={isCalculating}
                  />
                  {isCalculating && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <div className="w-3 h-3 border border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                      Calculating estimated amount...
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'swap' && (
              <div className="p-4">
                {/* Mobile-optimized Jupiter Terminal Container */}
                <div 
                  id="jupiter-swap-container"
                  className="w-full h-[500px] max-h-[60vh] rounded-lg overflow-hidden"
                  style={{
                    minHeight: '400px',
                    maxHeight: 'calc(90vh - 200px)'
                  }}
                >
                  {/* Loading state for Jupiter */}
                  {!jupiterContainerId && (
                    <div className="flex items-center justify-center h-full bg-[#2a2a3e] rounded-lg">
                      <div className="text-center">
                        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-sm text-gray-400">Loading Jupiter Terminal...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {activeTab === 'liquidity' && (
            <div className="border-t border-gray-600/30 p-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={addLiquidityMutation.isPending}
                  className="flex-1 bg-transparent border-gray-600 text-white hover:bg-gray-800"
                >
                  CANCEL
                </Button>
                <Button
                  onClick={handleAddLiquidity}
                  disabled={
                    addLiquidityMutation.isPending ||
                    !publicKey ||
                    !tokenAAmount ||
                    !tokenBAmount ||
                    isCalculating
                  }
                  className="flex-1 bg-primary hover:bg-secondary text-white"
                >
                  {addLiquidityMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Adding...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      ADD LIQUIDITY
                    </div>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}