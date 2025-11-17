// src/components/account/account-ui.tsx - Mobile-optimized version
'use client'

import { PublicKey } from '@solana/web3.js'
import { LPPositions } from './lp-positions-ui'
import { DammV2Positions } from './dammv2-positions-ui'

// Updated AccountTokens component with mobile-optimized design
export function AccountTokens({ address }: { address: PublicKey }) {
  return (
    <div className="space-y-8">
      {/* DLMM LP Positions Section */}
      <LPPositions address={address} />

      {/* DAMM v2 Positions Section */}
      <DammV2Positions address={address} />
    </div>
  )
}
