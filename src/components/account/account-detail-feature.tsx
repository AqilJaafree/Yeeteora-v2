'use client'

import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { useParams } from 'next/navigation'
// import { ExplorerLink } from '../cluster/cluster-ui'
import { AccountTokens } from './account-ui'
import { ProfileStatsCard } from './profile-stats-card'
// import { AppHero } from '../app-hero'
// import { ellipsify } from '@/lib/utils'

export default function AccountDetailFeature() {
  const params = useParams()
  const address = useMemo(() => {
    if (!params.address) {
      return
    }
    try {
      return new PublicKey(params.address)
    } catch (e) {
      console.log(`Invalid public key`, e)
    }
  }, [params])
  if (!address) {
    return <div>Error loading account</div>
  }

  return (
    <div className='lg:mt-[80px] mt-[40px] space-y-8 md:space-y-14 lg:space-y-20'>
      {/* Profile Stats Card */}
      <ProfileStatsCard />
      
      {/* Mobile-optimized Hero Section */}
      {/* <div className="px-4 py-6 space-y-6">
        <AccountBalance address={address} /> 
        <AccountButtons address={address} /> 
      </div> */}

      {/* Main Content */}
        <AccountTokens address={address} />
        {/* <AccountTransactions address={address} /> */}
    </div>
  )
}
