import React from 'react'
// import { Info } from 'lucide-react'
// import { Button } from '@/components/ui/button'

export function AppHero({
  children,
  subtitle,
  title,
}: {
  children?: React.ReactNode
  subtitle?: React.ReactNode
  title?: React.ReactNode
}) {
  return (
      <div className="text-center mx-auto lg:px-[70px] px-4 lg:mt-[80px] mt-6 mb-6 lg:mb-16 flex flex-col items-start justify-start">
        <div>
          {typeof title === 'string' ? (
            <div className="relative">
              <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-2 md:mb-4 uppercase text-left"> 
                {title}
              </h1>
              {/* <div className="flex items-center justify-center gap-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-primary"
                >
                  How it Works
                  <Info className="w-4 h-4 ml-1" />
                </Button>
              </div> */}
            </div>
          ) : (
            title
          )}

          {typeof subtitle === 'string' ? (
            <p className="text-sm md:text-base text-white/70 leading-relaxed text-left">
              {subtitle}
            </p>
          ) : (
            subtitle
          )}
        </div>

        {children}
      </div>
  )
}
