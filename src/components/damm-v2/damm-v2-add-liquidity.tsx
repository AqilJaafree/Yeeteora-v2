// src/components/damm-v2/damm-v2-add-liquidity.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Keypair } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token'
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

      // Get token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      })

      let balanceA = 0
      let balanceB = 0

      tokenAccounts.value.forEach((accountInfo) => {
        const parsedInfo = accountInfo.account.data.parsed.info
        const mintAddress = parsedInfo.mint

        if (mintAddress === tokenAMint) {
          balanceA = parsedInfo.tokenAmount.uiAmount || 0
        }
        if (mintAddress === tokenBMint) {
          balanceB = parsedInfo.tokenAmount.uiAmount || 0
        }
      })

      setTokenABalance(balanceA)
      setTokenBBalance(balanceB)
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      setIsLoadingBalances(false)
    }
  }, [connection, publicKey, tokenAMint, tokenBMint])

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
    }
  }, [isOpen])

  // Fetch balances when dialog opens
  useEffect(() => {
    if (isOpen && publicKey) {
      fetchBalances()
    }
  }, [isOpen, publicKey, fetchBalances])

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

      const tokenAMintInfo = await getMint(connection, new PublicKey(tokenAMint))
      const tokenBMintInfo = await getMint(connection, new PublicKey(tokenBMint))

      const rawAmount = new BN(
        Math.floor(
          parseFloat(amount) * Math.pow(10, isTokenA ? tokenAMintInfo.decimals : tokenBMintInfo.decimals)
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
        Math.pow(10, isTokenA ? tokenBMintInfo.decimals : tokenAMintInfo.decimals)

      if (isTokenA) {
        setTokenBAmount(otherAmount.toFixed(6))
      } else {
        setTokenAAmount(otherAmount.toFixed(6))
      }
    } catch (error) {
      console.error('Error calculating amount:', error)
      toast.error('Failed to calculate estimated amount')
    } finally {
      setIsCalculating(false)
    }
  }

  const handleTokenAChange = (value: string) => {
    setTokenAAmount(value)
    if (value && value !== '0') {
      calculateEstimatedAmount(value, true)
    } else {
      setTokenBAmount('')
    }
  }

  const handleTokenBChange = (value: string) => {
    setTokenBAmount(value)
    if (value && value !== '0') {
      calculateEstimatedAmount(value, false)
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
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      })

      const signature = await sendTransaction(tx, connection, {
        signers: [positionNft],
      })

      await connection.confirmTransaction(signature, 'confirmed')

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
      const tokenAMintInfo = await getMint(connection, new PublicKey(tokenAMint))
      const tokenBMintInfo = await getMint(connection, new PublicKey(tokenBMint))

      const tokenAAmountBN = new BN(parseFloat(tokenAAmount) * Math.pow(10, tokenAMintInfo.decimals))
      const tokenBAmountBN = new BN(parseFloat(tokenBAmount) * Math.pow(10, tokenBMintInfo.decimals))

      await addLiquidityMutation.mutateAsync({
        tokenAAmount: tokenAAmountBN,
        tokenBAmount: tokenBAmountBN,
        tokenADecimals: tokenAMintInfo.decimals,
        tokenBDecimals: tokenBMintInfo.decimals,
      })
    } catch (error) {
      console.error('Error preparing add liquidity:', error)
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