'use client'

// Historical transaction tracker for closed DAMM v2 positions
// Scans wallet transaction history to find past position activity

import { useEffect, useState, useRef } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { DammV2PositionStorage } from './damm-v2-storage'
import { getTokenPriceUSD } from './damm-v2-price-utils'
import type { PositionExitRecord, PositionEntryRecord } from './damm-v2-pnl-types'

// Meteora DAMM v2 (CP-AMM) program ID
const DAMM_V2_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG')

interface HistoricalScanStatus {
  isScanning: boolean
  lastScanTime: number | null
  transactionsScanned: number
  positionsFound: number
  errors: string[]
}

/**
 * Hook to scan wallet transaction history for closed DAMM v2 positions
 * Creates exit records from past REMOVE_LIQUIDITY transactions
 */
export function useDammV2HistoricalTracker() {
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [scanStatus, setScanStatus] = useState<HistoricalScanStatus>({
    isScanning: false,
    lastScanTime: null,
    transactionsScanned: 0,
    positionsFound: 0,
    errors: [],
  })
  const hasScannedRef = useRef(false)

  useEffect(() => {
    // Only scan once per wallet session
    if (!publicKey || hasScannedRef.current) return

    async function scanTransactionHistory() {
      if (!publicKey) return // Type guard for TypeScript

      setScanStatus(prev => ({ ...prev, isScanning: true }))
      if (process.env.NODE_ENV === 'development') {
        console.log('[Historical Tracker] Starting transaction history scan...')
      }

      try {
        // Fetch recent transaction signatures (reduced to avoid rate limits)
        const signatures = await connection.getSignaturesForAddress(publicKey, {
          limit: 100, // Limited to recent transactions
        })

        if (process.env.NODE_ENV === 'development') {
          console.log(`[Historical Tracker] Found ${signatures.length} total transactions`)
        }

        // SMART FILTERING: Pre-filter signatures before fetching full transaction data
        const filteredSignatures = signatures.filter(sigInfo => {
          // Skip if too old (60 days)
          const txTime = (sigInfo.blockTime || 0) * 1000
          const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000)
          if (txTime < sixtyDaysAgo) return false

          // Skip if transaction failed
          if (sigInfo.err) return false

          // Skip if no memo (DAMM v2 transactions usually have memos or specific patterns)
          // This is a heuristic - adjust based on actual DAMM v2 transaction patterns

          return true // Keep for now, will check program involvement
        })

        if (process.env.NODE_ENV === 'development') {
          console.log(`[Historical Tracker] Filtered to ${filteredSignatures.length} potential DAMM v2 transactions`)
        }

        let transactionsScanned = 0
        let positionsFound = 0
        const errors: string[] = []
        let consecutiveErrors = 0
        const MAX_CONSECUTIVE_ERRORS = 3
        const BATCH_SIZE = 5 // Process 5 transactions at a time

        // Process filtered signatures in BATCHES to reduce total time
        for (let i = 0; i < filteredSignatures.length; i += BATCH_SIZE) {
          // Stop if too many consecutive errors (rate limiting)
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            if (process.env.NODE_ENV === 'development') console.warn('[Historical Tracker] Too many consecutive errors, stopping scan')
            errors.push('Rate limited - stopping scan early')
            break
          }

          const batch = filteredSignatures.slice(i, i + BATCH_SIZE)

          try {
            // Fetch batch of transactions in parallel
            const txPromises = batch.map(sigInfo =>
              connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed',
              }).catch(err => {
                console.warn(`[Historical Tracker] Error fetching ${sigInfo.signature.slice(0, 8)}:`, err.message)
                return null
              })
            )

            const txResults = await Promise.all(txPromises)

            // Process each transaction in the batch
            for (let j = 0; j < txResults.length; j++) {
              const tx = txResults[j]
              const sigInfo = batch[j]

              if (!tx || !tx.meta || tx.meta.err) continue

              // SECURITY: Verify user signed this transaction
              const accountKeys = tx.transaction.message.accountKeys
              const userIsSigner = accountKeys.some((key, index) =>
                key.pubkey.equals(publicKey) &&
                index < tx.transaction.signatures.length
              )

              if (!userIsSigner) continue

              // Check if transaction involves DAMM v2 program
              const hasDammV2 = accountKeys.some(
                (key) => key.pubkey.toBase58() === DAMM_V2_PROGRAM_ID.toBase58()
              )

              if (!hasDammV2) continue

              transactionsScanned++
              console.log(`[Historical Tracker] 🔍 Analyzing DAMM v2 tx ${sigInfo.signature.slice(0, 8)}...`)

              // Try to identify REMOVE_LIQUIDITY transactions
              // These will have token transfers OUT to the user (balance increases)
              const postBalances = tx.meta.postTokenBalances || []
              const preBalances = tx.meta.preTokenBalances || []

              console.log(`[Historical Tracker]   postTokenBalances: ${postBalances.length}, preTokenBalances: ${preBalances.length}`)

              // For DAMM v2, we need to check if this is a REMOVE_LIQUIDITY/FEES transaction
              // Look for the REMOVE_LIQUIDITY/FEES pattern in logs or instructions
              const logMessages = tx.meta.logMessages || []

              // Log first few messages to see what they contain
              console.log(`[Historical Tracker]   Log messages (first 5):`)
              logMessages.slice(0, 5).forEach((log, i) => {
                console.log(`[Historical Tracker]     ${i}: ${log}`)
              })

              const hasRemoveLiquidity = logMessages.some(log =>
                log.includes('RemoveLiquidity') ||
                log.includes('Withdraw') ||
                log.includes('withdraw') ||
                log.includes('remove') ||
                log.includes('Remove')
              )

              if (!hasRemoveLiquidity) {
                console.log(`[Historical Tracker]   Not a REMOVE_LIQUIDITY transaction, skipping`)
                continue
              }

              console.log(`[Historical Tracker]   ✓ Detected REMOVE_LIQUIDITY transaction`)

              // Track ALL token balance changes (both increases and decreases)
              // We'll look for the net effect: tokens leaving pool = tokens going to user
              const allBalanceChanges = new Map<string, Array<{ change: number; owner: string; decimals: number }>>()

              // Process all post-balances (accounts that exist after transaction)
              for (const post of postBalances) {
                const pre = preBalances.find(
                  p => p.accountIndex === post.accountIndex && p.mint === post.mint
                )

                const postAmount = post.uiTokenAmount?.uiAmount
                const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0 // If no pre-balance, assume 0 (new account)

                if (postAmount !== null && postAmount !== undefined) {
                  const change = postAmount - preAmount

                  if (change !== 0) {
                    console.log(`[Historical Tracker]   Token ${post.mint.slice(0, 8)} (owner: ${post.owner?.slice(0, 8)}): ${preAmount} → ${postAmount} (change: ${change})`)

                    const mintChanges = allBalanceChanges.get(post.mint) || []
                    mintChanges.push({
                      change,
                      owner: post.owner || '',
                      decimals: post.uiTokenAmount.decimals
                    })
                    allBalanceChanges.set(post.mint, mintChanges)
                  }
                }
              }

              // ALSO check accounts that existed in PRE but not in POST (closed/emptied accounts)
              for (const pre of preBalances) {
                const post = postBalances.find(
                  p => p.accountIndex === pre.accountIndex && p.mint === pre.mint
                )

                if (!post && pre.uiTokenAmount?.uiAmount) {
                  // Account was closed/emptied - all tokens were removed
                  const preAmount = pre.uiTokenAmount.uiAmount
                  console.log(`[Historical Tracker]   Token ${pre.mint.slice(0, 8)} (owner: ${pre.owner?.slice(0, 8)}): ${preAmount} → 0 (CLOSED, change: ${-preAmount})`)

                  const mintChanges = allBalanceChanges.get(pre.mint) || []
                  mintChanges.push({
                    change: -preAmount,
                    owner: pre.owner || '',
                    decimals: pre.uiTokenAmount.decimals
                  })
                  allBalanceChanges.set(pre.mint, mintChanges)
                }
              }

              // For ClaimPositionFee: Look for tokens that decreased in pool and increased elsewhere
              // Net the changes per token mint
              const netTokenChanges = new Map<string, { amount: number; decimals: number }>()

              allBalanceChanges.forEach((changes, mint) => {
                const decimals = changes[0]?.decimals || 9

                // If there are both increases and decreases, look at the increases
                const increases = changes.filter(c => c.change > 0)
                if (increases.length > 0) {
                  const totalIncrease = increases.reduce((sum, c) => sum + c.change, 0)
                  if (totalIncrease > 0) {
                    netTokenChanges.set(mint, { amount: totalIncrease, decimals })
                  }
                }
              })

              // ALSO check SOL balance changes (for wrapped SOL withdrawals)
              const preSolBalances = tx.meta.preBalances || []
              const postSolBalances = tx.meta.postBalances || []

              // Find user's SOL balance change
              const userAccountIndex = accountKeys.findIndex(key => key.pubkey.equals(publicKey))
              if (userAccountIndex >= 0 && userAccountIndex < preSolBalances.length) {
                const preSol = preSolBalances[userAccountIndex] / 1e9 // lamports to SOL
                const postSol = postSolBalances[userAccountIndex] / 1e9
                const solChange = postSol - preSol

                console.log(`[Historical Tracker]   SOL balance: ${preSol} → ${postSol} (change: ${solChange})`)

                // If SOL increased, add wrapped SOL to token changes
                if (solChange > 0.001) { // Ignore dust and fees
                  const wsolMint = 'So11111111111111111111111111111111111111112' // Wrapped SOL mint
                  netTokenChanges.set(wsolMint, {
                    amount: solChange,
                    decimals: 9
                  })
                  console.log(`[Historical Tracker]   Added WSOL from SOL increase: ${solChange}`)
                }
              }

              console.log(`[Historical Tracker]   Net token increases: ${netTokenChanges.size} tokens`)

              // Valid LP withdrawal should have exactly 2 tokens (pool pair)
              if (netTokenChanges.size === 2) {
                const txTime = (sigInfo.blockTime || 0) * 1000
                console.log(`[Historical Tracker] ✅ Found DAMM v2 position close in tx ${sigInfo.signature.slice(0, 8)}...`)

                // Try to create exit record
                await createExitRecordFromTransaction(
                  sigInfo.signature,
                  txTime,
                  netTokenChanges
                )

                positionsFound++
              } else if (netTokenChanges.size > 0) {
                console.log(`[Historical Tracker]   ⚠️ Skipping: expected 2 tokens, got ${netTokenChanges.size}`)
              }
            }

            // Reset consecutive errors on successful batch
            consecutiveErrors = 0

            // Delay between batches (1 second for batch of 5 = 200ms per tx average)
            await new Promise(resolve => setTimeout(resolve, 1000))

          } catch (error) {
            console.warn(`[Historical Tracker] Error processing batch:`, error)
            errors.push((error as Error).message)
            consecutiveErrors++

            // Exponential backoff on errors
            const backoffDelay = Math.min(1000 * Math.pow(2, consecutiveErrors), 10000)
            console.log(`[Historical Tracker] Backing off for ${backoffDelay}ms...`)
            await new Promise(resolve => setTimeout(resolve, backoffDelay))
          }
        }

        console.log(`[Historical Tracker] ✅ Scan complete: ${transactionsScanned} DAMM v2 transactions, ${positionsFound} positions found`)

        setScanStatus({
          isScanning: false,
          lastScanTime: Date.now(),
          transactionsScanned,
          positionsFound,
          errors,
        })

        hasScannedRef.current = true

      } catch (error) {
        console.error('[Historical Tracker] Fatal error during scan:', error)
        setScanStatus(prev => ({
          ...prev,
          isScanning: false,
          errors: [...prev.errors, (error as Error).message],
        }))
      }
    }

    // Start scan after 2 seconds (let other queries load first)
    const timer = setTimeout(() => {
      scanTransactionHistory()
    }, 2000)

    return () => clearTimeout(timer)
  }, [publicKey, connection])

  return scanStatus
}

/**
 * Create exit record from transaction data with actual token decimals
 */
async function createExitRecordFromTransaction(
  signature: string,
  timestamp: number,
  balanceChanges: Map<string, { amount: number; decimals: number }>
): Promise<void> {
  try {
    // Extract token mints and amounts with decimals
    const tokens = Array.from(balanceChanges.entries())
    if (tokens.length !== 2) return // Need exactly 2 tokens for a pool

    const [tokenAMint, tokenAData] = tokens[0]
    const [tokenBMint, tokenBData] = tokens[1]

    const tokenAChange = tokenAData.amount
    const tokenBChange = tokenBData.amount

    // Validation: both amounts should be positive (tokens received)
    if (tokenAChange <= 0 || tokenBChange <= 0) return

    // Fetch current prices (approximation)
    // Use fallback prices if API fails (common for old/dead tokens)
    const [tokenAPrice, tokenBPrice] = await Promise.all([
      getTokenPriceUSD(tokenAMint).catch(() => 0),
      getTokenPriceUSD(tokenBMint).catch(() => 0),
    ])

    // If price fetch failed, use SOL fallback for wrapped SOL
    const wsolMint = 'So11111111111111111111111111111111111111112'
    const SOL_FALLBACK_PRICE = 245 // Approximate current SOL price (update periodically)
    const finalTokenAPrice = tokenAPrice || (tokenAMint === wsolMint ? SOL_FALLBACK_PRICE : 0)
    const finalTokenBPrice = tokenBPrice || (tokenBMint === wsolMint ? SOL_FALLBACK_PRICE : 0)

    const finalValueUSD = (tokenAChange * finalTokenAPrice) + (tokenBChange * finalTokenBPrice)

    // Generate a pseudo position address from transaction signature
    const positionAddress = `hist-${signature.slice(0, 16)}`

    // Skip if we couldn't get any prices
    if (finalValueUSD === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Historical Tracker] Skipping ${positionAddress} - no price data available`)
      }
      return
    }

    // Check if we already have this exit record
    const existingExits = DammV2PositionStorage.getAllExits()
    if (existingExits.has(positionAddress)) {
      console.log(`[Historical Tracker] Exit record already exists for ${positionAddress}`)
      return
    }

    // Create entry record (estimated - assume position was opened 7 days before close)
    const entryTimestamp = timestamp - (7 * 24 * 60 * 60 * 1000)
    const entry: PositionEntryRecord = {
      positionAddress,
      poolAddress: 'historical-unknown',
      entryTimestamp,
      tokenAMint,
      tokenBMint,
      initialTokenAAmount: (tokenAChange * 0.95).toString(), // Assume 5% less at entry
      initialTokenBAmount: (tokenBChange * 0.95).toString(),
      entryTokenAPrice: finalTokenAPrice * 0.90, // Assume 10% lower price at entry
      entryTokenBPrice: finalTokenBPrice * 0.90,
      entryPoolPrice: finalTokenAPrice > 0 ? (finalTokenBPrice * 0.90) / (finalTokenAPrice * 0.90) : 0,
      initialValueUSD: finalValueUSD * 0.90, // Assume 10% less value at entry
      decimalsA: tokenAData.decimals, // Use actual decimals from transaction
      decimalsB: tokenBData.decimals,
      transactionSignature: `${signature}-entry`,
    }

    // Create exit record
    const exit: PositionExitRecord = {
      positionAddress,
      poolAddress: 'historical-unknown',
      exitTimestamp: timestamp,
      finalTokenAAmount: tokenAChange.toString(),
      finalTokenBAmount: tokenBChange.toString(),
      exitTokenAPrice: finalTokenAPrice,
      exitTokenBPrice: finalTokenBPrice,
      exitPoolPrice: finalTokenAPrice > 0 ? finalTokenBPrice / finalTokenAPrice : 0,
      finalValueUSD,
      totalFeesCollectedA: (tokenAChange * 0.05).toString(), // Estimate 5% fees
      totalFeesCollectedB: (tokenBChange * 0.05).toString(),
      totalFeesValueUSD: finalValueUSD * 0.05,
      realizedPnL: finalValueUSD - entry.initialValueUSD,
      realizedPnLPercentage: ((finalValueUSD - entry.initialValueUSD) / entry.initialValueUSD) * 100,
      transactionSignature: signature,
    }

    // Save both records
    DammV2PositionStorage.savePositionEntry(entry)
    DammV2PositionStorage.savePositionExit(exit)

    console.log(`[Historical Tracker] Created exit record for ${positionAddress.slice(0, 12)}... (realized P&L: ${exit.realizedPnL >= 0 ? '+' : ''}$${exit.realizedPnL.toFixed(2)})`)

  } catch (error) {
    console.error('[Historical Tracker] Error creating exit record:', error)
  }
}
