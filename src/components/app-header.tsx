'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/solana/solana-provider'
import { Button } from './ui/button'
import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'

export function AppHeader() {
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    // Check initial notification permission status
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
      setNotificationsEnabled(Notification.permission === 'granted')
    }
  }, [])

  const handleToggleNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Notifications are not supported in this browser.')
      return
    }

    if (notificationsEnabled) {
      // User wants to disable notifications
      // We can't revoke permission, but we can track the user preference
      setNotificationsEnabled(false)
      localStorage.setItem('notifications-disabled', 'true')
      console.log('Notifications disabled by user')
    } else {
      // User wants to enable notifications
      if (notificationPermission === 'granted') {
        // Permission already granted, just enable
        setNotificationsEnabled(true)
        localStorage.removeItem('notifications-disabled')
      } else if (notificationPermission === 'denied') {
        // Permission denied, inform user they need to enable manually
        alert('Notifications are blocked. Please enable them in your browser settings and refresh the page.')
        return
      } else {
        // Permission not yet requested, request it
        const permission = await Notification.requestPermission()
        setNotificationPermission(permission)
        
        if (permission === 'granted') {
          setNotificationsEnabled(true)
          localStorage.removeItem('notifications-disabled')
          
          // Show a test notification
          new Notification('Notifications Enabled!', {
            body: 'You will now receive alerts for token activity.',
            icon: '/favicon.ico'
          })
        } else {
          setNotificationsEnabled(false)
          alert('Notification permission denied. You can enable it later in browser settings.')
        }
      }
    }
  }

  // Check if notifications are manually disabled by user
  useEffect(() => {
    const isDisabled = localStorage.getItem('notifications-disabled') === 'true'
    if (isDisabled && notificationPermission === 'granted') {
      setNotificationsEnabled(false)
    }
  }, [notificationPermission])

  const getButtonText = () => {
    if (!('Notification' in window)) {
      return 'Not Supported'
    }
    
    if (notificationPermission === 'denied') {
      return 'Blocked'
    }
    
    return notificationsEnabled ? 'Notifications On' : 'Notifications Off'
  }

  const getButtonIcon = () => {
    if (!('Notification' in window) || notificationPermission === 'denied') {
      return <BellOff className="h-4 w-4 text-red-400" />
    }
    
    return notificationsEnabled ? (
      <Bell className="h-4 w-4 text-green-400" />
    ) : (
      <BellOff className="h-4 w-4 text-yellow-400" />
    )
  }

  const isButtonDisabled = () => {
    return !('Notification' in window) || notificationPermission === 'denied'
  }

  return (
    <header className="relative z-50 py-4 lg:px-[70px] px-4">
      <div className="mx-auto flex justify-between items-center">
        <Link className="text-xl font-bold text-primary hover:opacity-80 transition-opacity" href="/">
          <span>YEETEORA</span>
        </Link>

        <div className="flex items-center gap-4">
          <Button 
            variant={'secondary'} 
            className="flex items-center md:gap-2 gap-0" 
            onClick={handleToggleNotifications}
            disabled={isButtonDisabled()}
          >
            {getButtonIcon()}
            <span className="hidden sm:inline">{getButtonText()}</span>
            <span className="sm:hidden">{notificationsEnabled ? '' : ''}</span>
          </Button>
          <WalletButton />
        </div>
      </div>
    </header>
  )
}