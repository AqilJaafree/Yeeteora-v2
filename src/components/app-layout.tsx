'use client'

import { ThemeProvider } from './theme-provider'
import { Toaster } from './ui/sonner'
import { AppHeader } from '@/components/app-header'
import { AppNavbar } from '@/components/app-navbar'
import React, { useEffect, useState } from 'react'
import { AppFooter } from '@/components/app-footer'

export function AppLayout({
  children,
  links,
}: {
  children: React.ReactNode
  links: { label: string; path: string }[]
}) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Show loading state until client-side hydration is complete
  if (!isMounted) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <div className="min-h-screen bg-background text-foreground">
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading Yeeteora...</p>
            </div>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <div className="flex flex-col min-h-screen">
        <AppHeader />
        <main className="flex-grow pb-24">
          {children}
        </main>
        <AppFooter />
        <AppNavbar links={links} />
      </div>
      <Toaster />
    </ThemeProvider>
  )
}