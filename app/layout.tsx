import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SITE_URL } from '@/lib/constants'
import { GA_MEASUREMENT_ID } from '@/lib/ga'
import './globals.css'

const _geistSans = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EzCoverLetter — AI Job Search Toolkit',
  description:
    'Everything you need to prepare, apply, and interview with confidence. Cover letters, resume rewrites, ATS reviews, interview practice, LinkedIn drafts, and career emails.',
  generator: 'v0.app',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'EzCoverLetter — AI Job Search Toolkit',
    description:
      'Everything you need to prepare, apply, and interview with confidence. Free, Creator, and Pro plans include monthly AI credits. PDF and Word export is included while a subscription is active, or $4.99 for one saved letter.',
    type: 'website',
    url: SITE_URL,
    siteName: 'EzCoverLetter',
  },
  twitter: {
    card: 'summary',
    title: 'EzCoverLetter — AI Job Search Toolkit',
    description:
      'Everything you need to prepare, apply, and interview with confidence. Free, Creator, and Pro plans include monthly AI credits. PDF and Word export is included while a subscription is active, or $4.99 for one saved letter.',
  },
  // Google Search Console HTML tag verification
  // Replace the content string in Search Console if you regenerate the meta tag.
  verification: {
    google: 'SjjVZl7Io6Li7oJoBqem3dmBeSLOnyhKfbIoOEJAMVs',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0a0f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              var debug = false;
              try {
                var host = location.hostname;
                debug = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
                  || /(?:^|[?&])ga_debug=1(?:&|$)/.test(location.search)
                  || localStorage.getItem('ga_debug') === '1';
              } catch (e) {}
              if (debug) {
                gtag('config', '${GA_MEASUREMENT_ID}', { debug_mode: true });
              } else {
                gtag('config', '${GA_MEASUREMENT_ID}');
              }
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
