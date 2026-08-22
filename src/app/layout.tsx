import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Academy Portal',
  description: 'Training sales, scheduling, and fulfilment',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

