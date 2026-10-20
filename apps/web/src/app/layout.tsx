import type {
  Metadata,
  Viewport,
} from 'next';
import {
  Cormorant_Garamond,
  Geist,
} from 'next/font/google';
import { PwaManager } from '@/components/pwa-manager';
import { getDeploymentVersion } from '@/lib/deployment-version';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const bloomDisplay = Cormorant_Garamond({
  variable: '--font-bloom-display',
  subsets: ['latin'],
  weight: ['600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Mosse Tech',
    template: '%s | Mosse Tech',
  },
  description:
    'Internal business management system for Mosse Tech.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
      },
      {
        url: '/icons/icon-192.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        url: '/icons/icon-512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  applicationName: 'Mosse Tech',
  appleWebApp: {
    capable: true,
    title: 'Mosse Tech',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: [
    {
      media: '(prefers-color-scheme: light)',
      color: '#F1F1F1',
    },
    {
      media: '(prefers-color-scheme: dark)',
      color: '#12130F',
    },
  ],
  width: 'device-width',
  initialScale: 1,
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const deploymentVersion = getDeploymentVersion();

  return (
    <html lang="en" suppressHydrationWarning>

      <body
        className={`${geistSans.variable} ${bloomDisplay.variable}`}
      >
        <PwaManager
          deploymentVersion={deploymentVersion}
        />

        {children}
      </body>
    </html>
  );
}
