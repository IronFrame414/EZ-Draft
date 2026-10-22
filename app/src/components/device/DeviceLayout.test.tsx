// EZD-014a · U2, U3 (vault/plans/EZD-014a.md Section 4).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { EmptyEditor } from '../shell/EmptyEditor';
import { DeviceLayout } from './DeviceLayout';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('EZD-014a DeviceLayout', () => {
  it("EZD-014a done when: DeviceLayout's server markup is the full tree with no wrapper", () => {
    const html = renderToStaticMarkup(
      <DeviceLayout full={<i data-full="" />} phone={<i data-phone="" />} />,
    );
    expect(html).toBe('<i data-full=""></i>');
    const first = readFileSync(path.join(here, 'DeviceLayout.tsx'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
    expect(first).toMatch(/^(['"])use client\1;?$/);
  });

  it('U3 EmptyEditor renders the full frame with or without a phone prop', () => {
    const render = (ui: React.ReactElement) =>
      renderToStaticMarkup(
        <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
          {ui}
        </MessagesProvider>,
      );
    for (const html of [
      render(<EmptyEditor header={<p data-x="1" />} />),
      render(<EmptyEditor header={<p data-x="1" />} phone={<i data-phone-x="" />} />),
    ]) {
      expect([...html.matchAll(/data-shell-region="([^"]*)"/g)].map((m) => m[1])).toEqual([
        'frame',
        'body',
        'rail',
        'left-panel',
        'canvas',
        'inspector',
        'status-bar',
      ]);
      expect(html).toMatch(
        /^<div lang="en" style="display:contents"><div[^>]*data-shell-region="frame"[^>]*><p data-x="1"/,
      );
      expect(html.match(/data-phone-region/g) ?? []).toHaveLength(0);
      expect(html.match(/data-phone-x/g) ?? []).toHaveLength(0);
      expect(html.match(/data-phone-notice/g) ?? []).toHaveLength(0);
    }
  });
});
