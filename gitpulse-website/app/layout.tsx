import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'xterm/css/xterm.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://gitpulse.dev'),
  title: {
    default: 'GitPulse — Automate scheduled Git commits',
    template: '%s | GitPulse',
  },
  description: 'GitPulse is a local-only CLI tool that automates scheduled Git commits on repositories you choose. Transparent, user-controlled, and 100% local — no external services, no telemetry.',
  keywords: ['git', 'automation', 'cli', 'commits', 'schedule', 'github', 'gitlab', 'devops'],
  authors: [{ name: 'BLACKSAUCE' }],
  creator: 'BLACKSAUCE',
  publisher: 'BLACKSAUCE',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gitpulse.dev',
    siteName: 'GitPulse',
    title: 'GitPulse — Automate scheduled Git commits',
    description: 'Local-only CLI tool for automating scheduled Git commits. Transparent, user-controlled, no external services.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'GitPulse — Automate scheduled Git commits',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GitPulse — Automate scheduled Git commits',
    description: 'Local-only CLI tool for automating scheduled Git commits. Transparent, user-controlled, no external services.',
    images: ['/og-image.svg'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0a0e14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="antialiased">
      <body className="bg-bg-primary text-text-primary font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}