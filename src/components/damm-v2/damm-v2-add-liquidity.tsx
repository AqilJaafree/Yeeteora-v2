// src/components/damm-v2/damm-v2-add-liquidity.tsx
'use client'

import { useState, useEffect } from 'react'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Info, AlertTriangle, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import BN from 'bn.js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { JupiterWidget } from './jupiter-widget'

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

  // Get the non-SOL token mint for Jupiter swap
  const getSwapTokenMint = () => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    if (tokenAMint === SOL_MINT) return tokenBMint
    if (tokenBMint === SOL_MINT) return tokenAMint
    return tokenAMint // fallback
  }

  // Fetch token balances
  const fetchBalances = async () => {
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
  }

  const [jupiterContainerId, setJupiterContainerId] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab === 'swap' && isOpen) {
      // Create unique container ID for each Jupiter instance
      const uniqueId = `jupiter-swap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      // Initialize Jupiter when swap tab is active
      setTimeout(() => {
        if (typeof window !== "undefined" && window.Jupiter) {
          try {
            // Create new container div
            const container = document.getElementById("jupiter-swap-container")
            if (container) {
              container.innerHTML = `<div id="${uniqueId}" class="w-full h-full"></div>`
              
              window.Jupiter.init({
                displayMode: "integrated",
                integratedTargetId: uniqueId,
                formProps: {
                  initialInputMint: "So11111111111111111111111111111111111111112", // SOL
                  initialOutputMint: getSwapTokenMint(),
                  swapMode: "ExactIn",
                },
              })
              
              setJupiterContainerId(uniqueId)
            }
          } catch (error) {
            console.error('Failed to initialize Jupiter:', error)
          }
        }
      }, 100)
    } else if (activeTab === 'liquidity') {
      // Force remove Jupiter container when switching to liquidity tab
      const container = document.getElementById("jupiter-swap-container")
      if (container) {
        container.innerHTML = ""
      }
      
      // Also try to remove any lingering Jupiter elements
      const jupiterElements = document.querySelectorAll('[id*="jupiter"]')
      jupiterElements.forEach(el => {
        if (el.id !== "jupiter-swap-container") {
          el.remove()
        }
      })
      
      setJupiterContainerId(null)
    }
  }, [activeTab, isOpen]) // Removed jupiterContainerId from dependencies

  // Cleanup Jupiter when modal closes
  useEffect(() => {
    if (!isOpen) {
      const container = document.getElementById("jupiter-swap-container")
      if (container) {
        container.innerHTML = ""
      }
      
      // Remove any lingering Jupiter elements
      const jupiterElements = document.querySelectorAll('[id*="jupiter"]')
      jupiterElements.forEach(el => {
        if (el.id !== "jupiter-swap-container") {
          el.remove()
        }
      })
      
      setJupiterContainerId(null)
    }
  }, [isOpen])

  // Fetch balances when dialog opens
  useEffect(() => {
    if (isOpen && publicKey) {
      fetchBalances()
    }
  }, [isOpen, publicKey])

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

      // Use getDepositQuote method instead
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
        <DialogContent className="sm:max-w-[500px] bg-[#1a1a2e] border-gray-600 text-white">
          <DialogHeader>
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

          {activeTab === 'liquidity' ? (
            <div className="space-y-4 py-4">
              {/* Pool Info - Maintain Original Format */}
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
                      <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Balance: {tokenABalance.toFixed(6)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={setMaxTokenA}
                      className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
                    >
                      MAX
                    </Button>
                  </div>
                </div>
                <Input
                  id="tokenAAmount"
                  type="number"
                  value={tokenAAmount}
                  onChange={(e) => handleTokenAChange(e.target.value)}
                  placeholder="0.00"
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
                      <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Balance: {tokenBBalance.toFixed(6)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={setMaxTokenB}
                      className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
                    >
                      MAX
                    </Button>
                  </div>
                </div>
                <Input
                  id="tokenBAmount"
                  type="number"
                  value={tokenBAmount}
                  onChange={(e) => handleTokenBChange(e.target.value)}
                  placeholder="0.00"
                  className="bg-[#2a2a3e] border-gray-600 text-white"
                  disabled={isCalculating}
                />
                {isCalculating && (
                  <p className="text-xs text-gray-400">Calculating estimated amount...</p>
                )}
              </div>

              {/* Important Notice */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-400">
                  <p className="font-medium mb-1">Important:</p>
                  <ul className="space-y-1">
                    <li>• A new position NFT will be created for you</li>
                    <li>• Amounts are adjusted to match pool ratio</li>
                    <li>• You'll earn fees proportional to your share</li>
                    <li>• Position can be closed anytime to withdraw</li>
                  </ul>
                </div>
              </div>

              {/* Transaction Costs */}
              <div className="text-xs text-gray-400 bg-[#2a2a3e] p-3 rounded-lg border border-gray-600">
                <p className="font-medium mb-1 text-white">Transaction Costs:</p>
                <p>• Position NFT creation: ~0.02 SOL (refundable when closing)</p>
                <p>• Network fee: ~0.00001 SOL</p>
              </div>
            </div>
          ) : (
            // Swap Tab Content
            <div className="py-4">
              {/* Jupiter Terminal Container */}
              <div 
                id="jupiter-swap-container"
                className="w-full min-h-[500px] rounded-lg"
              >
              </div>
            </div>
          )}

          {activeTab === 'liquidity' && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={addLiquidityMutation.isPending}
                className="bg-transparent border-gray-600 text-white hover:bg-gray-800"
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
                className="bg-primary hover:bg-secondary text-white"
              >
                {addLiquidityMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Adding Liquidity...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    + ADD LIQUIDITY
                  </div>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}