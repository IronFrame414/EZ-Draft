// EZD-1913b (AC-EZD-1913b-1, AC-EZD-1913b-2; editor plan 2.4, 2.6, 5.3): Electrical and Ceiling are registry features. The
// expected places are the ones ProjectEditor.tsx gave them before the move (read from it at EZD-1913a):
// - status start: floor switcher, ceiling View (S05 Layout "Status bar adds View, Scale and Joists status"), the
//   electrical items (EZD-601), the plan's Scale / Snap / Cursor / phase, Joists (EZD-514), lock, versions;
// - left panel: the Floor / Ceiling / Both segment for every viewer (EZD-502, S05 Controls "Available in view only"),
//   the ceiling sections once the RCP module is in (EZD-508), the electrical panel in electrical mode (EZD-601);
// - electrical mode is the Electrical tool on the floor plan (S06 Entry points "Plan tab, Electrical tool (E)");
// - the device toolbar (EZD-602) with Edit model only, over the plan on a desktop and the state column's last row
//   under a coarse pointer (EZD-1979);
// - the selection inspector gets the surface, fan clearance (EZD-515) and ACT border (EZD-511); the framing drawing
//   (EZD-514) only on Ceiling or Both.
// The EZD-1913a precedence test (slots.test.tsx) runs unchanged beside this file.
// AC-EZD-1913b-2: this ticket changed no existing unit test or e2e spec of these modes (they run unchanged in the
// gate); the last block pins that the five named specs are there and that the dev hooks are still installed only by
// dev-hooks.ts, whose own test (dev-hooks.test.ts) pins their names and shapes.
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createFeaturePage } from '../shared/feature-page';
import {
  activeFeatures,
  featureProps,
  statusStartSlot,
  useFeaturePages,
  type EditorScreen,
  type Part,
} from '../shared/feature-slots';
import { features } from './index.generated';
import type { EditorFeature, EditorFeatureContext, FeatureReady } from './types';

const real = (id: string) => features.find((f) => f.id === id)!;
const PLAN: EditorScreen = { show3d: false, showSheets: false, showPlan: true };

const shown = (node: ReactNode): string[] =>
  [...renderToStaticMarkup(<>{node}</>).matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]!);

function stub(name: string): Part {
  return function Stub() {
    return <i data-part={name} />;
  };
}

function readyOf(over: Partial<FeatureReady> = {}): FeatureReady {
  const controllers = {
    plan: { handle: { showObject: () => true }, setSurface: () => {} },
    selection: {
      select: () => {},
      selectTool: () => {},
      getUi: () => ({ ids: [] }),
      subscribe: () => () => {},
    },
    layers: {},
    routed: {},
    phase: { newObjectStatus: () => 'new' },
    toolRoute: () => {},
  } as unknown as FeatureReady['controllers'];
  return {
    session: { store: {} } as unknown as FeatureReady['session'],
    controllers,
    bindings: {},
    coarse: false,
    canEditModel: true,
    meshUrl: null,
    onMessage: () => {},
    ...over,
  };
}

type Own = { ceiling?: Record<string, unknown>; electrical?: { floor: boolean } };

function ctxOf(
  tool: string | null,
  opts: { ready?: FeatureReady | null; own?: Own; mayEdit?: boolean } = {},
): EditorFeatureContext {
  const page = createFeaturePage();
  const ready = opts.ready === null ? undefined : (opts.ready ?? readyOf());
  const own = new Map<string, unknown>(
    Object.entries({
      ceiling: {
        shown: 'floor',
        rcp: undefined,
        fanClearance: 18,
        actMinShare: 0.25,
        autoLayout: {},
        readScan: undefined,
      },
      electrical: { floor: true },
      ...opts.own,
    }),
  );
  return {
    projectId: 'p1',
    tool,
    store: null,
    floors: undefined,
    mayEdit: opts.mayEdit ?? true,
    defaults: null,
    canManageDefaults: false,
    page,
    ...(ready === undefined ? {} : { ready }),
    own,
  };
}

describe('EZD-1913b AC-EZD-1913b-1 Electrical and Ceiling are registry features', () => {
  it('both are in the generated list, at the ceiling view (300) and electrical (400) status places', () => {
    expect(real('ceiling').order).toBe(300);
    expect(real('electrical').order).toBe(400);
    const ids = features.map((f) => f.id);
    expect(ids.indexOf('ceiling')).toBeLessThan(ids.indexOf('electrical'));
  });

  it('electrical mode is the Electrical tool on the floor plan of an open editor', () => {
    const on = (c: EditorFeatureContext) => activeFeatures(features, c).map((f) => f.id);
    expect(on(ctxOf('electrical'))).toContain('electrical');
    for (const tool of [null, 'select', 'wall', 'cabinets', 'fixtures'])
      expect(on(ctxOf(tool))).not.toContain('electrical');
    expect(on(ctxOf('electrical', { own: { electrical: { floor: false } } }))).not.toContain(
      'electrical',
    );
    expect(on(ctxOf('electrical', { ready: null }))).not.toContain('electrical');
  });

  it('Ceiling is on for every viewer of an open editor, whatever the tool (the segment shows on Floor too)', () => {
    for (const tool of [null, 'select', 'electrical', 'cabinets']) {
      expect(activeFeatures(features, ctxOf(tool)).map((f) => f.id)).toContain('ceiling');
    }
    expect(activeFeatures(features, ctxOf(null, { ready: null })).map((f) => f.id)).not.toContain(
      'ceiling',
    );
  });

  it('neither covers the plan, quiets the rail, or takes the left panel or inspector place', () => {
    for (const id of ['ceiling', 'electrical']) {
      const f = real(id);
      expect(f.coversPlan).toBeUndefined();
      expect(f.railClass).toBeUndefined();
      expect(f.leftPanel).toBeUndefined();
      expect(f.inspector).toBeUndefined();
    }
  });

  it('ProjectEditor.tsx names neither mode nor any of their parts', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'ProjectEditor.tsx'), 'utf8');
    expect(text).not.toMatch(/ceiling/i);
    expect(text).not.toMatch(/electrical/i);
    expect(text).not.toMatch(/\brcp/i);
    for (const part of [
      'RoomCeiling',
      'Lighting',
      'FixtureSchedule',
      'CeilingLegend',
      'JoistsStatus',
      'CeilingViewStatus',
      'DeviceTools',
      'ElectricalPanel',
      'ElectricalStatus',
      'BeamSpacingPill',
      'DeviceChooser',
      'ShapeChooser',
      'framingDrawing',
      'fanClearance',
      'actMinShare',
    ])
      expect(text, part).not.toContain(part);
  });
});

describe('EZD-1913b AC-EZD-1913b-1 status bar places', () => {
  // Stand-ins with the real features' orders and status item orders, drawing their own names.
  const ceiling: EditorFeature = {
    id: 'ceiling',
    order: real('ceiling').order,
    active: () => true,
    statusStartItems: real('ceiling').statusStartItems!.map((item, i) => ({
      order: item.order,
      part: () => <i data-part={i === 0 ? 'ceiling-view' : 'joists'} />,
    })),
  };
  const electrical: EditorFeature = {
    id: 'electrical',
    order: real('electrical').order,
    active: () => true,
    statusStart: () => <i data-part="electrical" />,
  };

  it('start: floor switcher, ceiling view, electrical, plan, joists, lock, versions', () => {
    const c = ctxOf(null);
    const node = statusStartSlot(PLAN, activeFeatures([electrical, ceiling], c), c, {
      sheets: null,
      planReady: true,
      floorSwitcher: stub('floor-switcher'),
      planStart: stub('plan-start'),
      lock: stub('lock'),
      versions: stub('versions'),
    });
    expect(shown(node)).toEqual([
      'floor-switcher',
      'ceiling-view',
      'electrical',
      'plan-start',
      'joists',
      'lock',
      'versions',
    ]);
  });

  it('the real Ceiling items show nothing on Floor; Electrical shows its status while on', () => {
    for (const item of real('ceiling').statusStartItems!) expect(item.part(ctxOf(null))).toBeNull();
    expect(real('electrical').statusStart?.(ctxOf('electrical'))).toBeTruthy();
    expect(real('electrical').statusStart?.(ctxOf('electrical', { ready: null }))).toBeNull();
  });
});

describe('EZD-1913b AC-EZD-1913b-1 left panel and inspector props', () => {
  it('Ceiling gives the segment (the page surface) on Floor, and no ceiling sections before the RCP module is in', () => {
    const c = ctxOf(null);
    const props = real('ceiling').leftPanelProps!(c);
    expect(props.surface).toBe(c.page!.surface);
    expect(props.ceiling).toBeUndefined();
  });

  it('Ceiling gives the ceiling sections once the RCP module is in', () => {
    const Part = () => null;
    const rcp = { RoomCeiling: Part, Lighting: Part, AutoLayout: Part, FixtureSchedule: Part };
    const c = ctxOf(null, {
      own: { ceiling: { shown: 'ceiling', rcp, actMinShare: 0.5, autoLayout: {} } },
    });
    expect(real('ceiling').leftPanelProps!(c).ceiling).toBeTruthy();
  });

  it('Electrical gives the electrical panel while on; the merged props carry both', () => {
    const c = ctxOf('electrical');
    const merged = featureProps(activeFeatures(features, c), 'leftPanelProps', c);
    expect(merged.surface).toBe(c.page!.surface);
    expect(merged.electrical).toBeTruthy();
    const off = ctxOf('select');
    expect(
      featureProps(activeFeatures(features, off), 'leftPanelProps', off).electrical,
    ).toBeUndefined();
  });

  it('the inspector gets the surface, fan clearance and ACT border; the framing drawing only off Floor', () => {
    const c = ctxOf(null);
    const props = featureProps(activeFeatures(features, c), 'inspectorProps', c);
    expect(props).toEqual({ surface: c.page!.surface, fanClearance: 18, actMinShare: 0.25 });
    const drawing = {};
    const rcp = { framingDrawingFor: () => drawing };
    const onCeiling = ctxOf(null, {
      own: { ceiling: { shown: 'both', rcp, fanClearance: null, actMinShare: 0.5 } },
    });
    expect(real('ceiling').inspectorProps!(onCeiling).framingDrawing).toBe(drawing);
  });

  it('featureProps: the lower order stands where two give the same prop; an undefined prop gives way', () => {
    const a: EditorFeature = {
      id: 'a',
      order: 1,
      active: () => true,
      leftPanelProps: () => ({ ceiling: 'a' }),
    };
    const b: EditorFeature = {
      id: 'b',
      order: 2,
      active: () => true,
      leftPanelProps: () => ({ ceiling: 'b', electrical: 'b' }),
    };
    const u: EditorFeature = {
      id: 'u',
      order: 0,
      active: () => true,
      leftPanelProps: () => ({ electrical: undefined }),
    };
    const c = ctxOf(null);
    expect(featureProps(activeFeatures([b, a, u], c), 'leftPanelProps', c)).toEqual({
      ceiling: 'a',
      electrical: 'b',
    });
  });
});

describe('EZD-1913b AC-EZD-1913b-1 plan layer and state column (EZD-602, EZD-1979)', () => {
  const tools = real('electrical');

  it('desktop: the device toolbar over the plan, not in the state column', () => {
    const c = ctxOf('electrical');
    expect(tools.planLayer?.(c)).toBeTruthy();
    expect(tools.stateRow?.(c)).toBeNull();
  });

  it('coarse pointer: the device toolbar is the state column last row, not over the plan', () => {
    const c = ctxOf('electrical', { ready: readyOf({ coarse: true }) });
    expect(tools.stateRow?.(c)).toBeTruthy();
    expect(tools.planLayer?.(c)).toBeNull();
  });

  it('without Edit model there is no device toolbar; view only shows it paused, not hidden', () => {
    const c = ctxOf('electrical', { ready: readyOf({ canEditModel: false }) });
    expect(tools.planLayer?.(c)).toBeNull();
    const viewOnly = ctxOf('electrical', { mayEdit: false });
    expect(tools.planLayer?.(viewOnly)).toBeTruthy();
  });

  it('Ceiling draws nothing over the plan on Floor', () => {
    expect(real('ceiling').planLayer?.(ctxOf(null))).toBeNull();
  });
});

describe('EZD-1913b useFeaturePages', () => {
  it('runs every listed feature page hook in list order, on or not, and returns what each gave by id', () => {
    const calls: string[] = [];
    const list: EditorFeature[] = [
      { id: 'x', order: 1, active: () => false, usePage: () => (calls.push('x'), 'X') },
      { id: 'y', order: 2, active: () => true },
      { id: 'z', order: 3, active: () => true, usePage: () => (calls.push('z'), 'Z') },
    ];
    let got: ReadonlyMap<string, unknown> | null = null;
    function Host() {
      got = useFeaturePages(list, ctxOf(null));
      return null;
    }
    renderToStaticMarkup(<Host />);
    expect(calls).toEqual(['x', 'z']);
    expect([...got!.entries()]).toEqual([
      ['x', 'X'],
      ['z', 'Z'],
    ]);
  });

  it('the real page hooks run before the editor is ready (no session) without throwing', () => {
    const spy = vi.fn();
    function Host() {
      const own = useFeaturePages(features, ctxOf(null, { ready: null }));
      spy([...own.keys()].sort());
      return null;
    }
    renderToStaticMarkup(<Host />);
    expect(spy).toHaveBeenCalledWith(['ceiling', 'electrical']);
  });
});

describe("EZD-1913b AC-EZD-1913b-2 the modes' specs and the dev hooks stay as they were", () => {
  const editorDir = path.join(__dirname, '..');
  const read = (...parts: string[]) => fs.readFileSync(path.join(editorDir, ...parts), 'utf8');

  it('the five e2e specs the criterion names are there', () => {
    const e2e = path.join(editorDir, '..', '..', 'e2e');
    for (const spec of [
      'electrical.spec.ts',
      'ceiling-rcp.spec.ts',
      'ceiling-devices.spec.ts',
      'ceiling-shapes.spec.ts',
      'act-grid.spec.ts',
    ])
      expect(fs.existsSync(path.join(e2e, spec)), spec).toBe(true);
  });

  it('the dev hooks keep their names and are installed by dev-hooks.ts alone, not by the moved features', () => {
    const hooks = ['__ezdraftEditor', '__ezdraftPlan', '__ezdraftSelection', '__ezdraft3d'];
    const devHooks = read('dev-hooks.ts');
    for (const name of hooks) expect(devHooks, name).toMatch(new RegExp(`w\\.${name} = hook`));
    for (const file of ['ceiling.tsx', 'electrical.tsx']) {
      expect(read('features', file), file).not.toContain('__ezdraft');
      expect(real(file.replace('.tsx', '')).devHook, file).toBeUndefined();
    }
    expect(read('shared', 'feature-slots.tsx')).not.toContain('__ezdraft');
    expect(read('ProjectEditor.tsx')).toMatch(/useDevHooks\(\{[^}]*devHooks/);
  });

  it('the plan hook still reports the surface drawn and its texts, which the ceiling specs read', () => {
    const devHooks = read('dev-hooks.ts');
    expect(devHooks).toMatch(/drawn\(\): ReturnType<PlanController\['drawn'\]>/);
    expect(devHooks).toMatch(/drawnTexts\(\): ReturnType<PlanController\['drawnTexts'\]>/);
  });
});
