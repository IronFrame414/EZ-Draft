// EZD-013 U1 (vault/plans/EZD-013.md section 4).
import { describe, expect, it } from 'vitest';
import manifest from './manifest';
import { TOKENS } from '../styles/tokens';

describe('EZD-013 web app manifest', () => {
  it('U1: the manifest equals the section 3 object, colours from the canvas token', () => {
    const m = manifest();
    expect(m).toEqual({
      id: '/',
      name: 'EZ Draft',
      short_name: 'EZ Draft',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f6f7f9',
      theme_color: '#f6f7f9',
      icons: [
        { src: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/app-icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    });
    const canvas = TOKENS.find((t) => t.name === '--ez-canvas')?.value;
    expect(m.background_color).toBe(canvas);
    expect(m.theme_color).toBe(canvas);
    expect(m).not.toHaveProperty('description');
    expect(m).not.toHaveProperty('orientation');
  });
});
