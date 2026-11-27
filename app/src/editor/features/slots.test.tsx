// EZD-1913a (AC-EZD-1913a-1, -2; editor plan 2.4 "The registry must keep this order exactly", 2.5 mode overrides):
// the slot precedence ProjectEditor.tsx had before Cabinets and Countertops moved into features/, pinned on the slot
// functions ProjectEditor now calls (shared/feature-slots.tsx). As read from ProjectEditor.tsx before the move:
// - left panel: 3D none > Sheets panel > Cabinets library > Countertops panel > LeftPanel;
// - inspector place: open Assistant > (3D or Sheets: none) > Version inspector > Cabinet box inspector > Countertop
//   inspector > Fixtures panel (EZD-1985) > selection inspector with More;
// - status start: floor switcher, cabinet status, countertop status, ceiling view, electrical, plan status (Scale,
//   snap, phase), joists, lock, versions; status end: the plan's end (zoom) only.
// The parts are stubs that draw their own name, so the tests read which one shows and in what order.
// AC-EZD-1913a-3: this is the precedence test that criterion requires to pass; the cabinet and countertop unit tests
// and e2e specs (e2e/cabinet-run.spec.ts, e2e/countertops-*.spec.ts) are left unchanged by this ticket and pass.
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  activeFeatures,
  coversPlan,
  featureParts,
  inspectorSlot,
  leftPanelSlot,
  railClasses,
  statusEndSlot,
  statusStartSlot,
  type EditorScreen,
  type Part,
} from '../shared/feature-slots';
import { features } from './index.generated';
import type { EditorFeature, EditorFeatureContext } from './types';

function stub(name: string): Part {
  return function Stub() {
    return <i data-part={name} />;
  };
}

/** The part names in the order they draw. */
const shown = (node: ReactNode): string[] =>
  [...renderToStaticMarkup(<>{node}</>).matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]!);

const ctx = (tool: string | null): EditorFeatureContext => ({
  projectId: 'p1',
  tool,
  store: null,
  floors: undefined,
  mayEdit: true,
  defaults: null,
  canManageDefaults: false,
});

// Stand-ins for the two features with the same ids, orders and tools, drawing their own names.
const real = (id: string) => features.find((f) => f.id === id)!;
const mode = (id: 'cabinets' | 'countertops'): EditorFeature => ({
  id,
  order: real(id).order,
  active: real(id).active,
  coversPlan: real(id).coversPlan,
  railClass: real(id).railClass,
  overlay: () => <i data-part={`${id}-screen`} />,
  leftPanel: () => <i data-part={`${id}-panel`} />,
  inspector: () => <i data-part={`${id}-inspector`} />,
  statusStart: () => <i data-part={`${id}-status`} />,
});
const MODES = [mode('countertops'), mode('cabinets')];

const PLAN: EditorScreen = { show3d: false, showSheets: false, showPlan: true };
const SHEETS: EditorScreen = { show3d: false, showSheets: true, showPlan: true };
const THREE_D: EditorScreen = { show3d: true, showSheets: false, showPlan: true };
const NO_PLAN: EditorScreen = { show3d: false, showSheets: false, showPlan: false };

const on = (tool: string | null) => activeFeatures(MODES, ctx(tool));

describe('EZD-1913a AC-EZD-1913a-1, AC-EZD-1913a-3 left panel precedence', () => {
  const parts = { sheets: stub('sheets'), layers: stub('layers') };
  const left = (screen: EditorScreen, tool: string | null) =>
    shown(leftPanelSlot(screen, on(tool), ctx(tool), parts));

  it('3D shows no left panel, whatever tool is on', () => {
    expect(leftPanelSlot(THREE_D, on('cabinets'), ctx('cabinets'), parts)).toBeNull();
    expect(leftPanelSlot(THREE_D, on(null), ctx(null), parts)).toBeNull();
  });

  it('Sheets shows its panel over Cabinets and Countertops', () => {
    expect(left(SHEETS, 'cabinets')).toEqual(['sheets']);
    expect(left(SHEETS, 'countertops')).toEqual(['sheets']);
  });

  it('on the plan, Cabinets shows the cabinet library and Countertops the countertop panel instead of LeftPanel', () => {
    expect(left(PLAN, 'cabinets')).toEqual(['cabinets-panel']);
    expect(left(PLAN, 'countertops')).toEqual(['countertops-panel']);
  });

  it('Cabinets comes before Countertops when both fill the slot', () => {
    const both = MODES.map((f) => ({ ...f, active: () => true }));
    const active = activeFeatures(both, ctx(null));
    expect(shown(leftPanelSlot(PLAN, active, ctx(null), parts))).toEqual(['cabinets-panel']);
  });

  it('otherwise LeftPanel (Layers, Rooms, Versions); nothing without a plan', () => {
    expect(left(PLAN, null)).toEqual(['layers']);
    expect(left(PLAN, 'electrical')).toEqual(['layers']);
    expect(leftPanelSlot(PLAN, on(null), ctx(null), { ...parts, layers: null })).toBeNull();
    expect(leftPanelSlot(NO_PLAN, on('cabinets'), ctx('cabinets'), parts)).toBeNull();
  });
});

describe('EZD-1913a AC-EZD-1913a-1, AC-EZD-1913a-3 inspector place precedence', () => {
  const all = {
    assistant: stub('assistant'),
    version: stub('version'),
    fixtures: stub('fixtures'),
    selection: stub('selection-more'),
  };
  const place = (screen: EditorScreen, tool: string | null, parts: Partial<typeof all> = {}) => {
    const p = inspectorSlot(screen, on(tool), ctx(tool), { ...all, ...parts });
    return { shown: shown(p.part), label: p.label };
  };

  it('an open Assistant takes the place over everything, on every screen', () => {
    expect(place(PLAN, 'cabinets')).toEqual({ shown: ['assistant'], label: 'office.assistant.title' });
    expect(place(THREE_D, null)).toEqual({ shown: ['assistant'], label: 'office.assistant.title' });
    expect(place(SHEETS, null)).toEqual({ shown: ['assistant'], label: 'office.assistant.title' });
  });

  it('3D or Sheets without the Assistant: no inspector', () => {
    for (const screen of [THREE_D, SHEETS]) {
      const p = inspectorSlot(screen, on('cabinets'), ctx('cabinets'), { ...all, assistant: null });
      expect(p).toEqual({ part: null, label: undefined });
    }
  });

  it('then the version inspector, over Cabinets and Countertops', () => {
    expect(place(PLAN, 'cabinets', { assistant: null })).toEqual({
      shown: ['version'],
      label: 'office.shell.inspector',
    });
    expect(place(PLAN, 'countertops', { assistant: null }).shown).toEqual(['version']);
  });

  it('then the cabinet box inspector, then the countertop inspector', () => {
    const noVersion = { assistant: null, version: null };
    expect(place(PLAN, 'cabinets', noVersion)).toEqual({
      shown: ['cabinets-inspector'],
      label: 'office.shell.inspector',
    });
    expect(place(PLAN, 'countertops', noVersion).shown).toEqual(['countertops-inspector']);
  });

  it('then the Fixtures panel, then the selection inspector with More', () => {
    expect(place(PLAN, 'fixtures', { assistant: null, version: null }).shown).toEqual(['fixtures']);
    expect(place(PLAN, 'select', { assistant: null, version: null, fixtures: null })).toEqual({
      shown: ['selection-more'],
      label: 'office.shell.inspector',
    });
  });

  it('nothing to show: no inspector and no label', () => {
    expect(
      inspectorSlot(PLAN, on(null), ctx(null), {
        assistant: null,
        version: null,
        fixtures: null,
        selection: null,
      }),
    ).toEqual({ part: null, label: undefined });
  });
});

describe('EZD-1913a AC-EZD-1913a-1, AC-EZD-1913a-3 status bar items in order', () => {
  const plan = {
    floorSwitcher: stub('floor-switcher'),
    ceilingView: stub('ceiling-view'),
    electrical: stub('electrical'),
    planStart: stub('plan-start'),
    joists: stub('joists'),
    lock: stub('lock'),
    versions: stub('versions'),
  };
  const start = (screen: EditorScreen, tool: string | null, planReady = true) =>
    statusStartSlot(screen, on(tool), ctx(tool), { sheets: stub('sheets-start'), planReady, ...plan });

  it('start: floor switcher, cabinet status, ceiling view, electrical, plan, joists, lock, versions', () => {
    expect(shown(start(PLAN, 'cabinets'))).toEqual([
      'floor-switcher',
      'cabinets-status',
      'ceiling-view',
      'electrical',
      'plan-start',
      'joists',
      'lock',
      'versions',
    ]);
  });

  it('start: the countertop status sits in the same place', () => {
    expect(shown(start(PLAN, 'countertops')).slice(0, 3)).toEqual([
      'floor-switcher',
      'countertops-status',
      'ceiling-view',
    ]);
  });

  it('start: with both on, cabinets then countertops', () => {
    const both = activeFeatures(
      MODES.map((f) => ({ ...f, active: () => true })),
      ctx(null),
    );
    const node = statusStartSlot(PLAN, both, ctx(null), { sheets: null, planReady: true, ...plan });
    expect(shown(node).slice(0, 4)).toEqual([
      'floor-switcher',
      'cabinets-status',
      'countertops-status',
      'ceiling-view',
    ]);
  });

  it('start: items that cannot show now are left out; no mode item with no mode on', () => {
    const node = statusStartSlot(PLAN, on(null), ctx(null), {
      sheets: null,
      planReady: true,
      ...plan,
      ceilingView: null,
      electrical: null,
      joists: null,
      versions: null,
    });
    expect(shown(node)).toEqual(['floor-switcher', 'plan-start', 'lock']);
  });

  it('start: Sheets shows its own items; 3D, no plan, or scale and phase not read show none', () => {
    expect(shown(start(SHEETS, 'cabinets'))).toEqual(['sheets-start']);
    expect(start(THREE_D, 'cabinets')).toBeUndefined();
    expect(start(NO_PLAN, 'cabinets')).toBeUndefined();
    expect(start(PLAN, 'cabinets', false)).toBeUndefined();
  });

  it('end: Sheets shows its own items, the plan its end items, 3D none', () => {
    const parts = { sheets: stub('sheets-end'), planEnd: stub('plan-end') };
    expect(shown(statusEndSlot(SHEETS, on('cabinets'), ctx('cabinets'), parts))).toEqual(['sheets-end']);
    expect(shown(statusEndSlot(PLAN, on('cabinets'), ctx('cabinets'), parts))).toEqual(['plan-end']);
    expect(statusEndSlot(THREE_D, on(null), ctx(null), parts)).toBeUndefined();
  });
});

describe('EZD-1913a AC-EZD-1913a-2 Cabinets and Countertops are registry features', () => {
  it('both are in the generated list, Cabinets first', () => {
    const ids = features.map((f) => f.id);
    expect(ids).toContain('cabinets');
    expect(ids).toContain('countertops');
    expect(ids.indexOf('cabinets')).toBeLessThan(ids.indexOf('countertops'));
  });

  it('each is on only while its tool is (C and K on the rail)', () => {
    expect(activeFeatures(features, ctx('cabinets')).map((f) => f.id)).toEqual(['cabinets']);
    expect(activeFeatures(features, ctx('countertops')).map((f) => f.id)).toEqual(['countertops']);
    for (const tool of [null, 'select', 'wall', 'electrical', 'fixtures']) {
      expect(activeFeatures(features, ctx(tool))).toEqual([]);
    }
  });

  it('both screens cover the plan (its edit keys and zoom are off); only Cabinets quiets its rail tooltip', () => {
    expect(coversPlan(activeFeatures(features, ctx('cabinets')))).toBe(true);
    expect(coversPlan(activeFeatures(features, ctx('countertops')))).toBe(true);
    expect(coversPlan(activeFeatures(features, ctx('select')))).toBe(false);
    expect(railClasses(activeFeatures(features, ctx('cabinets')))).toHaveLength(1);
    expect(railClasses(activeFeatures(features, ctx('countertops')))).toEqual([]);
  });

  it('each fills the overlay, left panel, inspector and status start once the session is open, none before', () => {
    const store = {} as NonNullable<EditorFeatureContext['store']>;
    for (const id of ['cabinets', 'countertops']) {
      const f = real(id);
      const open = { ...ctx(id), store };
      for (const slot of ['overlay', 'leftPanel', 'inspector', 'statusStart'] as const) {
        expect(f[slot]?.(open), `${id} ${slot}`).toBeTruthy();
        expect(f[slot]?.(ctx(id)), `${id} ${slot} before the session`).toBeNull();
      }
      expect(() => f.leave?.(open)).not.toThrow();
    }
  });

  it('the overlays draw in order, each feature its own', () => {
    const both = activeFeatures(
      MODES.map((f) => ({ ...f, active: () => true })),
      ctx(null),
    );
    expect(shown(featureParts(both, 'overlay', ctx(null)))).toEqual([
      'cabinets-screen',
      'countertops-screen',
    ]);
  });

  it('ProjectEditor.tsx names neither', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'ProjectEditor.tsx'), 'utf8');
    expect(text).not.toMatch(/cabinet/i);
    expect(text).not.toMatch(/countertop/i);
  });
});
