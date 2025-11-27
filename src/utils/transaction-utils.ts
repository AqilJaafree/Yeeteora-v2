// src/utils/transaction-utils.ts
import { Connection, Transaction, SendOptions } from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'

/**
 * Standard SendOptions for consistent transaction handling across the application
 * These options provide optimal reliability for transaction submission
 */
export const DEFAULT_SEND_OPTIONS: SendOptions = {
  skipPreflight: false, // Always run preflight simulation
  preflightCommitment: 'confirmed', // Use confirmed commitment for preflight
  maxRetries: 3, // Retry up to 3 times on network issues
}

/**
 * Transaction validation errors
 */
export class TransactionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransactionValidationError'
  }
}

/**
 * Validates a transaction before submitting it to the wallet
 * Checks for common issues that would cause the transaction to fail
 *
 * @param transaction - The transaction to validate
 * @throws {TransactionValidationError} If validation fails
 */
export function validateTransaction(transaction: Transaction): void {
  // Check instruction count (max 64 instructions per transaction)
  if (transaction.instructions.length > 64) {
    throw new TransactionValidationError(
      `Transaction has too many instructions (${transaction.instructions.length}). Maximum is 64.`
    )
  }

  // Check if transaction has at least one instruction
  if (transaction.instructions.length === 0) {
    throw new TransactionValidationError('Transaction must have at least one instruction')
  }

  // Check if fee payer is set
  if (!transaction.feePayer) {
    throw new TransactionValidationError('Transaction must have a fee payer')
  }

  // Check if recent blockhash is set
  if (!transaction.recentBlockhash) {
    throw new TransactionValidationError('Transaction must have a recent blockhash')
  }
}

/**
 * Simulates a transaction to check if it will succeed
 * This helps catch errors before prompting the user to sign
 *
 * @param connection - Solana RPC connection
 * @param transaction - The transaction to simulate
 * @returns True if simulation succeeds
 * @throws {TransactionValidationError} If simulation fails
 */
export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction
): Promise<boolean> {
  try {
    // Simulate without verifying signatures (since transaction isn't signed yet)
    // The simulateTransaction method doesn't verify signatures by default when no signers are provided
    const simulation = await connection.simulateTransaction(transaction)

    // Check for simulation errors
    if (simulation.value.err) {
      throw new TransactionValidationError(
        `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`
      )
    }

    // Check if there are any logs indicating issues
    if (simulation.value.logs) {
      const errorLogs = simulation.value.logs.filter(log =>
        log.toLowerCase().includes('error') || log.toLowerCase().includes('failed')
      )

      if (errorLogs.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn('[Transaction Simulation] Warning logs detected:', errorLogs)
      }
    }

    return true
  } catch (error) {
    if (error instanceof TransactionValidationError) {
      throw error
    }

    // Wrap other errors in TransactionValidationError
    const errorMessage = error instanceof Error ? error.message : 'Unknown simulation error'
    throw new TransactionValidationError(`Transaction simulation failed: ${errorMessage}`)
  }
}

/**
 * Safely sends a transaction with validation and simulation
 * This is the recommended way to send transactions in the application
 *
 * @param transaction - The transaction to send
 * @param connection - Solana RPC connection
 * @param sendTransaction - Wallet adapter's sendTransaction function
 * @param options - Optional SendOptions (defaults to DEFAULT_SEND_OPTIONS)
 * @param skipSimulation - Skip simulation step (not recommended, but useful for some SDK transactions)
 * @returns Transaction signature
 *
 * @example
 * ```typescript
 * const signature = await sendTransactionSafely(
 *   tx,
 *   connection,
 *   sendTransaction
 * )
 * ```
 */
export async function sendTransactionSafely(
  transaction: Transaction,
  connection: Connection,
  sendTransaction: WalletContextState['sendTransaction'],
  options: SendOptions = DEFAULT_SEND_OPTIONS,
  skipSimulation = false
): Promise<string> {
  // Step 1: Validate transaction structure
  validateTransaction(transaction)

  // Step 2: Simulate transaction (unless explicitly skipped)
  if (!skipSimulation) {
    await simulateTransaction(connection, transaction)
  }

  // Step 3: Send transaction using wallet adapter
  // The wallet adapter automatically handles wallet-specific signing methods
  const signature = await sendTransaction(transaction, connection, options)

  return signature
}

/**
 * Confirms a transaction using polling method (more reliable than WebSocket)
 * This matches the project's requirement to use polling-based confirmation
 *
 * @param signature - Transaction signature to confirm
 * @param connection - Solana RPC connection
 * @param maxRetries - Maximum number of polling attempts (default: 30)
 * @param retryInterval - Time between polling attempts in ms (default: 2000)
 * @returns True if transaction is confirmed
 * @throws {Error} If confirmation times out or transaction fails
 */
export async function confirmTransactionWithPolling(
  signature: string,
  connection: Connection,
  maxRetries = 30,
  retryInterval = 2000
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      })

      // Check if transaction is confirmed or finalized
      if (
        status.value?.confirmationStatus === 'confirmed' ||
        status.value?.confirmationStatus === 'finalized'
      ) {
        // Check if transaction failed
        if (status.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
        }
        return true
      }

      // Check if transaction failed (even if not confirmed)
      if (status.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
      }

      // Wait before next polling attempt
      await new Promise(resolve => setTimeout(resolve, retryInterval))
    } catch (error) {
      // If it's the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw error
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryInterval))
    }
  }

  throw new Error(`Transaction confirmation timeout after ${(maxRetries * retryInterval) / 1000} seconds`)
}

/**
 * Transaction preview data structure
 * Used to show users what they're signing before wallet popup
 */
export interface TransactionPreview {
  type: string
  tokenA?: {
    symbol: string
    amount: string
  }
  tokenB?: {
    symbol: string
    amount: string
  }
  estimatedFee: string
  instructionCount: number
  accountCount: number
}

/**
 * Generates a human-readable preview of a transaction
 * This helps users understand what they're signing
 *
 * @param transaction - The transaction to preview
 * @param type - Type of transaction (e.g., "Add Liquidity", "Swap", "Close Position")
 * @returns TransactionPreview object with human-readable data
 */
export function generateTransactionPreview(
  transaction: Transaction,
  type: string
): TransactionPreview {
  // Calculate total number of unique accounts
  const accounts = new Set<string>()
  transaction.instructions.forEach(instruction => {
    instruction.keys.forEach(key => accounts.add(key.pubkey.toString()))
  })

  return {
    type,
    instructionCount: transaction.instructions.length,
    accountCount: accounts.size,
    estimatedFee: '0.00005 SOL', // Typical transaction fee (can be calculated more precisely)
  }
}
