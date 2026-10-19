import localFont from 'next/font/local';

export const instrumentSans = localFont({
  src: [
    { path: './fonts/instrument-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/instrument-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/instrument-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--ez-font-sans',
  display: 'swap',
  fallback: ['sans-serif'],
});

export const dmMono = localFont({
  src: [
    { path: './fonts/dm-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--ez-font-mono',
  display: 'swap',
  fallback: ['monospace'],
});
