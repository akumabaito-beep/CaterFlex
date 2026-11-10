import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthSessionSync } from '@/components/auth/session-sync'

export const metadata: Metadata = {
  title: 'CaterFlex - Catering Management',
  description: 'Professional catering business management system',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon.png',
        type: 'image/png',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#C8431B',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light bg-background" suppressHydrationWarning>
      <body className="antialiased">
        <AuthSessionSync />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
