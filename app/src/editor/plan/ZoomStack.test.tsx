// EZD-207b U17, U18 (vault/plans/EZD-207b.md section 4; Decided "Stack markup", "Touch size"; AC-EZD-207-2).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import touch from '../../styles/touch.module.css';
import styles from './ZoomStack.module.css';
import { ZoomStack } from './ZoomStack';

const handle = { zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn() };
const html = renderToStaticMarkup(
  <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
    <ZoomStack handle={handle} />
  </MessagesProvider>,
);
const count = (s: string, needle: string) => s.split(needle).length - 1;
const classTokens = (tag: string) =>
  (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(' ').filter((c) => c.length > 0);

describe('EZD-207b zoom stack', () => {
  it('EZD-207b U17 one stack with three labelled icon buttons, touch-sized, and no text', () => {
    expect(count(html, 'data-testid="zoom-stack"')).toBe(1);
    const stackStart = html.lastIndexOf('<', html.indexOf('data-testid="zoom-stack"'));
    const stackTag = html.slice(stackStart, html.indexOf('>', stackStart) + 1);
    expect(stackTag).toContain('data-testid="zoom-stack"');
    expect(classTokens(stackTag)).toEqual([styles.stack]);
    expect(count(html, '<button type="button"')).toBe(3);

    const buttons = html.split('<button').slice(1);
    const names = ['Zoom in', 'Zoom out', 'Fit to screen'];
    const icons = ['add', 'remove', 'fit_screen'];
    buttons.forEach((b, i) => {
      const tag = '<button' + b.slice(0, b.indexOf('>') + 1);
      expect(tag).toContain(`aria-label="${names[i]}"`);
      expect(tag).toContain(`title="${names[i]}"`);
      expect(classTokens(tag)).toEqual([styles.button, touch.target]);
      expect(b).toContain(`<use href="#ez-icon-${icons[i]}"`);
      expect(b).toContain('width="20"');
    });
    // No text node anywhere: every ">" is followed by "<".
    expect(/>[^<]+</.test(html)).toBe(false);
  });

  it('EZD-207b U18 the three messages are English only', () => {
    expect(en['office.plan.zoom_in']).toBe('Zoom in');
    expect(en['office.plan.zoom_out']).toBe('Zoom out');
    expect(en['office.plan.fit']).toBe('Fit to screen');
    for (const key of ['office.plan.zoom_in', 'office.plan.zoom_out', 'office.plan.fit'])
      expect(Object.keys(es)).not.toContain(key);
  });
});
