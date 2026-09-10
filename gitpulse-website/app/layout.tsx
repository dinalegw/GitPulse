import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://start-gitpulse.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'GitPulse — Safe Git Repository Automation',
    template: '%s | GitPulse',
  },
  description: 'GitPulse is a local-first, cross-platform CLI for scheduled Git repository automation with validation, dry runs, controlled commits, and push workflows.',
  keywords: [
    'git automation',
    'git automation cli',
    'git repository automation',
    'go cli',
    'golang',
    'git scheduler',
    'developer tools',
    'workflow automation',
    'repository automation',
  ],
  authors: [{ name: 'BLACKSAUCE' }],
  creator: 'BLACKSAUCE',
  publisher: 'BLACKSAUCE',
  robots: 'index, follow',
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'GitPulse',
    title: 'GitPulse — Safe Git Repository Automation',
    description: 'Local-first Git automation with validation, scheduling, dry runs, and controlled push workflows.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'GitPulse — Safe Git Repository Automation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GitPulse — Safe Git Repository Automation',
    description: 'Local-first Git automation with validation, scheduling, dry runs, and controlled push workflows.',
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
