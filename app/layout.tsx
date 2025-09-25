export const metadata = {
  title: 'SPACE LEGENDS — KJSSE • SSRP',
  description: 'Legendary canvas space game: asteroids, meteors, satellites, planets, powerups — ultra slick.',
  manifest: '/manifest.webmanifest',
  // Remove themeColor from here
}

import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-space min-h-screen">{children}</body>
    </html>
  )
}
