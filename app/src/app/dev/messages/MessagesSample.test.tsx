// EZD-026d A10 (vault/plans/EZD-026d.md section 4).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesSample } from './MessagesSample';

const count = (s: string, sub: string): number => s.split(sub).length - 1;

describe('EZD-026d test-page component', () => {
  it('EZD-026d done when: test-page component renders the field section in Spanish and the office section in English for a user record with language es', () => {
    const html = renderToStaticMarkup(<MessagesSample user={{ language: 'es' }} />);
    const officeAt = html.indexOf('data-testid="office-sample"');
    const fieldAt = html.indexOf('data-testid="field-sample"');
    expect(fieldAt).toBeGreaterThanOrEqual(0);
    expect(officeAt).toBeGreaterThan(fieldAt);
    const field = html.slice(fieldAt, officeAt);
    const office = html.slice(officeAt);
    expect(field).toContain('lang="es"');
    expect(field).toContain('Mensaje de ejemplo');
    expect(field).toContain('1 elemento');
    expect(field).toContain('2 elementos');
    expect(field).not.toContain('Sample message');
    expect(office).toContain('lang="en"');
    expect(office).toContain('Sample message');
    expect(office).toContain('1 item');
    expect(office).toContain('2 items');
    expect(office).not.toContain('Mensaje de ejemplo');
    for (const id of ['sample', 'items-1', 'items-2']) {
      expect(count(html, `data-testid="${id}"`)).toBe(2);
    }
  });

  it('A10 an en user sees English in both sections', () => {
    const html = renderToStaticMarkup(<MessagesSample user={{ language: 'en' }} />);
    const officeAt = html.indexOf('data-testid="office-sample"');
    const fieldAt = html.indexOf('data-testid="field-sample"');
    expect(html.slice(fieldAt, officeAt)).toContain('lang="en"');
    expect(html.slice(fieldAt, officeAt)).toContain('Sample message');
    expect(html.slice(officeAt)).toContain('lang="en"');
    expect(html.slice(officeAt)).toContain('Sample message');
    expect(html).not.toContain('Mensaje de ejemplo');
  });
});
