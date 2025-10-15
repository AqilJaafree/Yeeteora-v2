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
import { Plus, Info, AlertTriangle } from 'lucide-react'
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
  const [tokenAAmount, setTokenAAmount] = useState('')
  const [tokenBAmount, setTokenBAmount] = useState('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [tokenABalance, setTokenABalance] = useState<number>(0)
  const [tokenBBalance, setTokenBBalance] = useState<number>(0)
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)

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

  // Fetch balances when dialog opens
  useEffect(() => {
    if (isOpen && publicKey) {
      fetchBalances()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        action: {
          label: 'View on Meteora',
          onClick: () => window.open(`https://meteora.ag/dammv2/${poolAddress}`, '_blank'),
        },
      })

      await client.invalidateQueries({
        queryKey: ['damm-v2-positions'],
      })

      setIsOpen(false)
      setTokenAAmount('')
      setTokenBAmount('')
    },
    onError: (error) => {
      console.error('Add liquidity error:', error)
      toast.error('Failed to add liquidity', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })

  const calculateEstimatedAmount = async (inputAmount: string, isTokenA: boolean) => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) return

    try {
      setIsCalculating(true)

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress))

      const [tokenAInfo, tokenBInfo] = await Promise.all([
        getMint(connection, new PublicKey(tokenAMint)),
        getMint(connection, new PublicKey(tokenBMint)),
      ])

      const tokenADecimals = tokenAInfo.decimals
      const tokenBDecimals = tokenBInfo.decimals

      const rawAmount = new BN(
        Math.floor(
          parseFloat(inputAmount) *
            Math.pow(10, isTokenA ? tokenADecimals : tokenBDecimals)
        )
      )

      const quote = await cpAmm.getDepositQuote({
        inAmount: rawAmount,
        isTokenA,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
      })

      const otherAmount =
        parseFloat(quote.outputAmount.toString()) /
        Math.pow(10, isTokenA ? tokenBDecimals : tokenADecimals)

      if (isTokenA) {
        setTokenBAmount(otherAmount.toFixed(6))
      } else {
        setTokenAAmount(otherAmount.toFixed(6))
      }
    } catch (error) {
      console.error('Error calculating estimate:', error)
      toast.error('Failed to calculate amounts')
    } finally {
      setIsCalculating(false)
    }
  }

  const handleAddLiquidity = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!tokenAAmount || !tokenBAmount) {
      toast.error('Please enter both token amounts')
      return
    }

    try {
      const [tokenAInfo, tokenBInfo] = await Promise.all([
        getMint(connection, new PublicKey(tokenAMint)),
        getMint(connection, new PublicKey(tokenBMint)),
      ])

      const tokenADecimals = tokenAInfo.decimals
      const tokenBDecimals = tokenBInfo.decimals

      const tokenAAmountBN = new BN(
        Math.floor(parseFloat(tokenAAmount) * Math.pow(10, tokenADecimals))
      )
      const tokenBAmountBN = new BN(
        Math.floor(parseFloat(tokenBAmount) * Math.pow(10, tokenBDecimals))
      )

      await addLiquidityMutation.mutateAsync({
        tokenAAmount: tokenAAmountBN,
        tokenBAmount: tokenBAmountBN,
        tokenADecimals,
        tokenBDecimals,
      })
    } catch (error) {
      console.error('Error in handleAddLiquidity:', error)
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
              Adding to: {tokenASymbol}-{tokenBSymbol}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
                    <span className="text-xs text-gray-400">Loading...</span>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400">
                        Balance: {tokenABalance.toFixed(6)}
                      </span>
                      <button
                        onClick={setMaxTokenA}
                        className="text-xs text-primary hover:text-secondary font-semibold"
                        type="button"
                      >
                        MAX
                      </button>
                    </>
                  )}
                </div>
              </div>
              <Input
                id="tokenAAmount"
                type="number"
                placeholder="0.00"
                value={tokenAAmount}
                onChange={(e) => {
                  setTokenAAmount(e.target.value)
                  if (e.target.value && parseFloat(e.target.value) > 0) {
                    calculateEstimatedAmount(e.target.value, true)
                  }
                }}
                disabled={isCalculating}
                className="bg-[#2a2a3e] border-gray-600 text-white"
              />
            </div>

            {/* Loading indicator between inputs */}
            {isCalculating && (
              <div className="flex items-center justify-center py-2">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-primary rounded-full animate-spin" />
              </div>
            )}

            {/* Token B Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tokenBAmount" className="flex items-center gap-2 text-white">
                  {tokenBSymbol} Amount
                  <Info className="w-3 h-3 text-gray-400" />
                </Label>
                <div className="flex items-center gap-2">
                  {isLoadingBalances ? (
                    <span className="text-xs text-gray-400">Loading...</span>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400">
                        Balance: {tokenBBalance.toFixed(6)}
                      </span>
                      <button
                        onClick={setMaxTokenB}
                        className="text-xs text-primary hover:text-secondary font-semibold"
                        type="button"
                      >
                        MAX
                      </button>
                    </>
                  )}
                </div>
              </div>
              <Input
                id="tokenBAmount"
                type="number"
                placeholder="0.00"
                value={tokenBAmount}
                onChange={(e) => {
                  setTokenBAmount(e.target.value)
                  if (e.target.value && parseFloat(e.target.value) > 0) {
                    calculateEstimatedAmount(e.target.value, false)
                  }
                }}
                disabled={isCalculating}
                className="bg-[#2a2a3e] border-gray-600 text-white"
              />
            </div>

            {/* Important Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div className="flex gap-3">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div className="text-xs text-yellow-400">
                  <p className="font-medium mb-1">Important:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>A new position NFT will be created for you</li>
                    <li>Amounts are adjusted to match pool ratio</li>
                    <li>You&apos;ll earn fees proportional to your share</li>
                    <li>Position can be closed anytime to withdraw</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Cost Info */}
            <div className="text-xs text-gray-400 bg-[#2a2a3e] p-3 rounded-lg border border-gray-600">
              <p className="font-medium mb-1 text-white">Transaction Costs:</p>
              <p>• Position NFT creation: ~0.02 SOL (refundable when closing)</p>
              <p>• Network fee: ~0.00001 SOL</p>
            </div>
          </div>

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
        </DialogContent>
      </Dialog>
    </>
  )
}