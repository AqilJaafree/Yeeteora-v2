'use client'
import { usePathname, useRouter } from 'next/navigation'
import { TrendingUp, Trophy, Wallet, Zap} from 'lucide-react'
import { useEffect, useState } from 'react'

interface NavbarProps {
    links: { label: string; path: string }[]
}

export function AppNavbar({ links }: NavbarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    function isActive(path: string) {
        if (!mounted) return false
        return path === '/' ? pathname === '/' : pathname.startsWith(path)
    }

    const getPageTag = (label: string) => {
        switch (label) {
            case 'Home':
                return 'DLMM'
            case 'Damm v2':
                return 'DAMM V2'
            case 'Account':
                return 'WALLET'
            default:
                return label.toUpperCase()
        }
    }

    const getIcon = (label: string) => {
        switch (label) {
            case 'Home':
                return                                 <TrendingUp className="w-4 h-4" />
            case 'Damm v2':
                return <Zap className="w-4 h-4" />
            case 'Account':
                return <Wallet className="w-4 h-4" />
            case 'Ranking':
                return <Trophy className="w-4 h-4" />
            case 'Portfolio':
                return <Wallet className="w-5 h-5" />
            default:
                return null
        }
    }

    const handleNavigation = (path: string) => {
        router.push(path)
    }

    if (!mounted) {
        return (
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
                <nav className="relative">
                    <div className="flex items-center gap-1.5 px-1.5 py-1 bg-[#1a1b1e]/90 rounded-[8px] border border-white/5">
                        {links.map(({ label, path }) => (
                            <button
                                key={path}
                                className="relative flex flex-col items-center gap-0.5 px-2 py-1 transition-all duration-300 text-white/50"
                            >
                                <div className="relative z-10">
                                    {getIcon(label)}
                                </div>
                                <span className="text-[10px] font-serif text-white/40">
                                    {getPageTag(label)}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="absolute -inset-[0.5px] bg-gradient-to-t from-white/10 to-transparent rounded-2xl pointer-events-none" />
                </nav>
            </div>
        )
    }

    return (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <nav className="relative">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-[#1a1b1e]/90 rounded-[8px] border border-white/5">
                    {links.map(({ label, path }) => {
                        const active = isActive(path)
                        return (
                            <button
                                key={path}
                                onClick={() => handleNavigation(path)}
                                className={`relative flex flex-col items-center gap-0.5 px-2 py-1 transition-all duration-300 ${active
                                    ? 'bg-primary text-white rounded-[8px]'
                                    : 'text-white/50 hover:text-white/80'
                                    }`}
                            >
                                <div className="relative z-10">
                                    {getIcon(label)}
                                </div>
                                <span className={`text-[10px] font-serif text-nowrap transition-all duration-300 ${active ? 'text-white' : 'text-white/40'}`}>
                                    {getPageTag(label)}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <div className="absolute -inset-[0.5px] bg-gradient-to-t from-white/10 to-transparent rounded-[8px] pointer-events-none" />
            </nav>
        </div>
    )
}