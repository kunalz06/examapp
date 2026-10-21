'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Refreshes server-authorized monitoring metadata, not webcam streams. */
export function MonitorAutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [router])
  return <span className="small muted">Updates approximately every 15 seconds</span>
}
