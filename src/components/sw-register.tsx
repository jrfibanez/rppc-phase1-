'use client'
import { useEffect } from 'react'

export function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => { if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/setup')) reg.active?.postMessage('warm') })
        .catch(() => {})
    }
  }, [])
  return null
}
