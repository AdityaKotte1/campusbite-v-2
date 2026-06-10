import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'CampusBite',
    template: '%s | CampusBite',
  },
  description: 'Order food from your campus canteen — skip the queue, get it fresh.',
  keywords: ['campus food', 'canteen', 'food ordering', 'college food'],
  authors: [{ name: 'CampusBite' }],
  openGraph: {
    title: 'CampusBite',
    description: 'Order food from your campus canteen',
    type: 'website',
  },
  manifest: '/manifest.json',
  // Installable full-screen app on iOS (Add to Home Screen → standalone)
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CampusBite',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#E8390E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head />
      <body className="bg-bg font-sans antialiased">
        <Providers>{children}</Providers>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
