// EZD-1912 (AC-EZD-1912-1): create-controllers builds the controllers in the order ProjectEditor built them before
// the move, and disposes them in ProjectEditor's dispose order. The expected orders are read from ProjectEditor.tsx
// at EZD-1911 (the session open effect, the `dispose` closure).
// AC-EZD-1912-2: no existing editor unit or e2e test was changed by this ticket; they run unchanged in the gate. The
// last test here pins the controller set those tests rely on.
import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => [] as string[]);

vi.mock('../status/view-settings', () => ({
  createScaleSetting: () => {
    log.push('build scale');
    return {
      get: () => 48,
      subscribe: () => () => log.push('dispose scale listener'),
      dispose: () => log.push('dispose scale'),
    };
  },
  deviceSnapSettings: { get: () => ({}) },
}));
vi.mock('../status/phase-setting', () => ({
  createPhaseSetting: () => {
    log.push('build phase');
    return { newObjectStatus: () => 'new', dispose: () => log.push('dispose phase') };
  },
}));
vi.mock('../model/routed-store', () => ({
  createRoutedStore: () => {
    log.push('build routed');
    return {};
  },
}));
vi.mock('../layers/layer-setting', () => ({
  createLayerSetting: () => {
    log.push('build layers');
    return { selectable: () => true };
  },
}));
vi.mock('../derived/model-derived', () => ({
  createModelDerived: () => {
    log.push('build derived');
    return {};
  },
}));
vi.mock('../floors/floors', () => ({
  createFloorView: () => {
    log.push('build floors');
    return { getState: () => ({ chosenId: null }) };
  },
}));
vi.mock('../plan/controller', () => ({
  createPlanController: () => {
    log.push('build plan');
    return {
      handle: { setPointerReceiver: () => {}, setScale: () => {} },
      dispose: () => log.push('dispose plan'),
    };
  },
}));
vi.mock('../plan/render-root', () => ({ createPlanRoot: () => ({}) }));
vi.mock('../plan/glyph-atlas-canvas', () => ({ createGlyphAtlas: () => ({}) }));
vi.mock('../tools/beam-tool', () => ({
  receiverRouter: () => ({ base: () => {}, tool: () => {} }),
  ceilingAware: () => () => true,
}));
vi.mock('../tools/drawing-shell', () => ({
  createDrawingShell: () => {
    log.push('build drawing');
    return {
      claimSelectPointer: () => false,
      attachSelection: (s: unknown) => log.push(s === null ? 'drawing detach selection' : 'drawing attach selection'),
      selectTool: () => {},
      dispose: () => log.push('dispose drawing'),
    };
  },
}));
vi.mock('../selection/selection-controller', () => ({
  shareReceiver: () => ({ drawing: () => {}, selection: () => {} }),
  createSelectionController: () => {
    log.push('build selection');
    return { getUi: () => ({ ids: [] }), clear: () => {}, dispose: () => log.push('dispose selection') };
  },
}));
vi.mock('../edit/edit-controller', () => ({
  createEditController: () => {
    log.push('build edit');
    return { dispose: () => log.push('dispose edit') };
  },
}));
vi.mock('../assistant/assistant-loader', () => ({
  createAssistantLoader: () => {
    log.push('build assistant');
    return { dispose: () => log.push('dispose assistant') };
  },
}));
vi.mock('../versions/version-view', () => ({
  createVersionView: () => {
    log.push('build versions');
    return { dispose: () => log.push('dispose versions') };
  },
}));

import type { EditorSession } from '../editor-session';
import type { SurfaceSetting } from '../ceiling/surface';
import { createControllers } from './create-controllers';

function fakeSession(sync: unknown): EditorSession {
  const store = { getState: () => ({ objects: {} }) };
  return {
    model: {
      project: { planScale: 48, phaseDefault: null },
      viewer: { canEdit: true },
      lockEpoch: 0,
    },
    store,
    defaults: { get: () => ({}) },
    sync,
    dispose: () => log.push('dispose session'),
  } as unknown as EditorSession;
}

function make(sync: unknown) {
  // The drawing shell is handed `window` as its input source; the unit tests run in node.
  vi.stubGlobal('window', {});
  log.length = 0;
  return createControllers({
    projectId: 'p1',
    session: fakeSession(sync),
    surface: {} as SurfaceSetting,
    onMessage: () => {},
    loadAssistant: () => new Promise(() => {}),
  });
}

describe('EZD-1912 createControllers (AC-EZD-1912-1)', () => {
  it("builds the controllers in today's order", () => {
    make({});
    expect(log).toEqual([
      'build scale',
      'build phase',
      'build routed',
      'build layers',
      'build derived',
      'build floors',
      'build plan',
      'build drawing',
      'build selection',
      'drawing attach selection',
      'build edit',
      'build assistant',
      'build versions',
    ]);
  });

  it("disposes them in today's reverse order and leaves the session to the caller", () => {
    const made = make({});
    log.length = 0;
    made.dispose();
    expect(log).toEqual([
      'dispose versions',
      'dispose assistant',
      'drawing detach selection',
      'dispose edit',
      'dispose selection',
      'dispose scale listener',
      'dispose scale',
      'dispose phase',
      'dispose drawing',
      'dispose plan',
    ]);
  });

  it('makes no Assistant loader without a sync channel (viewers)', () => {
    const made = make(null);
    expect(made.controllers.assistant).toBeNull();
    expect(log).not.toContain('build assistant');
    log.length = 0;
    made.dispose();
    expect(log[0]).toBe('dispose versions');
    expect(log).not.toContain('dispose assistant');
  });

  it('returns every controller ProjectEditor reads (AC-EZD-1912-2)', () => {
    const { controllers } = make({});
    expect(Object.keys(controllers).sort()).toEqual(
      [
        'assistant',
        'derived',
        'drawing',
        'edit',
        'floors',
        'layers',
        'phase',
        'plan',
        'routed',
        'scale',
        'selection',
        'toolRoute',
        'versions',
      ].sort(),
    );
  });
});
