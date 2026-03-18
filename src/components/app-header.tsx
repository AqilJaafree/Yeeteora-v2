'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/solana/solana-provider'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Bell, BellOff, ChevronDown, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'

const AW: React.CSSProperties = { fontFamily: "'Audiowide', sans-serif" }

// ─── Tutorial step data ───────────────────────────────────────────────────────

interface TutorialStepData {
  label: string
  title: string
  MockComponent: React.ComponentType
  tip: string
}

const TUTORIAL_STEPS: TutorialStepData[] = [
  {
    label: '1st Step :',
    title: 'Pick your poison',
    MockComponent: MockTokenList,
    tip: "Highest signal doesn't mean it gives more rewards",
  },
  {
    label: '2nd Step :',
    title: 'Add some flavours',
    MockComponent: MockPoolSelector,
    tip: 'Some pools are like a dangerous roller coaster, some are like merry-go-rounds',
  },
  {
    label: '3rd Step :',
    title: 'Bottoms Up !',
    MockComponent: MockAddLiquidity,
    tip: 'Make sure to add just the right amount. Else it will all destroy you. Have Fun !',
  },
]

// ─── Mock UI sub-components ───────────────────────────────────────────────────

interface TokenRowProps {
  name: string
  time: string
  borderClass: string
  bgClass: string
  tags: Array<{ bg: string; text: string; label: string }>
}

function TokenRow({ name, time, borderClass, bgClass, tags }: TokenRowProps) {
  return (
    <div className={`rounded border ${borderClass} ${bgClass} px-2 py-1.5`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-white font-bold text-xs">{name}</span>
        <span className="text-gray-400 text-[10px]">{time}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, i) => (
          <span key={i} className={`${tag.bg} ${tag.text} px-1.5 py-0.5 rounded text-[9px]`}>
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function MockTokenList() {
  const tokens = [
    {
      name: 'Bonk', time: '5m',
      borderClass: 'border-red-500/40', bgClass: 'bg-red-950/20',
      sectionLabel: 'Highest Activity Right Now', sectionColor: 'text-cyan-400/70',
      tags: [
        { bg: 'bg-emerald-800/60', text: 'text-emerald-300', label: 'Pool Exists' },
        { bg: 'bg-cyan-800/60', text: 'text-cyan-300', label: 'High 91.2' },
        { bg: 'bg-purple-800/60', text: 'text-purple-300', label: '$997,729' },
      ],
    },
    {
      name: 'PNUT', time: '18m',
      borderClass: 'border-yellow-500/30', bgClass: 'bg-yellow-950/10',
      sectionLabel: 'Not So High Activity', sectionColor: 'text-yellow-400/70',
      tags: [
        { bg: 'bg-emerald-800/60', text: 'text-emerald-300', label: 'Pool Exists' },
        { bg: 'bg-cyan-800/60', text: 'text-cyan-300', label: 'High 75.8' },
        { bg: 'bg-purple-800/60', text: 'text-purple-300', label: '$353,375' },
      ],
    },
    {
      name: 'POPCAT', time: '31m',
      borderClass: 'border-gray-600/30', bgClass: 'bg-gray-900/20',
      sectionLabel: 'Common / Normal', sectionColor: 'text-gray-400/70',
      tags: [
        { bg: 'bg-emerald-800/60', text: 'text-emerald-300', label: 'Pool Exists' },
        { bg: 'bg-cyan-800/60', text: 'text-cyan-300', label: 'High 75.9' },
        { bg: 'bg-purple-800/60', text: 'text-purple-300', label: '$149,196' },
      ],
    },
  ]

  return (
    <div className="rounded-lg border border-cyan-900/60 bg-[#080b10] p-3 font-mono w-full space-y-2">
      {tokens.map((token) => (
        <React.Fragment key={token.name}>
          <div className={`${token.sectionColor} text-[9px] uppercase tracking-widest font-bold`}>
            {token.sectionLabel}
          </div>
          <TokenRow
            name={token.name}
            time={token.time}
            borderClass={token.borderClass}
            bgClass={token.bgClass}
            tags={token.tags}
          />
        </React.Fragment>
      ))}
    </div>
  )
}

function MockPoolSelector() {
  const pools = [
    { name: 'Bonk/USDC', fee: '0.1%' },
    { name: 'Bonk/SOL', fee: '2.0% · Exponential' },
    { name: 'Bonk/COST', fee: '0.3%' },
    { name: 'Bonk/USDC', fee: '0.25%' },
  ]

  return (
    <div className="rounded-lg border border-cyan-900/60 bg-[#080b10] p-3 font-mono w-full space-y-1.5">
      <div className="flex justify-between items-center mb-2">
        <span className="text-white font-bold text-xs">Pools for Bonk</span>
        <span className="text-gray-500 text-[10px]">✕</span>
      </div>
      {pools.map((pool, i) => (
        <div key={i} className="flex justify-between items-center rounded border border-gray-700/40 bg-gray-900/30 px-2 py-1.5">
          <div>
            <div className="text-white text-[10px] font-semibold">{pool.name}</div>
            <div className="text-gray-400 text-[9px]">Fee: {pool.fee}</div>
          </div>
          <div className="flex gap-1">
            <button className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[9px] font-semibold">ADD</button>
            <button className="bg-gray-700 text-white px-1.5 py-0.5 rounded text-[9px]">VIEW</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function AmountField({ label }: { label: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[9px] text-gray-400">
        <span>{label}</span>
        <span>Balance: 0 <span className="text-blue-400">MAX</span></span>
      </div>
      <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-500 text-[10px]">0.0</div>
    </div>
  )
}

function MockAddLiquidity() {
  return (
    <div className="rounded-lg border border-cyan-900/60 bg-[#080b10] p-3 font-mono w-full space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-white font-bold text-xs">Bonk–USDC</span>
        <span className="text-gray-500 text-[10px]">✕</span>
      </div>
      <div className="flex gap-1.5">
        <button className="flex-1 bg-blue-600 text-white py-1 rounded text-[10px] font-bold">+ Add Liquidity</button>
        <button className="flex-1 bg-gray-700 text-gray-300 py-1 rounded text-[10px]">↕ Swap</button>
      </div>
      <div className="bg-blue-900/20 border border-blue-700/30 rounded px-2 py-1 text-[10px] text-blue-300">
        Pool: Bonk–USDC
      </div>
      <AmountField label="Bonk Amount" />
      <AmountField label="USDC Amount" />
      <div className="flex gap-1.5">
        <button className="flex-1 bg-gray-700 text-gray-300 py-1 rounded text-[10px]">CANCEL</button>
        <button className="flex-1 bg-blue-600 text-white py-1 rounded text-[10px] font-bold">+ ADD LIQUIDITY</button>
      </div>
    </div>
  )
}

// ─── Tutorial step panel (shared by desktop + mobile) ────────────────────────

function TutorialStepPanel({ step, isMobile = false }: { step: TutorialStepData; isMobile?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div style={AW} className={`text-cyan-400 ${isMobile ? 'text-lg' : 'text-xl'}`}>{step.label}</div>
      <div style={AW} className={`text-cyan-300 leading-snug ${isMobile ? 'text-base' : 'text-lg'}`}>{step.title}</div>
      <step.MockComponent />
      <p style={AW} className="text-cyan-400/80 text-xs leading-relaxed">Tip : {step.tip}</p>
    </div>
  )
}

// ─── Learn FAQ data ───────────────────────────────────────────────────────────

interface FAQItem {
  question: string
  answer: React.ReactNode
}

const LEARN_FAQ: FAQItem[] = [
  {
    question: 'What is DLMM ?',
    answer: (
      <div className="space-y-2.5">
        <p><span className="text-cyan-300 font-semibold">DLMM</span> stands for <span className="text-white font-medium">Dynamic Liquidity Market Maker</span> — Meteora&apos;s concentrated liquidity product on Solana.</p>
        <p>Unlike a regular AMM that spreads your liquidity across all prices, DLMM lets you pick a tight price range called <span className="text-cyan-300 font-medium">bins</span>. When the price stays inside your range, you capture a much larger share of swap fees. When it moves out, you stop earning until it comes back.</p>
        <p className="text-gray-400 text-xs">Think of it like a food stall set up only on the busiest street corner — great returns when people walk by, no sales when they don&apos;t.</p>
      </div>
    ),
  },
  {
    question: 'How about DAMM ?',
    answer: (
      <div className="space-y-2.5">
        <p><span className="text-cyan-300 font-semibold">DAMM v2</span> stands for <span className="text-white font-medium">Dynamic Automated Market Maker v2</span> — also by Meteora, but built for new tokens.</p>
        <p>DAMM v2 pools use a virtual price curve that starts concentrated near the launch price and widens as trading grows. Early LPs earn great fees without managing positions manually.</p>
        <p>Yeeteora&apos;s signal feed watches for tokens with fresh DAMM v2 pools — catching the fee rush before the crowd arrives.</p>
      </div>
    ),
  },
  {
    question: 'Why do you give out free signals ?',
    answer: (
      <div className="space-y-2.5">
        <p>The honest answer: <span className="text-cyan-300 font-medium">liquidity benefits everyone</span>. More LPs in a pool means tighter spreads and lower fees for traders, which attracts more volume, which pays more fees back to LPs. It&apos;s a flywheel.</p>
        <p>We want to make LP strategies accessible to people who don&apos;t have time to monitor WebSocket feeds and filter hundreds of tokens manually. Yeeteora automates that pipeline and surfaces only the interesting ones.</p>
        <p className="text-gray-400 text-xs">No hidden agenda. No premium tier selling the same data faster. What you see is what we use.</p>
      </div>
    ),
  },
  {
    question: 'Are your signals good enough ?',
    answer: (
      <div className="space-y-2.5">
        <p>Signals are derived from two sources:</p>
        <ul className="space-y-1.5 ml-1">
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" /><span><span className="text-cyan-300 font-medium">Real-time trade deltas</span> — we track buys hitting Jupiter vs other DEXes in rolling windows. A spike on Jupiter often means retail is piling in via the aggregator.</span></li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" /><span><span className="text-cyan-300 font-medium">Jupiter Organic Score</span> — Jupiter&apos;s own metric for filtering bot activity. Above 70 = clean organic demand. Below 40 = likely bots or wash trading.</span></li>
        </ul>
        <p className="text-gray-400 text-xs">No signal is perfect. Treat these as a starting point, not a guarantee. Always check token age, holder count, and pool conditions before committing.</p>
      </div>
    ),
  },
  {
    question: 'Can I earn money with this ?',
    answer: (
      <div className="space-y-2.5">
        <p>Yes — but with real risk. Providing liquidity earns you swap fees every time a trade passes through your pool. During a hype cycle on a new token this can be significant.</p>
        <ul className="space-y-1.5 ml-1">
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" /><span><span className="text-yellow-300 font-medium">Impermanent loss</span> — if the token pumps or dumps hard, your LP value can end up lower than just holding.</span></li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" /><span><span className="text-yellow-300 font-medium">Rug pulls &amp; low liquidity</span> — new tokens carry smart contract risk and can drain to zero. Only use capital you can afford to lose.</span></li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" /><span><span className="text-yellow-300 font-medium">Timing</span> — joining too late means the fee rush is over and you&apos;re holding a deflating token as other LPs exit.</span></li>
        </ul>
      </div>
    ),
  },
  {
    question: 'Any final words ?',
    answer: (
      <div className="space-y-2.5">
        <p>DeFi rewards people who do their homework. Before adding liquidity:</p>
        <ul className="space-y-1.5 ml-1">
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/80 shrink-0" /><span>Check the token&apos;s social presence and whether there&apos;s a real project behind it.</span></li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/80 shrink-0" /><span>Verify the pool address on Meteora before signing anything.</span></li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/80 shrink-0" /><span>Never put in more than you&apos;re comfortable watching go to zero.</span></li>
        </ul>
        <p className="text-cyan-300/80 font-medium text-xs mt-1">This is not financial advice. Yeeteora is a tool that saves you time — the decisions are always yours.</p>
      </div>
    ),
  },
]

function LearnAccordionItem({
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
    <div className={`rounded-xl border transition-all duration-300 ${isOpen ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]'}`}>
      <button className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left" onClick={onToggle} aria-expanded={isOpen}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 w-5 h-5 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center transition-colors ${isOpen ? 'border-cyan-400/60 text-cyan-400 bg-cyan-400/10' : 'border-white/20 text-white/40'}`}>{index + 1}</span>
          <span className={`font-semibold text-sm transition-colors ${isOpen ? 'text-cyan-300' : 'text-white/80'}`}>{item.question}</span>
        </div>
        <ChevronDown className={`shrink-0 h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180 text-cyan-400' : 'text-white/30'}`} />
      </button>
      <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 text-sm text-gray-300 leading-relaxed border-t border-white/[0.06]">
            {item.answer}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── App Header ───────────────────────────────────────────────────────────────

export function AppHeader() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [mobileStep, setMobileStep] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [learnOpen, setLearnOpen] = useState(false)
  const [learnOpenIndex, setLearnOpenIndex] = useState<number | null>(null)

  const isNotificationUnavailable =
    !('Notification' in window) || notificationPermission === 'denied'

  useEffect(() => {
    if (!('Notification' in window)) return
    setNotificationPermission(Notification.permission)
    setNotificationsEnabled(Notification.permission === 'granted')
  }, [])

  useEffect(() => {
    // Re-apply user's manual disable preference after permission state loads
    const isManuallyDisabled = localStorage.getItem('notifications-disabled') === 'true'
    if (isManuallyDisabled && notificationPermission === 'granted') {
      setNotificationsEnabled(false)
    }
  }, [notificationPermission])

  const handleToggleNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Notifications are not supported in this browser.')
      return
    }

    if (notificationsEnabled) {
      setNotificationsEnabled(false)
      localStorage.setItem('notifications-disabled', 'true')
      return
    }

    if (notificationPermission === 'denied') {
      alert('Notifications are blocked. Please enable them in your browser settings and refresh the page.')
      return
    }

    if (notificationPermission === 'granted') {
      setNotificationsEnabled(true)
      localStorage.removeItem('notifications-disabled')
      return
    }

    // Permission not yet requested
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      setNotificationsEnabled(true)
      localStorage.removeItem('notifications-disabled')
      new Notification('Notifications Enabled!', {
        body: 'You will now receive alerts for token activity.',
        icon: '/favicon.ico',
      })
    } else {
      setNotificationsEnabled(false)
      alert('Notification permission denied. You can enable it later in browser settings.')
    }
  }

  const notificationButtonText = isNotificationUnavailable
    ? notificationPermission === 'denied' ? 'Blocked' : 'Not Supported'
    : notificationsEnabled ? 'Notifications On' : 'Notifications Off'

  const notificationButtonIcon = isNotificationUnavailable
    ? <BellOff className="h-4 w-4 text-red-400" />
    : notificationsEnabled
      ? <Bell className="h-4 w-4 text-green-400" />
      : <BellOff className="h-4 w-4 text-yellow-400" />

  const handleTutorialClose = (open: boolean) => {
    setTutorialOpen(open)
    if (!open) setMobileStep(0)
  }

  return (
    <header className="relative z-50 py-3 lg:px-[70px] px-4">
      <div className="mx-auto flex justify-between items-center">
        {/* Left: logo + desktop nav */}
        <div className="flex items-center gap-4">
          <Link className="text-xl font-bold text-primary hover:opacity-80 transition-opacity" href="/">
            YEETEORA
          </Link>
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => setTutorialOpen(true)}
              className="text-xl font-bold text-muted-foreground hover:text-primary transition-colors"
            >
              Tutorial
            </button>
            <button
              onClick={() => setLearnOpen(true)}
              className="text-xl font-bold text-muted-foreground hover:text-primary transition-colors"
            >
              Learn
            </button>
          </div>
        </div>

        {/* Right: notifications + wallet + mobile menu toggle */}
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="secondary"
            className="flex items-center gap-1 md:gap-2 p-1.5 sm:px-2 md:px-4"
            onClick={handleToggleNotifications}
            disabled={isNotificationUnavailable}
          >
            {notificationButtonIcon}
            <span className="hidden sm:inline text-sm">{notificationButtonText}</span>
          </Button>
          <WalletButton>Login</WalletButton>
          <button
            className="md:hidden p-1.5 text-muted-foreground hover:text-primary transition-colors"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav overlay */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute top-[56px] left-0 right-0 mx-3 rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl p-4 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setTutorialOpen(true); setMenuOpen(false) }}
              className="text-left text-sm font-bold text-muted-foreground hover:text-primary transition-colors py-3 px-3 rounded-lg hover:bg-muted/40"
            >
              Tutorial
            </button>
            <button
              onClick={() => { setLearnOpen(true); setMenuOpen(false) }}
              className="text-left text-sm font-bold text-muted-foreground hover:text-primary transition-colors py-3 px-3 rounded-lg hover:bg-muted/40"
            >
              Learn
            </button>
          </div>
        </div>
      )}

      {/* Tutorial Dialog */}
      <Dialog open={tutorialOpen} onOpenChange={handleTutorialClose}>
        <DialogContent
          className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] border border-cyan-500/40 bg-[#0b0e18] p-5 md:p-8"
          style={{ boxShadow: '0 0 60px rgba(0,200,255,0.07), inset 0 0 40px rgba(0,0,0,0.5)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl md:text-3xl text-cyan-400 mb-4 md:mb-6" style={AW}>
              How Do I Use This Sh*t ?
            </DialogTitle>
          </DialogHeader>

          {/* Desktop: all 3 steps side by side */}
          <div className="hidden md:grid grid-cols-3 gap-8">
            {TUTORIAL_STEPS.map((step) => (
              <TutorialStepPanel key={step.label} step={step} />
            ))}
          </div>

          {/* Mobile: one step at a time */}
          <div className="md:hidden">
            <div className="grid">
              {TUTORIAL_STEPS.map((step, i) => (
                <div
                  key={step.label}
                  style={{ gridArea: '1 / 1' }}
                  className={i !== mobileStep ? 'invisible pointer-events-none' : ''}
                  aria-hidden={i !== mobileStep}
                >
                  <TutorialStepPanel step={step} isMobile />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-5">
              <button
                onClick={() => setMobileStep((s) => Math.max(0, s - 1))}
                disabled={mobileStep === 0}
                className="flex items-center gap-1 text-cyan-400 disabled:opacity-30 text-sm"
                style={AW}
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex gap-2">
                {TUTORIAL_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setMobileStep(i)}
                    className={`h-2 rounded-full transition-all ${i === mobileStep ? 'w-6 bg-cyan-400' : 'w-2 bg-cyan-900'}`}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={() => setMobileStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))}
                disabled={mobileStep === TUTORIAL_STEPS.length - 1}
                className="flex items-center gap-1 text-cyan-400 disabled:opacity-30 text-sm"
                style={AW}
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="text-center text-gray-500 mt-5 leading-relaxed" style={{ ...AW, fontSize: '0.65rem' }}>
            This is not in any way a financial advice. Please for the love of god, do your own research first.
            This platform acts as a tool for you. The signal exist to save your time.
          </p>
        </DialogContent>
      </Dialog>

      {/* Learn Dialog */}
      <Dialog open={learnOpen} onOpenChange={(open) => { setLearnOpen(open); if (!open) setLearnOpenIndex(null) }}>
        <DialogContent
          className="w-[95vw] max-w-[95vw] sm:max-w-[600px] border border-cyan-500/40 bg-[#0b0e18] p-5 md:p-8"
          style={{ boxShadow: '0 0 60px rgba(0,200,255,0.07), inset 0 0 40px rgba(0,0,0,0.5)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl text-cyan-400 mb-1" style={AW}>
              Let&apos;s gain some knowledge
            </DialogTitle>
            <p className="text-gray-500 text-xs" style={AW}>
              Core concepts behind Yeeteora and how to use it.
            </p>
          </DialogHeader>

          <div className="flex flex-col gap-2 mt-4">
            {LEARN_FAQ.map((item, i) => (
              <LearnAccordionItem
                key={item.question}
                item={item}
                index={i}
                isOpen={learnOpenIndex === i}
                onToggle={() => setLearnOpenIndex((prev) => (prev === i ? null : i))}
              />
            ))}
          </div>

          <p className="text-center text-gray-600 mt-5 leading-relaxed" style={{ ...AW, fontSize: '0.6rem' }}>
            To get more understanding, try using the power of the internet. You might be surprised how well it can help you.
          </p>
        </DialogContent>
      </Dialog>
    </header>
  )
}
