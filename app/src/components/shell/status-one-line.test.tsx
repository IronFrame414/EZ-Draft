// EZD-1981 (AC-EZD-1981-1, -3; audit/ui-live-2026-11-24/REPORT.md F5): status bar cells stay on one line. Every cell
// and its label and value are `white-space: nowrap` and do not squeeze; only a cell given its full text as `title`
// may give way (after the disclaimer) with an ellipsis, the title being its tooltip. The long cells named in F5 that
// are plain text (Layer "Power + lighting", Code "NEC 2023 · FBC 9th ed.", Joists "unknown · beam clash checks
// off") carry their full text as the title; Scale, Snap, View and Zoom never shrink.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { JoistsStatus } from '../../editor/ceiling/CeilingShown';
import { ElectricalStatus } from '../../editor/electrical/ElectricalStatus';
import { StatusItem } from './StatusBar';

const here = path.dirname(fileURLToPath(import.meta.url));

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const rule = (css: string, selector: string) => {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const m = [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => r[1].trim() === selector);
  return (m?.[2] ?? '').replace(/\s+/g, ' ');
};

const emptyStore = {
  getState: () => ({ objects: new Map() }),
  subscribe: () => () => {},
} as never;

describe('EZD-1981 status bar cells stay on one line', () => {
  it('AC-EZD-1981-1: StatusBar cells, labels and values never wrap; cells do not squeeze', () => {
    const css = readFileSync(path.join(here, 'StatusBar.module.css'), 'utf8');
    for (const sel of ['.item', '.label', '.value']) {
      expect(rule(css, sel), sel).toContain('white-space: nowrap');
    }
    expect(rule(css, '.item')).toContain('flex: none');
    expect(rule(css, '.end')).toContain('flex: none');
    expect(rule(css, '.fit')).toContain('min-width: 0');
    expect(rule(css, '.fit .value')).toContain('text-overflow: ellipsis');
    expect(rule(css, '.fit .value')).toContain('overflow: hidden');
  });

  it('AC-EZD-1981-1: Plan status triggers (Scale, Snap, Zoom) and the View segment never wrap or squeeze', () => {
    const css = readFileSync(path.join(here, '../../editor/status/PlanStatus.module.css'), 'utf8');
    expect(rule(css, '.item')).toContain('white-space: nowrap');
    expect(rule(css, '.item')).toContain('flex: none');
    expect(rule(css, '.trigger')).toContain('white-space: nowrap');
    expect(rule(css, '.segmentButton')).toContain('white-space: nowrap');
    // The popovers keep their own wrapping (AC-EZD-1981-3: nothing else changes).
    expect(rule(css, '.popover')).toContain('white-space: normal');
  });

  it('AC-EZD-1981-1: a cell without a title has no tooltip and cannot be cut', () => {
    const out = html(<StatusItem label="office.status.cursor">x</StatusItem>);
    expect(out).not.toContain('title=');
    expect(out).not.toContain('data-status-fit');
  });

  it('AC-EZD-1981-1: a cell with a title may be cut and shows its full text as the tooltip', () => {
    const out = html(
      <StatusItem label="office.ceiling.status.joists" title="unknown · beam clash checks off">
        unknown · beam clash checks off
      </StatusItem>,
    );
    expect(out).toContain('data-status-fit=""');
    expect(out).toMatch(/data-status-value="" title="unknown · beam clash checks off"/);
  });

  it('AC-EZD-1981-1: Joists, Layer and Code carry their full text as the tooltip', () => {
    expect(html(<JoistsStatus />)).toContain('title="unknown · beam clash checks off"');
    const elec = html(<ElectricalStatus store={emptyStore} />);
    expect(elec).toContain('title="Power + lighting"');
    expect(elec).toContain('title="NEC 2023 · FBC 9th ed."');
  });
});
