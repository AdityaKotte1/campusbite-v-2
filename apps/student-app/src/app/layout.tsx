import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/pwa/sw-register';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: {
    default: 'MunchAdda',
    template: '%s | MunchAdda',
  },
  description: 'Order food from your campus canteen — skip the queue, get it fresh.',
  keywords: ['campus food', 'canteen', 'food ordering', 'college food', 'campus adda'],
  authors: [{ name: 'MunchAdda' }],
  openGraph: {
    title: 'MunchAdda',
    description: 'Order food from your campus canteen — your campus food adda.',
    type: 'website',
  },
  manifest: '/manifest.json',
  // Installable full-screen app on iOS (Add to Home Screen → standalone)
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MunchAdda',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#DD3A11',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <head />
      <body className="bg-bg font-sans antialiased">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
