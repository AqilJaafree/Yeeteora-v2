// src/components/account/account-ui.tsx - Mobile-optimized version
'use client'

import { PublicKey } from '@solana/web3.js'
import { UnifiedPositions } from './unified-positions-ui'

// Updated AccountTokens component with unified positions view
export function AccountTokens({ address }: { address: PublicKey }) {
  return (
    <div className="space-y-8">
      {/* Unified Positions (DLMM + DAMM v2) */}
      <UnifiedPositions address={address} />
    </div>
  )
}
