import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Academy Portal',
  description: 'Training operations admin portal.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
