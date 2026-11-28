// EZD-1913c (AC-EZD-1913c-1, AC-EZD-1913c-2; editor plan 2.1, 2.6, 5.3): Versions, Sheets and 3D are registry
// features. The expected places are the ones ProjectEditor.tsx gave them before the move (develop 55526a3c9):
// - header tabs: Plan, 3D, Sheets once the plan canvas is up, else Plan, Sheets (PLAN_3D_VIEWS, PLAN_VIEWS, :211-213);
//   3D shows with the plan up and its tab chosen, Sheets with the session open and its tab chosen (:652, :655); only
//   Sheets hides the plan backdrop (:1256-1263); a press takes Plan, 3D or Sheets only (:707-711);
// - versions: the header's version text (:806-821), the Versions tab in the left panel (:1232-1250), the version
//   inspector before every mode's inspector (:1176-1189), the diff layer over the plan after the Assistant preview
//   (:1113-1116), the status text at 800 only while the tab is open or a version shows (:1314-1326), and `mayEdit`
//   false while a version shows (:571);
// - Sheets: its panel in the left panel place, its canvas first in the canvas, its own status items (:1088-1095,
//   :1218-1219, :1299, :1329);
// - 3D: the overlay and sync footer first in the canvas (:1096-1101), the `__ezdraft3d` and `scene3dLoaded` dev
//   hook parts (:755-766).
// The EZD-1913a precedence test (slots.test.tsx) and the EZD-1913b test (ceiling-electrical.test.tsx) run unchanged
// beside this file. AC-EZD-1913c-2: this ticket changed no existing unit test or e2e spec of these modes; the last
// block pins that the named specs are there and that the dev hooks keep their names.
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import type { VersionRow } from '../../lib/versions/versions';
import { createFeaturePage } from '../shared/feature-page';
import {
  activeFeatures,
  editorInspector,
  editorLeftPanel,
  editorScreen,
  editorStatusEnd,
  editorStatusStart,
  editorViews,
  editsAllowed,
  featureDevParts,
  featureParts,
  knownView,
  planHidden,
  screenPart,
  shownView,
  STATUS_START_ORDER,
  useFeatureOwn,
  type Part,
} from '../shared/feature-slots';
import { features } from './index.generated';
import type { EditorFeature, EditorFeatureContext, FeatureReady } from './types';

const real = (id: string) => features.find((f) => f.id === id)!;

const shown = (node: ReactNode): string[] =>
  [...renderToStaticMarkup(<>{node}</>).matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]!);

function stub(name: string): Part {
  return function Stub() {
    return <i data-part={name} />;
  };
}

function readyOf(): FeatureReady {
  const controllers = {
    plan: { handle: { showObject: () => true }, showScene: () => {} },
    versions: { open: () => {}, back: () => {}, setShowChanges: () => {} },
    floors: {},
    routed: {},
    phase: {},
  } as unknown as FeatureReady['controllers'];
  return {
    session: {
      store: {},
      sync: null,
      model: { viewer: { canEdit: true }, project: { versionNo: null, revNo: null } },
      defaults: { get: () => ({}) },
    } as unknown as FeatureReady['session'],
    controllers,
    bindings: {},
    coarse: false,
    canEditModel: true,
    meshUrl: null,
    onMessage: () => {},
  };
}

function ctxOf(
  opts: {
    ready?: boolean;
    chosenView?: EditorFeatureContext['chosenView'];
    planUp?: boolean;
    own?: Record<string, unknown>;
    mayEdit?: boolean;
  } = {},
): EditorFeatureContext {
  const base: EditorFeatureContext = {
    projectId: 'p1',
    tool: null,
    store: null,
    floors: undefined,
    mayEdit: opts.mayEdit ?? true,
    defaults: null,
    canManageDefaults: false,
    page: createFeaturePage(),
    chosenView: opts.chosenView ?? 'plan',
    planUp: opts.planUp ?? true,
    own: new Map(Object.entries(opts.own ?? {})),
    ...(opts.ready === false ? {} : { ready: readyOf() }),
  };
  return { ...base, shownView: shownView(features, base) };
}

const ROW: VersionRow = {
  id: 'v1',
  label: null,
  cause: null,
  isSnapshot: false,
  isSent: true,
  versionNo: 2,
  sentTo: null,
  sentAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  author: null,
  parentId: null,
};

function versionsOwn(over: { viewing?: VersionRow | null; tab?: string } = {}) {
  return {
    versionView: readyOf().controllers.versions,
    view: {
      viewing: over.viewing ?? null,
      opening: null,
      failed: false,
      objects: null,
      diff: null,
      showChanges: true,
    },
    tab: over.tab ?? 'layers',
    setTab: () => {},
    rows: [],
    failed: false,
    reverting: false,
    error: null,
    revert: async () => {},
    nameSnapshot: async () => null,
    link: <button type="button" data-part="version-link" />,
    cleanup: null,
    cleanupOpen: false,
    cleanupSaving: false,
    cleanupError: null,
    saveCleanup: async () => {},
    closeCleanup: () => {},
  };
}

describe('EZD-1913c AC-EZD-1913c-1 the 3D and Sheets screens', () => {
  it('both are in the generated list, 3D before Sheets (the header tab order)', () => {
    const ids = features.map((f) => f.id);
    expect(ids).toContain('scene-3d');
    expect(ids).toContain('sheets');
    expect(ids.indexOf('scene-3d')).toBeLessThan(ids.indexOf('sheets'));
    expect(real('scene-3d').screen?.view).toBe('3d');
    expect(real('sheets').screen?.view).toBe('sheets');
  });

  it('the header tabs are Plan, 3D, Sheets with the plan canvas up, and Plan, Sheets without it', () => {
    expect(editorViews(features, ctxOf({ planUp: true }))).toEqual(['plan', '3d', 'sheets']);
    expect(editorViews(features, ctxOf({ planUp: false }))).toEqual(['plan', 'sheets']);
  });

  it('3D shows with the plan up and its tab chosen; Sheets with the editor open and its tab chosen', () => {
    expect(ctxOf({ chosenView: '3d' }).shownView).toBe('3d');
    expect(ctxOf({ chosenView: '3d', planUp: false }).shownView).toBe('plan');
    expect(ctxOf({ chosenView: 'sheets', planUp: false }).shownView).toBe('sheets');
    expect(ctxOf({ chosenView: 'sheets', ready: false }).shownView).toBe('plan');
    expect(ctxOf({ chosenView: 'plan' }).shownView).toBe('plan');
    expect(editorScreen(ctxOf({ chosenView: '3d' }))).toEqual({
      show3d: true,
      showSheets: false,
      showPlan: true,
    });
    expect(editorScreen(ctxOf({ chosenView: 'sheets', planUp: false }))).toEqual({
      show3d: false,
      showSheets: true,
      showPlan: false,
    });
  });

  it('only Sheets hides the plan canvas (kept mounted); a press takes Plan, 3D or Sheets only', () => {
    expect(planHidden(features, ctxOf({ chosenView: 'sheets' }))).toBe(true);
    expect(planHidden(features, ctxOf({ chosenView: '3d' }))).toBe(false);
    expect(planHidden(features, ctxOf({ chosenView: 'plan' }))).toBe(false);
    for (const v of ['plan', '3d', 'sheets'] as const) expect(knownView(features, v)).toBe(true);
    expect(knownView(features, 'render')).toBe(false);
  });

  it('a screen that shows covers the left panel, inspector and status with its own parts (stand-ins)', () => {
    const sheets: EditorFeature = {
      id: 'sheets',
      order: real('sheets').order,
      active: real('sheets').active,
      screen: real('sheets').screen,
      screenCanvas: () => <i data-part="sheets-canvas" />,
      screenLeftPanel: () => <i data-part="sheets-panel" />,
      screenStatusStart: () => <i data-part="sheets-start" />,
      screenStatusEnd: () => <i data-part="sheets-end" />,
    };
    const list = [sheets];
    const c = { ...ctxOf({ chosenView: 'sheets' }), shownView: 'sheets' as const };
    const screen = editorScreen(c);
    const active = activeFeatures(list, c);
    expect(shown(screenPart(list, c, 'screenCanvas'))).toEqual(['sheets-canvas']);
    expect(shown(editorLeftPanel(screen, list, active, c, stub('layers')))).toEqual([
      'sheets-panel',
    ]);
    expect(
      shown(
        editorStatusStart(screen, list, active, c, {
          planReady: true,
          floorSwitcher: stub('floor'),
          planStart: stub('plan-start'),
        }),
      ),
    ).toEqual(['sheets-start']);
    expect(shown(editorStatusEnd(screen, list, active, c, stub('plan-end')))).toEqual([
      'sheets-end',
    ]);
    // Sheets: no inspector (the place is empty).
    const place = editorInspector(screen, active, c, {
      fixtures: null,
      selection: stub('selection'),
    });
    expect(place.part).toBeNull();
    // On the plan the same list draws the plan's own parts.
    const p = ctxOf({ chosenView: 'plan' });
    expect(screenPart(list, p, 'screenCanvas')).toBeNull();
    expect(shown(editorLeftPanel(editorScreen(p), list, [], p, stub('layers')))).toEqual([
      'layers',
    ]);
  });

  it('the real 3D canvas draws its sync footer ("Updating from plan" until the scene is there)', () => {
    const node = real('scene-3d').screenCanvas!(
      ctxOf({ chosenView: '3d', own: { 'scene-3d': { scene: null } } }),
    );
    expect(node).toBeTruthy();
    expect(real('scene-3d').screenLeftPanel).toBeUndefined();
    expect(real('scene-3d').screenStatusStart).toBeUndefined();
  });

  it('the real Sheets parts draw nothing before its screen store is made', () => {
    const c = ctxOf({ chosenView: 'sheets', own: { sheets: { screen: null } } });
    for (const slot of [
      'screenCanvas',
      'screenLeftPanel',
      'screenStatusStart',
      'screenStatusEnd',
    ] as const)
      expect(real('sheets')[slot]!(c), slot).toBeNull();
  });

  it('3D gives the dev hooks its scene, whether it shows, and its loaded check (the same function each time)', () => {
    const c = ctxOf({ chosenView: '3d', own: { 'scene-3d': { scene: null } } });
    const a = featureDevParts(features, c);
    const b = featureDevParts(
      features,
      ctxOf({ chosenView: 'plan', own: { 'scene-3d': { scene: null } } }),
    );
    expect(a.show3d).toBe(true);
    expect(b.show3d).toBe(false);
    expect(a.scene3d).toBeNull();
    expect(a.scene3dLoaded).toBe(b.scene3dLoaded);
    expect(a.scene3dLoaded()).toBe(false);
    // Without the feature, the values dev-hooks.ts had without a scene.
    const none = featureDevParts([], c);
    expect(none).toMatchObject({ scene3d: null, show3d: false });
    expect(none.scene3dLoaded()).toBe(false);
  });
});

describe('EZD-1913c AC-EZD-1913c-1 Versions', () => {
  it('is in the generated list at the versions status place (800), on for an open editor', () => {
    expect(real('versions').order).toBe(STATUS_START_ORDER.versions);
    expect(STATUS_START_ORDER.versions).toBe(800);
    expect(activeFeatures(features, ctxOf()).map((f) => f.id)).toContain('versions');
    expect(activeFeatures(features, ctxOf({ ready: false })).map((f) => f.id)).not.toContain(
      'versions',
    );
  });

  it('a version shown read-only pauses every edit (mayEdit false); the working copy does not', () => {
    const viewing = ctxOf({ own: { versions: versionsOwn({ viewing: ROW }) } });
    const working = ctxOf({ own: { versions: versionsOwn() } });
    expect(editsAllowed(features, viewing, true)).toBe(false);
    expect(editsAllowed(features, working, true)).toBe(true);
    expect(editsAllowed(features, working, false)).toBe(false);
  });

  it('gives the left panel its tab and the Versions tab, and the header its version text', () => {
    const own = versionsOwn({ tab: 'versions' });
    const c = ctxOf({ own: { versions: own } });
    const props = real('versions').leftPanelProps!(c);
    expect(props.tab).toBe('versions');
    expect(props.onTab).toBe(own.setTab);
    expect(props.versions).toBeTruthy();
    expect(real('versions').headerSubtitle!(c)).toBe(own.link);
  });

  it('the version inspector shows only while a version does, before every mode inspector', () => {
    expect(real('versions').inspectorOver!(ctxOf({ own: { versions: versionsOwn() } }))).toBeNull();
    expect(
      real('versions').inspectorOver!(ctxOf({ own: { versions: versionsOwn({ viewing: ROW }) } })),
    ).toBeTruthy();
    expect(real('versions').inspector).toBeUndefined();
    // Stand-ins at the real orders: the version inspector wins over the Cabinets box inspector (order 100).
    const versions: EditorFeature = {
      id: 'versions',
      order: real('versions').order,
      active: () => true,
      inspectorOver: () => <i data-part="version-inspector" />,
    };
    const cabinets: EditorFeature = {
      id: 'cabinets',
      order: real('cabinets').order,
      active: () => true,
      inspector: () => <i data-part="cabinets-inspector" />,
    };
    const c = ctxOf();
    const active = activeFeatures([cabinets, versions], c);
    const parts = { fixtures: stub('fixtures'), selection: stub('selection') };
    const place = editorInspector(editorScreen(c), active, c, parts);
    expect(shown(place.part)).toEqual(['version-inspector']);
    expect(place.label).toBe('office.shell.inspector');
    expect(shown(editorInspector(editorScreen(c), [cabinets], c, parts).part)).toEqual([
      'cabinets-inspector',
    ]);
  });

  it('the diff layer draws over the plan only while a version shows, after the Assistant preview', () => {
    expect(real('versions').planLayer!(ctxOf({ own: { versions: versionsOwn() } }))).toBeNull();
    expect(
      real('versions').planLayer!(ctxOf({ own: { versions: versionsOwn({ viewing: ROW }) } })),
    ).toBeTruthy();
    const layer = (id: string): EditorFeature => ({
      id,
      order: real(id).order,
      active: () => true,
      planLayer: () => <i data-part={id} />,
    });
    const c = ctxOf();
    const list = ['versions', 'assistant', 'electrical', 'ceiling'].map(layer);
    expect(shown(featureParts(activeFeatures(list, c), 'planLayer', c))).toEqual([
      'ceiling',
      'electrical',
      'assistant',
      'versions',
    ]);
  });

  it('the status text shows while the Versions tab is open or a version shows, at 800 after the lock (700)', () => {
    expect(real('versions').statusStart!(ctxOf({ own: { versions: versionsOwn() } }))).toBeNull();
    expect(
      real('versions').statusStart!(ctxOf({ own: { versions: versionsOwn({ tab: 'versions' }) } })),
    ).toBeTruthy();
    expect(
      real('versions').statusStart!(ctxOf({ own: { versions: versionsOwn({ viewing: ROW }) } })),
    ).toBeTruthy();
    const item = (id: string): EditorFeature => ({
      id,
      order: real(id).order,
      active: () => true,
      statusStart: () => <i data-part={id} />,
    });
    const c = ctxOf();
    const list = [item('versions'), item('lock')];
    const node = editorStatusStart(editorScreen(c), list, activeFeatures(list, c), c, {
      planReady: true,
      floorSwitcher: stub('floor'),
      planStart: stub('plan-start'),
    });
    expect(shown(node)).toEqual(['floor', 'plan-start', 'lock', 'versions']);
  });

  it('the page hooks of every listed feature run before the editor is ready without throwing', () => {
    const spy = vi.fn();
    function Host() {
      const own = useFeatureOwn(features, ctxOf({ ready: false }));
      spy([...own.keys()].sort());
      return null;
    }
    renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <Host />
      </MessagesProvider>,
    );
    expect(spy).toHaveBeenCalledWith([
      'assistant',
      'conflicts',
      'help',
      'lock',
      'scene-3d',
      'send',
      'sheets',
      'upload',
      'versions',
    ]);
  });
});

describe('EZD-1913c AC-EZD-1913c-1 ProjectEditor names none of the moved features', () => {
  const text = fs
    .readFileSync(path.join(__dirname, '..', 'ProjectEditor.tsx'), 'utf8')
    // Import paths name folders (shared/, help/rail-keys for the rail's key text); the names in the code count.
    .replace(/from '[^']*'/g, "from ''");

  it('names neither Versions, Sheets, 3D nor any of their parts', () => {
    expect(text).not.toMatch(/version/i);
    expect(text).not.toMatch(/sheets/i);
    expect(text).not.toMatch(/scene/i);
    expect(text).not.toMatch(/3d/i);
    for (const part of [
      'DiffLayer',
      'CleanupSheet',
      'cleanup',
      'revert',
      'Revert',
      'issuedNo',
      'sentNo',
    ])
      expect(text, part).not.toContain(part);
  });
});

describe('EZD-1913c AC-EZD-1913c-2 the specs and the dev hooks stay as they were', () => {
  const editorDir = path.join(__dirname, '..');
  const read = (...parts: string[]) => fs.readFileSync(path.join(editorDir, ...parts), 'utf8');

  it('the e2e specs the criterion names are there', () => {
    const e2e = path.join(editorDir, '..', '..', 'e2e');
    for (const spec of [
      'versions-panel.spec.ts',
      'sent-versions.spec.ts',
      'sheets-screen.spec.ts',
      'scene-3d.spec.ts',
      'assistant-panel.spec.ts',
      'assistant-preview.spec.ts',
      'assistant-accept.spec.ts',
      'assistant-photo.spec.ts',
      'conflict-list.spec.ts',
      'keyboard-shortcuts.spec.ts',
    ])
      expect(fs.existsSync(path.join(e2e, spec)), spec).toBe(true);
  });

  it('the dev hooks keep their names and are installed by dev-hooks.ts alone', () => {
    const hooks = ['__ezdraftEditor', '__ezdraftPlan', '__ezdraftSelection', '__ezdraft3d'];
    const devHooks = read('dev-hooks.ts');
    for (const name of hooks) expect(devHooks, name).toMatch(new RegExp(`w\\.${name} = hook`));
    expect(devHooks).toMatch(/scene3dLoaded\(\): boolean/);
    expect(devHooks).toMatch(/stats\(\): Scene3dStats & \{ contexts: number; shown: boolean \}/);
    for (const id of [
      'versions',
      'sheets',
      'scene-3d',
      'assistant',
      'conflicts',
      'lock',
      'send',
      'upload',
      'help',
    ]) {
      expect(read('features', `${id}.tsx`), id).not.toContain('__ezdraft');
      expect(real(id).devHook, id).toBeUndefined();
    }
    expect(read('ProjectEditor.tsx')).toMatch(/useDevHooks\(\{[^}]*devHooks/);
  });
});
