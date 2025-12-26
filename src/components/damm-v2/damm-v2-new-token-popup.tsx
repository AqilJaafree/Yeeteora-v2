import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TokenCard } from './damm-v2-token-card'
import { TokenData } from '@/lib/validators'

interface NewTokenPopupProps {
  token: TokenData | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewTokenPopup({ token, open, onOpenChange }: NewTokenPopupProps) {
  if (!token) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#2a2a3e] border-0 text-white max-w-md w-[95vw] mx-auto p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-gray-600/30">
          <DialogTitle className="text-lg font-bold text-center text-white flex items-center justify-center gap-2">
            🚨 New Signal!
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          {/* Create a wrapper div that constrains the TokenCard */}
          <div className="w-full">
            <TokenCard token={token} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}