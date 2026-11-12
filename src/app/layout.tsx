import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SWRegister } from '@/components/sw-register'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: { default: 'RPPC OS', template: '%s · RPPC OS' },
  description: 'Red Pallet Provider Co. operations system',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'RPPC OS', statusBarStyle: 'default' },
}
export const viewport: Viewport = { themeColor: '#b5121b', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SWRegister />
        <Analytics />
      </body>
    </html>
  )
}
