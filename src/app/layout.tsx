import type { Metadata } from 'next'
import './globals.css'

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://academy-portal-alan.alanfilart.chatgpt.site',
)
const title = 'Academy Portal'
const description = 'Sales, training, and fulfilment in one place'

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title,
  description,
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: title,
    type: 'website',
    images: [{
      url: new URL('/og.png', siteUrl),
      width: 1745,
      height: 909,
      alt: 'Academy Portal — Sales, training, and fulfilment in one place',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [new URL('/og.png', siteUrl)],
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
