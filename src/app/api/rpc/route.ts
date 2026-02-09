import { NextRequest, NextResponse } from 'next/server'

/**
 * Solana JSON-RPC proxy – keeps RPC API keys server-side only.
 *
 * Browser sends standard JSON-RPC POST to /api/rpc.
 * This route forwards it to the real RPC endpoint using server-only env vars.
 */

// Methods that are safe to proxy (whitelist to prevent abuse)
const ALLOWED_METHODS = new Set([
  // Account & balance
  'getAccountInfo',
  'getBalance',
  'getMultipleAccounts',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTokenLargestAccounts',
  'getTokenSupply',
  'getParsedAccountInfo',

  // Block & slot
  'getBlock',
  'getBlockHeight',
  'getBlockTime',
  'getSlot',
  'getSlotLeader',
  'getEpochInfo',
  'getEpochSchedule',

  // Transaction
  'getTransaction',
  'getSignatureStatuses',
  'getSignaturesForAddress',
  'sendTransaction',
  'simulateTransaction',
  'getRecentBlockhash',
  'getLatestBlockhash',
  'getFeeForMessage',
  'getMinimumBalanceForRentExemption',
  'isBlockhashValid',
  'getRecentPrioritizationFees',

  // Program
  'getProgramAccounts',

  // Network
  'getVersion',
  'getHealth',
  'getGenesisHash',
  'getClusterNodes',
  'getVoteAccounts',
  'getSupply',
  'getInflationRate',
  'getStakeMinimumDelegation',
])

// Heavy methods that benefit from a dedicated RPC (e.g. Helius DAS)
const HEAVY_METHODS = new Set([
  'getProgramAccounts',
  'getTokenAccountsByOwner',
  'getMultipleAccounts',
])

function getRpcUrl(method: string): string {
  // Route heavy methods to dedicated RPC if configured
  if (HEAVY_METHODS.has(method) && process.env.HEAVY_RPC_URL) {
    return process.env.HEAVY_RPC_URL
  }

  const url = process.env.CUSTOM_RPC_URL
  if (!url) {
    throw new Error('CUSTOM_RPC_URL is not configured')
  }
  return url
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Support both single and batched JSON-RPC requests
    const isBatch = Array.isArray(body)
    const requests = isBatch ? body : [body]

    // Validate every request in the batch
    for (const rpc of requests) {
      if (!rpc.method || typeof rpc.method !== 'string') {
        return NextResponse.json(
          { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid request: missing method' }, id: rpc.id ?? null },
          { status: 400 }
        )
      }

      if (!ALLOWED_METHODS.has(rpc.method)) {
        return NextResponse.json(
          { jsonrpc: '2.0', error: { code: -32601, message: `Method not allowed: ${rpc.method}` }, id: rpc.id ?? null },
          { status: 403 }
        )
      }
    }

    // For single requests, route based on method; for batches, use the primary RPC
    const method = isBatch ? requests[0].method : body.method
    const rpcUrl = getRpcUrl(method)

    const upstream = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isBatch ? requests : body),
    })

    const data = await upstream.json()

    return NextResponse.json(data, { status: upstream.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal proxy error'

    // Don't leak internal details to the client
    const isConfigError = message.includes('not configured')
    const clientMessage = isConfigError
      ? 'RPC proxy is not configured. Set CUSTOM_RPC_URL in .env.local.'
      : 'RPC proxy error'

    console.error('[RPC Proxy]', message)

    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: clientMessage }, id: null },
      { status: isConfigError ? 503 : 502 }
    )
  }
}
