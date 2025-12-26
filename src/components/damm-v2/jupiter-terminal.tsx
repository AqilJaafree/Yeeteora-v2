// src/components/damm-v2/jupiter-terminal.tsx
'use client'

import { useEffect, useRef, useState } from 'react'

interface JupiterTerminalProps {
  initialInputMint?: string
  initialOutputMint?: string
}

export function JupiterTerminal({ 
  initialInputMint, 
  initialOutputMint 
}: JupiterTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initializeTerminal = () => {
      if (typeof window !== "undefined" && window.Jupiter && terminalRef.current) {
        try {
          // Clear any existing content (safe DOM manipulation)
          while (terminalRef.current.firstChild) {
            terminalRef.current.removeChild(terminalRef.current.firstChild)
          }

          window.Jupiter.init({
            displayMode: "integrated",
            integratedTargetId: terminalRef.current.id,
            formProps: {
              initialInputMint,
              initialOutputMint,
              swapMode: "ExactIn",
            },
            containerStyles: {
              borderRadius: '8px',
            },
            containerClassName: 'w-full h-full',
          })
          
          setIsLoading(false)
          setError(null)
        } catch (err) {
          console.error('Failed to initialize Jupiter terminal:', err)
          setError('Failed to load Jupiter terminal')
          setIsLoading(false)
        }
      } else if (typeof window !== "undefined") {
        // Jupiter not ready yet, retry after a short delay
        setTimeout(initializeTerminal, 100)
      }
    }

    // Start initialization after component mounts
    const timer = setTimeout(initializeTerminal, 100)

    return () => {
      clearTimeout(timer)
    }
  }, [initialInputMint, initialOutputMint])

  const retryConnection = () => {
    setIsLoading(true)
    setError(null)

    if (terminalRef.current) {
      while (terminalRef.current.firstChild) {
        terminalRef.current.removeChild(terminalRef.current.firstChild)
      }
    }
    
    setTimeout(() => {
      if (typeof window !== "undefined" && window.Jupiter && terminalRef.current) {
        try {
          window.Jupiter.init({
            displayMode: "integrated",
            integratedTargetId: terminalRef.current.id,
            formProps: {
              initialInputMint,
              initialOutputMint,
              swapMode: "ExactIn",
            },
            containerStyles: {
              borderRadius: '8px',
            },
            containerClassName: 'w-full h-full',
          })
          
          setIsLoading(false)
          setError(null)
        } catch (err) {
          console.error('Retry failed:', err)
          setError('Failed to load Jupiter terminal')
          setIsLoading(false)
        }
      } else {
        setError('Jupiter not available')
        setIsLoading(false)
      }
    }, 500)
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#2a2a3e] rounded-lg border border-gray-600 text-gray-400 p-8">
        <div className="text-center mb-4">
          <div className="text-red-400 mb-2">⚠️ Terminal Load Error</div>
          <div className="text-sm">{error}</div>
        </div>
        <button
          onClick={retryConnection}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/80 transition-colors text-sm"
        >
          Retry Loading
        </button>
        <div className="text-xs text-gray-500 mt-3">
          Alternative: Visit{' '}
          <a 
            href={`https://jup.ag/swap/${initialInputMint}-${initialOutputMint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Jupiter.ag
          </a>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#2a2a3e] rounded-lg border border-gray-600 text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-400 border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-sm">Loading Jupiter Terminal...</div>
          <div className="text-xs text-gray-500 mt-2">This may take a few seconds</div>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={terminalRef}
      id={`jupiter-terminal-${Math.random().toString(36).substr(2, 9)}`}
      className="w-full h-full min-h-[600px] rounded-lg overflow-hidden"
      style={{
        background: 'transparent'
      }}
    />
  )
}   