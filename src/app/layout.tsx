import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Academy Portal',
  description: 'Training operations admin portal.',
}

// Sets theme/density before paint so there's no flash of the wrong theme.
const noFlash = `(function(){try{var t=localStorage.getItem('theme');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-density',localStorage.getItem('density')||'comfortable');}catch(e){}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
