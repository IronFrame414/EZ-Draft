import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles/tokens.css';
import '../styles/globals.css';
import { instrumentSans, dmMono } from '../styles/fonts';

export const metadata: Metadata = {
  title: 'EZ Draft',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
