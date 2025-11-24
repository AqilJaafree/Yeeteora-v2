'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// import { Zap, Percent } from 'lucide-react'

interface YeetModalProps {
    children: React.ReactNode
    pairName: string
}
export function YeetModal({ children }: YeetModalProps) {
// export function YeetModal({ children, pairName }: YeetModalProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [yeetAmount, setYeetAmount] = useState('')

    // Mock percentage function (no functionality yet)
    const setPercentageAmount = (percentage: number) => {
        // TODO: Implement percentage calculation based on user's balance
        // Placeholder for future implementation
        void percentage
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>

            <DialogContent className="sm:max-w-[380px] gradient-card border border-border/20 shadow-2xl">
                <div className="p-6">
                    <DialogHeader className="mb-6">
                        <DialogTitle className="text-2xl font-bold text-white text-center">
                            Yeet`&apos;`em
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Amount Input */}
                        <div className="space-y-3">
                            <Label
                                htmlFor="yeetAmount"
                                className="text-sm font-medium text-white uppercase tracking-wider"
                            >
                                amount
                            </Label>
                            <div className="relative">
                                <div className="relative overflow-hidden rounded-xl border-2 border-border bg-background/50 focus-within:border-primary transition-colors">
                                    <Input
                                        id="yeetAmount"
                                        type="number"
                                        placeholder="0.00"
                                        value={yeetAmount}
                                        onChange={(e) => setYeetAmount(e.target.value)}
                                        className="bg-transparent border-0 px-4 py-3 text-lg font-medium text-foreground placeholder:text-muted-foreground focus:ring-0 focus:outline-none pr-16"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        <span className="text-muted-foreground font-medium text-sm">yeet</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Percentage Buttons */}
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: '25%', value: 25 },
                                { label: '50%', value: 50 },
                                { label: '75%', value: 75 },
                                { label: 'Max', value: 100 }
                            ].map(({ label, value }) => (
                                <Button
                                    key={value}
                                    onClick={() => setPercentageAmount(value)}
                                    className="bg-background/50 hover:bg-background/70 border-2 border-border rounded-xl py-3 text-foreground font-semibold transition-all duration-200 hover:border-primary/30"
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <Button
                                onClick={() => {
                                    // TODO: Implement yeet functionality
                                    setIsOpen(false)
                                }}
                                className="gradient-primary border-0 text-white hover:opacity-90 font-bold py-4 rounded-2xl text-lg transition-all duration-200 hover:scale-105"
                            >
                                Yeet
                            </Button>
                            <Button
                                onClick={() => setIsOpen(false)}
                                className="bg-background/50 hover:bg-background/70 border-2 border-border text-foreground font-bold py-4 rounded-2xl text-lg transition-all duration-200"
                            >
                                Cancel
                            </Button>
                        </div>

                        {/* Bottom Text */}
                        <div className="text-center pt-2">
                            <p className="text-sm text-muted-foreground font-medium">
                                Not enough yeet? Top up now
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}