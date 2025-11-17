'use client'

import { useState} from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { useGetBalance } from '../account/account-data-access'

// Import Meteora DLMM SDK
import DLMM, { StrategyType } from '@meteora-ag/dlmm'
import { BN } from '@coral-xyz/anchor'

interface AddLPPositionProps {
  pairAddress: string
  pairName: string
  isSOLPair: boolean
}

export function AddLPPosition({ pairAddress, pairName, isSOLPair }: AddLPPositionProps) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [solAmount, setSolAmount] = useState('')
  const [showStrategyInfo, setShowStrategyInfo] = useState(false)
  // const [showNotesInfo, setShowNotesInfo] = useState(false)

  // Get wallet balance
  const balanceQuery = useGetBalance({ address: publicKey || new PublicKey('11111111111111111111111111111112') })
  const walletBalanceSOL = balanceQuery.data && publicKey ? balanceQuery.data / LAMPORTS_PER_SOL : 0

  // Function to set percentage of wallet balance
  const setPercentageAmount = (percentage: number) => {
    if (walletBalanceSOL > 0) {
      const amount = (walletBalanceSOL * percentage) / 100
      // Keep some SOL for transaction fees (at least 0.01 SOL)
      const maxUsable = Math.max(0, walletBalanceSOL - 0.01)
      const finalAmount = Math.min(amount, maxUsable)
      setSolAmount(Math.max(0, finalAmount).toFixed(3))
    }
  }

  // Check if this is a SOL pair (SOL as one of the tokens)
  if (!isSOLPair) {
    return null // Only show for SOL pairs
  }

  // Polling-based confirmation method
  const confirmTransactionWithPolling = async (signature: string, maxRetries = 30): Promise<boolean> => {
    console.log('Starting transaction confirmation with polling...')

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true })

        console.log(`Attempt ${attempt + 1}: Transaction status:`, status.value)

        if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
          if (status.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
          }
          console.log('Transaction confirmed successfully!')
          return true
        }

        if (status.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
        }

        // Wait 2 seconds before next attempt
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        console.warn(`Confirmation attempt ${attempt + 1} failed:`, error)

        // If it's the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw error
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    throw new Error('Transaction confirmation timeout after 60 seconds')
  }

  const handleAddPosition = async () => {
    if (!publicKey || !sendTransaction) {
      toast.error('Please connect your wallet')
      return
    }

    if (!solAmount || parseFloat(solAmount) < 0.02) {
      toast.error('Minimum SOL amount is 0.02 SOL')
      return
    }

    setIsLoading(true)

    try {
      console.log('Creating DLMM pool instance...')

      // Create DLMM pool instance
      const dlmmPool = await DLMM.create(connection, new PublicKey(pairAddress))

      console.log('Getting active bin...')
      // Get active bin information
      const activeBin = await dlmmPool.getActiveBin()

      console.log('Active bin:', activeBin)

      // Check which token is SOL
      const SOL_MINT = 'So11111111111111111111111111111111111111112'
      const isTokenXSOL = dlmmPool.tokenX.publicKey.toString() === SOL_MINT
      const isTokenYSOL = dlmmPool.tokenY.publicKey.toString() === SOL_MINT

      if (!isTokenXSOL && !isTokenYSOL) {
        throw new Error('This pair does not contain SOL')
      }

      console.log('SOL token detected:', isTokenXSOL ? 'Token X' : 'Token Y')

      // FIXED: Calculate range for one-sided BidAsk position - exactly 69 bins
      const NUM_BINS = 69
      let minBinId: number
      let maxBinId: number

      if (isTokenXSOL) {
        // SOL is Token X - place bins ABOVE current price for one-sided position
        // This creates a "bid" side where SOL is only used when price goes up
        minBinId = activeBin.binId + 1 // Start 1 bin above current price
        maxBinId = minBinId + (NUM_BINS - 1) // Exactly 69 bins total
      } else {
        // SOL is Token Y - place bins BELOW current price for one-sided position
        // This creates an "ask" side where SOL is only used when price goes down
        maxBinId = activeBin.binId - 1 // End 1 bin below current price
        minBinId = maxBinId - (NUM_BINS - 1) // Exactly 69 bins total
      }

      console.log('One-sided BidAsk position range:', {
        minBinId,
        maxBinId,
        activeBinId: activeBin.binId,
        totalBins: maxBinId - minBinId + 1,
      })

      // Convert SOL amount to lamports
      const solInLamports = new BN(parseFloat(solAmount) * LAMPORTS_PER_SOL)

      // Set amounts for one-sided position (SOL only)
      let totalXAmount: BN
      let totalYAmount: BN

      if (isTokenXSOL) {
        totalXAmount = solInLamports // All SOL goes to X
        totalYAmount = new BN(0) // No Y token
      } else {
        totalXAmount = new BN(0) // No X token
        totalYAmount = solInLamports // All SOL goes to Y
      }

      console.log('Position amounts:', {
        totalXAmount: totalXAmount.toString(),
        totalYAmount: totalYAmount.toString(),
        isTokenXSOL,
        strategy: 'BidAsk one-sided',
      })

      // Generate new position keypair
      const newPosition = new Keypair()
      console.log('New position address:', newPosition.publicKey.toString())

      // Create one-sided liquidity position with BidAsk strategy and FIXED bin range
      console.log('Creating BidAsk position transaction...')
      const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType: StrategyType.BidAsk, // Keep BidAsk for asymmetric one-sided distribution
        },
      })

      console.log('Sending transaction...')

      // Send transaction
      const signature = await sendTransaction(createPositionTx, connection, {
        signers: [newPosition],
      })

      console.log('Transaction sent:', signature)

      // Use polling-based confirmation instead of WebSocket subscription
      console.log('Confirming transaction with polling method...')
      await confirmTransactionWithPolling(signature)

      console.log('Position address:', newPosition.publicKey.toString())

      // Close modal on success
      setIsOpen(false)
      setSolAmount('')

      // Show success toast
      toast.success('LP Position Created Successfully!', {
        description: `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        action: {
          label: 'View Transaction',
          onClick: () => window.open(`https://explorer.solana.com/tx/${signature}`, '_blank'),
        },
      })
    } catch (err: unknown) {
      console.error('Error creating LP position:', err)
      toast.error('Failed to create LP position', {
        description: err instanceof Error ? err.message : 'Please try again later',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="lg:w-fit w-full">
          <Plus className="h-4 w-4" />
          Add LP
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px] gradient-card flex flex-col bg-background">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-xl">Add Liquidity to {pairName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 px-1 overflow-y-auto flex-1 min-h-0">
          {/* Strategy Section */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-primary">One-Sided BidAsk</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowStrategyInfo(!showStrategyInfo)}
                className="h-auto text-muted-foreground hover:text-primary"
              >
                <Info className="w-4 h-4" />
              </Button>
            </div>
            {showStrategyInfo && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Places your SOL liquidity strategically above or below current price for directional trading. Your SOL
                will only be active when the market moves in your favor.
              </p>
            )}
          </div>

          {/* Position Form */}
          <div className="space-y-4">
            {/* SOL Amount */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="solAmount" className="text-sm font-medium flex items-center gap-2">
                  SOL Amount
                </Label>
                {publicKey && balanceQuery.data && (
                  <span className="text-xs text-sub-text font-serif">Balance: {walletBalanceSOL.toFixed(3)} SOL</span>
                )}
              </div>

              <Input
                id="solAmount"
                type="number"
                placeholder=""
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                min="0.02"
                step="0.01"
                className="text-sm py-3 px-4 rounded-[8px]"
              />

              {/* Percentage Buttons */}
              {publicKey && walletBalanceSOL > 0.02 && (
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map((percentage) => {
                    const amount = (walletBalanceSOL * percentage) / 100
                    const maxUsable = Math.max(0, walletBalanceSOL - 0.01)
                    const finalAmount = Math.min(amount, maxUsable)

                    return (
                      <Button
                        key={percentage}
                        variant="secondary"
                        size="sm"
                        onClick={() => setPercentageAmount(percentage)}
                        disabled={finalAmount < 0.02}
                        className="text-xs h-8 border-primary"
                      >
                        {percentage}%
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Important Notes */}
          <div className="bg-quaternary-foreground border border-quaternary p-4">
            <p className="text-sm font-bold text-quaternary">Info</p>
            <span className="font-serif text-sm">Single-sided liquidity means you only provide SOL.</span>
          </div>

          <div className='text-xs font-serif flex flex-col gap-1'>
            <span className='text-sub-text'>SOL needed to create 1 positions:</span>
            <span>0.057456080 SOL (Refundable)</span>
          </div>
        </div>

        <DialogFooter className="pt-6 border-t border-border/20 px-1 flex-shrink-0 mt-auto">
          <div className="flex gap-3 w-full">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading} className="flex-1 py-3">
              Cancel
            </Button>
            <Button
              onClick={handleAddPosition}
              disabled={isLoading || !publicKey}
              className="flex-1 gradient-primary border-0 text-white hover:opacity-90 py-3"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Position
                </div>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
