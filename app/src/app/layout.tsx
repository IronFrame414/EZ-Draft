import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../styles/tokens.css';
import '../styles/globals.css';
import { instrumentSans, dmMono } from '../styles/fonts';
import { APP_NAME, THEME_COLOR } from '../lib/pwa/app-meta';
import { ServiceWorkerRegistration } from '../components/pwa/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'EZ Draft',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${dmMono.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
