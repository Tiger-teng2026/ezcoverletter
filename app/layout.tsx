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
  title: 'EzCoverLetter — AI Job Application Assistant for ATS-Friendly Cover Letters',
  description:
    'EzCoverLetter is an AI job application assistant. Free Job Match Score, cover letter generation, and Copy. Pro Export is $4.99 one-time for PDF and Word.',
  generator: 'v0.app',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'EzCoverLetter — AI Job Application Assistant for ATS-Friendly Cover Letters',
    description:
      'Free Job Match Score, cover letter generation, and Copy. Pro Export is $4.99 one-time for PDF and Word.',
    type: 'website',
    url: SITE_URL,
    siteName: 'EzCoverLetter',
  },
  twitter: {
    card: 'summary',
    title: 'EzCoverLetter — AI Job Application Assistant for ATS-Friendly Cover Letters',
    description:
      'Free Job Match Score, cover letter generation, and Copy. Pro Export is $4.99 one-time for PDF and Word.',
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
