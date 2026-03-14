'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FAQItem {
  question: string
  answer: React.ReactNode
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is DLMM ?',
    answer: (
      <div className="space-y-3">
        <p>
          <span className="text-cyan-300 font-semibold">DLMM</span> stands for{' '}
          <span className="text-white font-medium">Dynamic Liquidity Market Maker</span> — Meteora&apos;s
          concentrated liquidity product on Solana.
        </p>
        <p>
          Unlike a regular AMM that spreads your liquidity across all prices, DLMM lets you pick a
          tight price range called <span className="text-cyan-300 font-medium">bins</span>. When the
          price stays inside your range, you capture a much larger share of swap fees. When it moves
          out, you stop earning until it comes back.
        </p>
        <p className="text-gray-400 text-sm">
          Think of it like setting up a food stall only on the busiest street corner — great
          returns when people walk by, but no sales when they don&apos;t.
        </p>
      </div>
    ),
  },
  {
    question: 'How about DAMM ?',
    answer: (
      <div className="space-y-3">
        <p>
          <span className="text-cyan-300 font-semibold">DAMM v2</span> stands for{' '}
          <span className="text-white font-medium">Dynamic Automated Market Maker v2</span> — also
          by Meteora, but built for a different use case.
        </p>
        <p>
          DAMM v2 pools are ideal for <span className="text-cyan-300 font-medium">new tokens</span>.
          They use a virtual price curve that starts concentrated near the launch price and gradually
          widens as trading activity grows. This gives early LPs great fees without needing to
          manage positions manually.
        </p>
        <p>
          Yeeteora&apos;s signal feed watches for tokens with fresh DAMM v2 pools — catching the
          fee rush before the crowd shows up.
        </p>
      </div>
    ),
  },
  {
    question: 'Why do you give out free signals ?',
    answer: (
      <div className="space-y-3">
        <p>
          The honest answer: <span className="text-cyan-300 font-medium">liquidity benefits everyone</span>.
          More LPs in a pool means tighter spreads and lower fees for traders, which attracts more
          volume, which pays more fees back to LPs. It&apos;s a flywheel.
        </p>
        <p>
          We want to make LP strategies accessible to people who don&apos;t have the time to monitor
          WebSocket feeds and filter through hundreds of tokens manually. Yeeteora automates that
          signal pipeline and surfaces only the interesting ones.
        </p>
        <p className="text-gray-400 text-sm">
          No hidden agenda. No premium tier selling the same data faster. What you see is what we use.
        </p>
      </div>
    ),
  },
  {
    question: 'Are your signals good enough ?',
    answer: (
      <div className="space-y-3">
        <p>
          Signals on Yeeteora are derived from two data sources:
        </p>
        <ul className="space-y-2 ml-1">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span>
              <span className="text-cyan-300 font-medium">Real-time trade deltas</span> — we track
              how many buys are hitting Jupiter vs other DEXes in rolling windows. A spike on Jupiter
              often means retail is piling in via the aggregator.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span>
              <span className="text-cyan-300 font-medium">Jupiter Organic Score</span> — Jupiter&apos;s
              own metric for filtering bot activity. Scores above 70 are considered clean organic
              demand. Below 40 suggests wash trading or bots.
            </span>
          </li>
        </ul>
        <p className="text-gray-400 text-sm">
          No signal is perfect. Treat these as a starting point, not a guarantee. Always check the
          token&apos;s age, holder count, and pool conditions before committing capital.
        </p>
      </div>
    ),
  },
  {
    question: 'Can I earn money with this ?',
    answer: (
      <div className="space-y-3">
        <p>
          Yes — but with real risk attached. Providing liquidity to DAMM v2 pools earns you a share
          of swap fees every time a trade passes through your pool. During a hype cycle on a new
          token this can be substantial.
        </p>
        <p>
          The risks to keep in mind:
        </p>
        <ul className="space-y-2 ml-1">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
            <span>
              <span className="text-yellow-300 font-medium">Impermanent loss</span> — if the token
              pumps or dumps hard, your LP value can end up lower than just holding.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
            <span>
              <span className="text-yellow-300 font-medium">Rug pulls & low liquidity</span> — new
              tokens carry smart contract risk and can drain to zero. Only use capital you can afford
              to lose.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
            <span>
              <span className="text-yellow-300 font-medium">Timing</span> — joining too late means
              the fee rush is over and you&apos;re holding a deflating token as other LPs exit.
            </span>
          </li>
        </ul>
        <p className="text-gray-400 text-sm">
          Used correctly, Yeeteora helps you catch pools early when fee APRs are highest — but
          position size and timing are still entirely on you.
        </p>
      </div>
    ),
  },
  {
    question: 'Any final words ?',
    answer: (
      <div className="space-y-3">
        <p>
          DeFi rewards people who do their homework. Signals, scores, and charts are tools —
          not oracles. Before adding liquidity:
        </p>
        <ul className="space-y-2 ml-1">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/80 shrink-0" />
            <span>Check the token&apos;s social presence and whether there&apos;s a real project behind it.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/80 shrink-0" />
            <span>Verify the pool address on Meteora before signing anything.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/80 shrink-0" />
            <span>Never put in more than you&apos;re comfortable watching go to zero.</span>
          </li>
        </ul>
        <p className="text-primary/90 font-medium mt-2">
          This is not financial advice. Yeeteora is a tool that saves you time — the decisions are always yours.
        </p>
        <p className="text-gray-500 text-xs">
          To dig deeper into any of these concepts, search engines are still your best friend. The
          Meteora docs, Solana Cookbook, and Jupiter docs are all excellent free resources.
        </p>
      </div>
    ),
  },
]

function FAQAccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FAQItem
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`
        rounded-xl border transition-all duration-300
        ${isOpen
          ? 'border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_20px_rgba(34,211,238,0.06)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
        }
      `}
    >
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`
              shrink-0 w-6 h-6 rounded-full border text-xs font-mono font-bold flex items-center justify-center transition-colors
              ${isOpen ? 'border-cyan-400/60 text-cyan-400 bg-cyan-400/10' : 'border-white/20 text-white/40'}
            `}
          >
            {index + 1}
          </span>
          <span
            className={`font-semibold text-sm sm:text-base transition-colors leading-snug ${
              isOpen ? 'text-cyan-300' : 'text-white/80'
            }`}
          >
            {item.question}
          </span>
        </div>
        <ChevronDown
          className={`shrink-0 h-4 w-4 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-cyan-400' : 'text-white/30'
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1 text-sm text-gray-300 leading-relaxed border-t border-white/[0.06]">
            {item.answer}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LearnFeature() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (i: number) => setOpenIndex((prev) => (prev === i ? null : i))

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-[70px] py-10 sm:py-14">
      {/* Header */}
      <div className="max-w-2xl mb-10 sm:mb-14">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-500/70 mb-3">
          Knowledge Base
        </p>
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4"
          style={{ fontFamily: "'Audiowide', sans-serif" }}
        >
          Let&apos;s gain some{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-primary">
            knowledge
          </span>
        </h1>
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-xl">
          New to LP strategies on Solana? Start here. These questions cover the core concepts
          behind Yeeteora and how to use it effectively.
        </p>
      </div>

      {/* FAQ list */}
      <div className="max-w-2xl flex flex-col gap-3">
        {FAQ_ITEMS.map((item, i) => (
          <FAQAccordionItem
            key={item.question}
            item={item}
            index={i}
            isOpen={openIndex === i}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>

      {/* Footer note */}
      <div className="max-w-2xl mt-10 sm:mt-14 pt-6 border-t border-white/[0.06]">
        <p className="text-xs text-gray-500 leading-relaxed">
          To get more understanding of all these, try using the power of the internet. You might be
          surprised how well it can help you. With the power of a search engine, you can gain more
          insight than any single platform can offer.
        </p>
      </div>
    </div>
  )
}
