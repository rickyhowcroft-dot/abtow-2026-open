import type { Metadata } from 'next'
import Layout from './components/Layout'
import './globals.css'

export const metadata: Metadata = {
  title: 'ABTOW 2026 Open | Live Scoring',
  description: 'Live scoring for the ABTOW 2026 Open golf tournament',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}