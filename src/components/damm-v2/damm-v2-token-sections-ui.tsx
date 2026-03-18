// src/components/damm-v2/damm-v2-token-sections-ui.tsx
'use client'

import { TokenCard } from './damm-v2-token-card'
import { TokenData } from '@/lib/validators'

// ====== Types ======

/** The three activity tiers used to bucket tokens into display sections */
export type ActivityTier = 'high' | 'medium' | 'normal'

interface SectionConfig {
  /** Human-readable label shown above the section border */
  title: string
  /** Tailwind border colour class for the section container */
  borderClass: string
  /** Tailwind text colour class for the section title */
  titleClass: string
  /** Tailwind background tint class for the title bar */
  titleBgClass: string
  /** Tailwind border colour for the title bar bottom divider */
  titleBorderClass: string
}

interface TokenSectionsProps {
  /** Tokens already sorted by the active sort strategy */
  highTokens: TokenData[]
  mediumTokens: TokenData[]
  normalTokens: TokenData[]
}

// ====== Constants ======

const SECTION_CONFIGS: Record<ActivityTier, SectionConfig> = {
  high: {
    title: 'Highest Activity Right Now',
    borderClass: 'border-red-800',
    titleClass: 'text-red-700',
    titleBgClass: 'bg-red-900/10',
    titleBorderClass: 'border-red-800/20',
  },
  medium: {
    title: 'Not so high activity',
    borderClass: 'border-orange-800',
    titleClass: 'text-orange-700',
    titleBgClass: 'bg-orange-900/10',
    titleBorderClass: 'border-orange-800/20',
  },
  normal: {
    title: 'Common / Normal',
    borderClass: 'border-blue-800',
    titleClass: 'text-blue-700',
    titleBgClass: 'bg-blue-900/10',
    titleBorderClass: 'border-blue-800/20',
  },
} as const

// ====== Sub-components ======

interface TokenSectionProps {
  tier: ActivityTier
  tokens: TokenData[]
}

/**
 * Renders a single activity section: a labelled, rounded container with a
 * coloured border and a horizontally scrollable 3-column token grid inside.
 *
 * Always visible — shows an empty-state message when there are no tokens.
 */
function TokenSection({ tier, tokens }: TokenSectionProps) {
  const config = SECTION_CONFIGS[tier]

  return (
    <div className="flex flex-col gap-2">
      {/* Section title — sits above the border box */}
      <h2 className={`text-sm font-semibold tracking-wide uppercase ${config.titleClass}`}>
        {config.title}
      </h2>

      {/* Bordered container */}
      <div
        className="rounded-xl border border-border/30 overflow-hidden"
        aria-label={`${config.title} section`}
      >
        {tokens.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center py-10 px-4 text-sm text-muted-foreground">
            No tokens in this category yet
          </div>
        ) : (
          /* 1 column on mobile, 3 columns on md+ */
          <div
            className="p-3 sm:p-4"
            role="list"
            aria-label={`${config.title} tokens`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {tokens.map((token) => (
                <div key={token.mint} role="listitem">
                  <TokenCard token={token} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ====== Main Export ======

/**
 * Renders all three activity sections (High / Medium / Normal) stacked
 * vertically.  Each section contains a 3-column horizontally scrollable
 * grid of TokenCard components and always renders even when empty.
 *
 * @param highTokens   - Tokens with high activity (organic score ≥70 or high delta)
 * @param mediumTokens - Tokens with medium activity (organic score 40–69 or medium delta)
 * @param normalTokens - Tokens with low/normal activity (organic score <40 or low delta)
 */
export function TokenSectionsUI({ highTokens, mediumTokens, normalTokens }: TokenSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <TokenSection tier="high" tokens={highTokens} />
      <TokenSection tier="medium" tokens={mediumTokens} />
      <TokenSection tier="normal" tokens={normalTokens} />
    </div>
  )
}
