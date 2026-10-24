// EZD-012b · U3 (a)-(c), U4 (a)-(b): frame regions, slots, client files, barrel, status bar (vault/plans/EZD-012b.md Sections 3, 4).
// Sources: Section 3 markup and data-* contract; 04 opening paragraph (region order); Section 6 wording; P12 Level-1 answer.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { EditorFrame } from './EditorFrame';
import { EmptyEditor } from './EmptyEditor';
import { StatusBar, StatusItem } from './StatusBar';
import * as shell from './index';

const here = path.dirname(fileURLToPath(import.meta.url));

function withProvider(ui: ReactElement): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
}

const regions = (html: string) =>
  [...html.matchAll(/data-shell-region="([^"]*)"/g)].map((m) => m[1]);

// The whole opening tag that carries the given attribute text.
const tagWith = (html: string, attr: string) => {
  const i = html.indexOf(attr);
  expect(i, `markup has ${attr}`).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf('<', i);
  return html.slice(start, html.indexOf('>', i) + 1);
};

describe('EZD-012b frame markup', () => {
  it('EZD-012b done when: EmptyEditor renders the frame regions in order with labelled panels and no text outside the header slot', () => {
    const html = withProvider(<EmptyEditor header={<p data-x="1" />} />);
    expect(regions(html)).toEqual([
      'frame',
      'body',
      'rail',
      'left-panel',
      'canvas',
      'inspector',
      'status-bar',
    ]);
    expect(html).not.toContain('data-shell-region="header"');
    expect(html).toMatch(/^<div lang="en" style="display:contents"><div[^>]*data-shell-region="frame"[^>]*><p data-x="1"/);
    const left = tagWith(html, 'data-shell-region="left-panel"');
    expect(left.startsWith('<aside')).toBe(true);
    expect(left).toContain('aria-label="Left panel"');
    expect(tagWith(html, 'data-shell-region="canvas"').startsWith('<main')).toBe(true);
    const insp = tagWith(html, 'data-shell-region="inspector"');
    expect(insp.startsWith('<aside')).toBe(true);
    expect(insp).toContain('aria-label="Inspector"');
    expect(tagWith(html, 'data-shell-region="status-bar"').startsWith('<footer')).toBe(true);
    expect(html.match(/data-rail-tool/g) ?? []).toHaveLength(0);
    expect(html.match(/data-status-item/g) ?? []).toHaveLength(0);
    // Tag attributes hold the aria-labels, so strip tags first, then check no text remains.
    const rest = html.replace('<p data-x="1"></p>', '').replace(/<[^>]*>/g, '');
    expect(rest).toBe('');
  });

  it('U3 (b): EditorFrame puts each slot inside its region in order', () => {
    const html = withProvider(
      <EditorFrame
        rail={<nav data-r="1" />}
        leftPanel={<i data-l="1" />}
        canvas={<i data-c="1" />}
        inspector={<i data-i="1" />}
        statusBar={<footer data-s="1" />}
        leftPanelLabel="office.shell.left_panel"
        inspectorLabel="office.shell.inspector"
      />,
    );
    for (const a of ['data-r="1"', 'data-l="1"', 'data-c="1"', 'data-i="1"', 'data-s="1"']) {
      expect(html.split(a)).toHaveLength(2);
    }
    const at = (s: string) => html.indexOf(s);
    const body = at('data-shell-region="body"');
    const bodyOpenEnd = html.indexOf('>', body);
    const left = at('data-shell-region="left-panel"');
    const canvas = at('data-shell-region="canvas"');
    const insp = at('data-shell-region="inspector"');
    expect(at('data-r="1"')).toBeGreaterThan(bodyOpenEnd);
    expect(at('data-r="1"')).toBeLessThan(left);
    expect(at('data-l="1"')).toBeGreaterThan(left);
    expect(at('data-l="1"')).toBeLessThan(canvas);
    expect(at('data-c="1"')).toBeGreaterThan(canvas);
    expect(at('data-c="1"')).toBeLessThan(insp);
    expect(at('data-i="1"')).toBeGreaterThan(insp);
    expect(at('data-l="1"')).toBeLessThan(html.indexOf('</aside>', left));
    expect(at('data-c="1"')).toBeLessThan(html.indexOf('</main>', canvas));
    expect(at('data-i="1"')).toBeLessThan(html.indexOf('</aside>', insp));
    const bodyClose = html.indexOf('</div>', at('data-i="1"'));
    expect(bodyClose).toBeGreaterThan(0);
    expect(at('data-s="1"')).toBeGreaterThan(bodyClose);
    // The markup ends with the frame's </div> then the MessagesProvider wrapper's </div>.
    expect(html.endsWith('</div></div>')).toBe(true);
    const frameClose = html.length - '</div></div>'.length;
    expect(at('data-s="1"')).toBeLessThan(frameClose);
    expect(html.slice(at('data-s="1"'), frameClose)).not.toContain('</div>');
  });

  it('U3 (c): the three components are client files and the barrel re-exports them', () => {
    for (const f of ['EditorFrame.tsx', 'StatusBar.tsx', 'EmptyEditor.tsx']) {
      const src = readFileSync(path.join(here, f), 'utf8');
      const first = src
        .replace(/^\s*(\/\/[^\n]*\n\s*)*/, '')
        .split('\n')[0]
        .trim();
      expect(first, f).toMatch(/^'use client';?$/);
    }
    expect(shell.EditorFrame).toBe(EditorFrame);
    expect(shell.EmptyEditor).toBe(EmptyEditor);
    expect(shell.StatusBar).toBe(StatusBar);
    expect(shell.StatusItem).toBe(StatusItem);
  });
});

describe('EZD-012b status bar', () => {
  it('U4 (a): StatusBar renders start then end groups with the item parts', () => {
    const html = withProvider(
      <StatusBar
        start={<StatusItem label="office.shell.tools">1</StatusItem>}
        end={<span data-y="1" />}
      />,
    );
    expect(html.match(/<footer/g) ?? []).toHaveLength(1);
    expect(tagWith(html, 'data-shell-region="status-bar"').startsWith('<footer')).toBe(true);
    const s = html.indexOf('data-status="start"');
    const e = html.indexOf('data-status="end"');
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    const startPart = html.slice(s, e);
    const endPart = html.slice(e);
    expect(startPart.match(/data-status-item/g) ?? []).toHaveLength(1);
    expect(startPart).toMatch(/data-status-label=""[^>]*>Tools</);
    expect(startPart).toMatch(/data-status-value=""[^>]*>1</);
    expect(endPart).toContain('data-y="1"');
    expect(startPart).not.toContain('data-y');
  });

  it('U4 (b): StatusBar with no props renders both groups empty', () => {
    const html = withProvider(<StatusBar />);
    expect(html.match(/<footer/g) ?? []).toHaveLength(1);
    for (const g of ['start', 'end']) {
      const m = html.match(new RegExp(`<div[^>]*data-status="${g}"[^>]*></div>`));
      expect(m, g).not.toBeNull();
    }
  });
});
