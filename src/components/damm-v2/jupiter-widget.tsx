'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ArrowLeftRight } from 'lucide-react'

interface JupiterWidgetProps {
  initialInputMint?: string
  initialOutputMint?: string
  children?: React.ReactNode
}

export function JupiterWidget({ 
  initialInputMint, 
  initialOutputMint, 
  children 
}: JupiterWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenJupiter = () => {
    if (typeof window !== "undefined" && window.Jupiter) {
      try {
        window.Jupiter.init({
          displayMode: "modal", // Simple modal mode - most reliable
          formProps: {
            initialInputMint,
            initialOutputMint,
            swapMode: "ExactIn",
          },
        })
      } catch (error) {
        console.error('Failed to initialize Jupiter:', error)
      }
    } else {
      console.warn('Jupiter not available yet')
    }
  }

  const handleDialogJupiter = () => {
    setIsOpen(true)
    
    // Wait a bit for dialog to render
    setTimeout(() => {
      const element = document.getElementById('jupiter-plugin')
      if (element && window.Jupiter) {
        try {
          window.Jupiter.init({
            displayMode: "integrated",
            integratedTargetId: "jupiter-plugin",
            formProps: {
              initialInputMint,
              initialOutputMint,
              swapMode: "ExactIn",
            },
          })
        } catch (error) {
          console.error('Integrated Jupiter failed:', error)
          // Fallback to modal
          setIsOpen(false)
          handleOpenJupiter()
        }
      } else {
        // Fallback to modal if integrated doesn't work
        setIsOpen(false)
        handleOpenJupiter()
      }
    }, 300)
  }

  return (
    <>
      {/* Primary method: Use children to wrap existing buttons */}
      {children ? (
        <div onClick={handleOpenJupiter} className="flex-1 w-full">
          {children}
        </div>
      ) : (
        <Button onClick={handleOpenJupiter} variant="outline" size="sm">
          <ArrowLeftRight className="w-4 h-4 mr-2" />
          Swap
        </Button>
      )}

      {/* Dialog version as backup - hidden by default */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[450px] bg-[#1a1a2e] border-gray-600 text-white p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-white">Swap Tokens</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <div 
              id="jupiter-plugin"
              className="w-full min-h-[500px] flex items-center justify-center"
            >
              <div className="text-gray-400">Loading Jupiter...</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}