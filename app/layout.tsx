import type { Metadata } from 'next'
import Layout from './components/Layout'
import './globals.css'

export const metadata: Metadata = {
  title: 'ABTOW 2026 Open | Live Scoring',
  description: 'Live scoring for the ABTOW 2026 Open — March 16-18, 2026. Ritz Carlton GC • Southern Dunes • Champions Gate.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: '2026 ABTOW Open',
    description: 'Live scoring — March 16-18, 2026. Ritz Carlton GC • Southern Dunes • Champions Gate.',
    url: 'https://abtow.golf',
    siteName: 'ABTOW 2026 Open',
    images: [
      {
        url: 'https://abtow.golf/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'ABTOW 2026 Open',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '2026 ABTOW Open',
    description: 'Live scoring — March 16-18, 2026. Ritz Carlton GC • Southern Dunes • Champions Gate.',
    images: ['https://abtow.golf/og-image.jpg'],
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