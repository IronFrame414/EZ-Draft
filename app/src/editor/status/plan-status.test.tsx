// EZD-219 U14, U15, U17 (vault/plans/EZD-219.md section 4; section 6 wording; Decided "Status markup",
// "Readouts", "Failed banner"; Q-0680 (b)). Rendered in the real office catalog, English; stub stores.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SNAP_SETTINGS } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { MessagesProvider } from '../../lib/messages';
import type { OutboxSync, SyncState } from '../../lib/outbox/outbox-sync';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { PlanScaleFailedBanner, PlanStatusEnd, PlanStatusStart } from './PlanStatus';
import type { ScaleSetting, SnapSettingsStore } from './view-settings';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
const count = (s: string, needle: string) => s.split(needle).length - 1;
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

function scaleStub(failed: boolean): ScaleSetting {
  return {
    get: () => 0.5,
    set: vi.fn(),
    subscribe: () => () => {},
    failed: () => failed,
    retry: vi.fn(),
    dispose: vi.fn(),
  };
}

const snapStub: SnapSettingsStore = {
  get: () => DEFAULT_SNAP_SETTINGS,
  setToggle: vi.fn(),
  setIncrement: vi.fn(),
  subscribe: () => () => {},
};

const handleStub = {
  onCursorChange: () => () => {},
  onCameraChange: () => () => {},
  getZoomPercent: () => 100,
  setZoomPercent: vi.fn(),
};

function syncWith(state: Partial<SyncState>): OutboxSync {
  const store = createStore<SyncState>()(() => ({
    status: 'idle',
    failures: 0,
    problem: null,
    lastSavedAt: null,
    conflictRev: 0,
    ...state,
  }));
  return {
    ...store,
    keepMine: vi.fn(async () => ({ kept: false })),
    enqueue: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
}

const SECTION_6: Record<string, string> = {
  'office.status.scale': 'Scale',
  'office.status.snap': 'Snap',
  'office.status.cursor': 'Cursor',
  'office.status.cursor_none': '—',
  'office.status.scale_title': 'Plan scale',
  'office.status.snap_title': 'Snap settings',
  'office.status.snap_endpoints': 'Endpoints',
  'office.status.snap_midpoints': 'Midpoints',
  'office.status.snap_angles': '90/45°',
  'office.status.snap_faces': 'Wall faces',
  'office.status.snap_increment': 'Increment',
  'office.status.zoom': 'Zoom {percent}%',
  'office.status.zoom_input': 'Zoom percent',
};

describe('EZD-219 plan status bar', () => {
  it('EZD-219 U14 the status messages are exactly section 6, English only', () => {
    const got = Object.fromEntries(
      Object.entries(en).filter(([k]) => k.startsWith('office.status.')),
    );
    expect(got).toEqual(SECTION_6);
    expect(Object.keys(es).filter((k) => k.startsWith('office.status.'))).toEqual([]);
  });

  it('EZD-219 U15 the closed markup: four items, readouts empty, no dialog', () => {
    const html = render(
      <>
        <PlanStatusStart scale={scaleStub(false)} snap={snapStub} />
        <PlanStatusEnd handle={handleStub} />
      </>,
    );
    expect(count(html, 'data-status-item')).toBe(4);
    const scale = elements(html, 'status-scale');
    expect(scale).toHaveLength(1);
    expect(decode(textOf(scale[0]!.inner))).toBe(`Scale1/2" = 1'-0"`);
    const snap = elements(html, 'status-snap');
    expect(snap).toHaveLength(1);
    expect(decode(textOf(snap[0]!.inner))).toBe('Snap1/2"');
    for (const el of [scale[0]!, snap[0]!]) {
      expect(attr(el.attrs, 'aria-haspopup')).toBe('dialog');
      expect(attr(el.attrs, 'aria-expanded')).toBe('false');
    }
    expect(html).not.toContain('role="dialog"');
    const cursor = elements(html, 'status-cursor');
    expect(cursor).toHaveLength(1);
    expect(cursor[0]!.inner).toBe('');
    const zoom = elements(html, 'status-zoom');
    expect(zoom).toHaveLength(1);
    expect(textOf(zoom[0]!.inner)).toBe('');
  });

  it('EZD-219 U17 the scale failed banner shows only when the scale failed and the model banner does not', () => {
    // An empty render is the MessagesProvider wrapper alone.
    const empty = render(<></>);
    const none = render(
      <PlanScaleFailedBanner scale={scaleStub(false)} sync={syncWith({ status: 'saved' })} />,
    );
    expect(none).toBe(empty);

    const shown = render(
      <PlanScaleFailedBanner scale={scaleStub(true)} sync={syncWith({ status: 'saved' })} />,
    );
    const el = elements(shown, 'scale-save-failed-banner');
    expect(el).toHaveLength(1);
    expect(el[0]!.inner).toContain('role="alert"');
    expect(textOf(el[0]!.inner)).toContain('Changes not saved');
    expect(count(el[0]!.inner, '<button')).toBe(1);
    expect(textOf(el[0]!.inner)).toContain('Retry');

    const both = render(
      <PlanScaleFailedBanner scale={scaleStub(true)} sync={syncWith({ status: 'error' })} />,
    );
    expect(both).toBe(empty);
  });
});
