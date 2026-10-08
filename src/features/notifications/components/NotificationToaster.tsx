'use client'

import { useEffect } from 'react'
import { useToast } from '@/shared/stores/ToastProvider'
import { getUnreadNotifications } from '../actions/getUnreadNotifications'
import { markNotificationsRead } from '../actions/markNotificationsRead'

// Shows the signed-in gardener's unread notifications as toasts once per page load (a creator hears
// that someone cloned their tree: "🎉 A player cloned your tree '…'! You earned +50 🪙"), then marks
// them read so they don't come back. Renders nothing.
function NotificationToaster() {
  const { toast } = useToast()
  useEffect(() => {
    let live = true
    void getUnreadNotifications().then((res) => {
      if (!live || !res.success || res.data.length === 0) return
      for (const n of res.data) toast({ message: n.message, icon: n.kind === 'tree_cloned' ? '🌱' : '🔔', tone: 'leaf' })
      void markNotificationsRead({ ids: res.data.map((n) => n.id) })
    })
    return () => {
      live = false
    }
  }, [toast])
  return null
}

export { NotificationToaster }
