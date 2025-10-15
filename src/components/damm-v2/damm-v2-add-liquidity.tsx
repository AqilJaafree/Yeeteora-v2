// src/components/damm-v2/damm-v2-add-liquidity.tsx
'use client'

import { useState } from 'react'
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
import { Plus, Info, AlertTriangle, DollarSign } from 'lucide-react'
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
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)

  // Mutation for adding liquidity with position creation
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
    onSuccess: async ({ signature, position }) => {
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

  // Calculate estimated output when user inputs one amount
  const calculateEstimatedAmount = async (
    inputAmount: string,
    isTokenA: boolean
  ) => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) return

    try {
      setIsCalculating(true)

      const cpAmm = new CpAmm(connection)
      const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress))

      // Get token decimals
      const [tokenAInfo, tokenBInfo] = await Promise.all([
        getMint(connection, new PublicKey(tokenAMint)),
        getMint(connection, new PublicKey(tokenBMint)),
      ])

      const tokenADecimals = tokenAInfo.decimals
      const tokenBDecimals = tokenBInfo.decimals

      // Convert input to raw amount
      const rawAmount = new BN(
        Math.floor(
          parseFloat(inputAmount) *
            Math.pow(10, isTokenA ? tokenADecimals : tokenBDecimals)
        )
      )

      // Get deposit quote
      const quote = await cpAmm.getDepositQuote({
        inAmount: rawAmount,
        isTokenA,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
      })

      // Calculate the other token amount needed
      const otherAmount =
        parseFloat(quote.outputAmount.toString()) /
        Math.pow(10, isTokenA ? tokenBDecimals : tokenADecimals)

      // Set the calculated amount
      if (isTokenA) {
        setTokenBAmount(otherAmount.toFixed(6))
      } else {
        setTokenAAmount(otherAmount.toFixed(6))
      }

      // Calculate and set price
      const price = isTokenA
        ? otherAmount / parseFloat(inputAmount)
        : parseFloat(inputAmount) / otherAmount
      setEstimatedPrice(price)
    } catch (error) {
      console.error('Error calculating amount:', error)
      toast.error('Failed to calculate amount')
    } finally {
      setIsCalculating(false)
    }
  }

  const handleAddLiquidity = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet')
      return
    }

    if (!tokenAAmount || !tokenBAmount) {
      toast.error('Please enter both token amounts')
      return
    }

    try {
      // Get token decimals
      const [tokenAInfo, tokenBInfo] = await Promise.all([
        getMint(connection, new PublicKey(tokenAMint)),
        getMint(connection, new PublicKey(tokenBMint)),
      ])

      const tokenADecimals = tokenAInfo.decimals
      const tokenBDecimals = tokenBInfo.decimals

      // Convert to raw amounts
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
      console.error('Add liquidity error:', error)
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Add Liquidity to Pool
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Pool Info */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-400 mb-1">
                Adding to: {poolName}
              </p>
              <p className="text-xs text-muted-foreground">
                Pool: {poolAddress.slice(0, 8)}...{poolAddress.slice(-8)}
              </p>
            </div>

            {/* Token A Amount */}
            <div className="space-y-2">
              <Label htmlFor="tokenAAmount" className="flex items-center gap-2">
                {tokenASymbol} Amount
                <Info className="w-3 h-3 text-muted-foreground" />
              </Label>
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
              />
            </div>

            {/* Token B Amount */}
            <div className="space-y-2">
              <Label htmlFor="tokenBAmount" className="flex items-center gap-2">
                {tokenBSymbol} Amount
                <Info className="w-3 h-3 text-muted-foreground" />
              </Label>
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
              />
            </div>

            {/* Calculating Indicator */}
            {isCalculating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Calculating optimal amounts...
              </div>
            )}

            {/* Estimated Price */}
            {estimatedPrice !== null && !isCalculating && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium mb-1">Pool Price:</p>
                <p className="text-lg font-bold text-primary">
                  1 {tokenASymbol} = {estimatedPrice.toFixed(6)} {tokenBSymbol}
                </p>
              </div>
            )}

            {/* Important Notes */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                <div className="text-xs text-yellow-400">
                  <p className="font-medium mb-1">Important:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      A new position NFT will be created for you
                    </li>
                    <li>
                      Amounts are adjusted to match pool ratio
                    </li>
                    <li>
                      You'll earn fees proportional to your share
                    </li>
                    <li>
                      Position can be closed anytime to withdraw
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Cost Info */}
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
              <p className="font-medium mb-1">Transaction Costs:</p>
              <p>
                • Position NFT creation: ~0.02 SOL (refundable when closing)
              </p>
              <p>• Network fee: ~0.00001 SOL</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={addLiquidityMutation.isPending}
            >
              Cancel
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
            >
              {addLiquidityMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Adding Liquidity...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Liquidity
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}