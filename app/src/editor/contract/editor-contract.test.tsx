// EZD-1901 (AC-EZD-1901-1, -2; vault/plans/editor-consolidation-2026-11-23.md section 2 "Feature inventory (the
// contract)"; S03 Layout, Status bar, Help; S05 Entry points; 04 Tool rail): the editor's feature contract. Every list
// here is the plan's section 2 table, written by hand, and the test fails when the code loses any entry. The
// consolidation tickets (EZD-1902 to EZD-1921) must pass it with only import-path changes (plan section 7;
// AC-EZD-1910-4), so it checks behaviour through exports and rendered markup, never a named source file. The one
// text scan (dev hooks, which only ProjectEditor installs) reads the whole of app/src.
//
// Rail order is not pinned here (section 2.2 lists the tools, not their order; the order is per user, EZD-230);
// e2e/plan-canvas.spec.ts B7 pins the counts 16 top (13, plus EZD-216 Dimension and Text, EZD-232 Revision cloud) and Assistant, Help bottom. vault/build/assumptions.md EZD-1901.
//
// AC-EZD-1901-2: the 7 built tickets that no test names (section 2.7) are each covered by these existing tests,
// which the gate already runs; no characterization test is needed:
// - EZD-014a (device switch, phone layout; components/shell/EmptyEditor.tsx "phone notice", Q-0908):
//   components/device/DeviceLayout.test.tsx "EZD-014a done when", components/phone/PhoneFrame.test.tsx
//   "EZD-014a phone components", components/shell/EmptyEditor.test.tsx "U3 EmptyEditor renders the full frame with or
//   without a phone prop".
// - EZD-015b (toast and confirm dialog; editor/lock-ui/LockUi.tsx lock toasts): components/states/ConfirmDialog.test.tsx
//   "EZD-015b confirm dialog wiring", editor/lock-ui/LockUi.test.tsx "EZD-126 U13 the green Available toast" (renders
//   ToastList from components/states/toast-store), FloorSwitcher.test.tsx (ConfirmProvider).
// - EZD-030 (spike: wall openings and sloped ceiling; lazy/scene-3d/scene.ts): packages/geometry/src/scene3d/
//   wall-face.test.ts "a door is a notch in the outline and a window is a hole", lazy/scene-3d/scene-3d.slope.test.ts
//   "EZD-504 3D walls under a slope".
// - EZD-204a (opening data v4; editor/inspector/test-utils/fixtures.ts createOpeningData):
//   server/model/opening-upgrade.db.test.ts "EZD-204a stored v3 opening upgrade", and every inspector opening test
//   that builds its doors with those fixtures (editor/inspector/InspectorPanel.test.tsx "EZD-213b U3 door labels").
// - EZD-206 (snapping, spatial index; editor/plan/hover.ts, editor/selection/pick-index.ts):
//   packages/geometry/src/snap/snap.test.ts "EZD-206 snapping" N1-N20, editor/plan/hover.test.ts "EZD-207b hover
//   index", editor/selection/pick-index.test.ts "EZD-208a P2 a pick reads only the nearby cells",
//   lib/imports/review-fix.test.ts "EZD-309 snaps as in the Plan editor (EZD-206 ...)".
// - EZD-402 (cabinet object model; editor/cabinets/run-inspector.ts run counts): packages/geometry/src/cabinets/
//   run.test.ts "EZD-402 cabinet run total" and "EZD-402 box position", editor/cabinets/cabinet-view.test.ts (box and
//   filler counts 5 and 1), editor/cabinets/cabinet-autofill.test.ts (boxCount 3, fillerCount 2),
//   editor/cabinets/run-inspector.test.ts "AC-EZD-419-1 the island run".
// - EZD-726 (sheet sets; lazy/sheets-screen/sheets-screen-store.ts): lib/sheets/sheet-set.test.ts "EZD-726 sheets of
//   each set", app/api/projects/[id]/sheet-sets/route.test.ts "EZD-726 /api/projects/[id]/sheet-sets",
//   lazy/sheets-screen/sheets-screen.test.tsx "reads the sets from the project sheet-sets route".
// The 16 unbuilt tickets named in editor comments (EZD-415, -514, -605, -607, -608, -615, -619, -630, -703, -707, -716,
// -718, -721, -1005, -1017, -1022) have no feature yet and need nothing (section 2.7).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements } from '../../../test-harness/projects-markup';
import { ConfirmProvider } from '../../components/states/ConfirmProvider';
import { DEFAULT_BINDINGS, DEFAULT_KEYS } from '../../lib/defaults/shortcut-keys';
import { eyeDefaults, type PhaseEyes } from '../../lib/plan/phase-view';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { ASSISTANT_RAIL_TOOL } from '../assistant/assistant-ui';
import { CEILING_RAIL_TOOL, CEILING_TOOL_IDS } from '../ceiling/surface';
import { createFloorView } from '../floors/floors';
import { FloorSwitcher } from '../floors/FloorSwitcher';
import { railToolsWithKeys } from '../help/rail-keys';
import { houseObjects, IDS } from '../inspector/test-utils/fixtures';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createLayerSetting, type LayerPhase } from '../layers/layer-setting';
import { LeftPanel } from '../layers/LeftPanel';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import type { EditorTestHook } from '../ProjectEditor';
import { editorRail } from '../selection/selection-controller';
import { createPhaseSetting } from '../status/phase-setting';
import { PlanStatusEnd, PlanStatusStart } from '../status/PlanStatus';
import type { ScaleSetting, SnapSettingsStore } from '../status/view-settings';
import { placeActGrid } from '../tools/act-grid-edits';
import { helpRailTool } from '../tools/DrawingTools';
import { placeCeilingDevice } from '../tools/fixture-tool';
import { baseObjects, DOOR, F1, roomValue, uid } from '../tools/test-utils/fixtures';
import { DEFAULT_SNAP_SETTINGS } from '@ezdraft/geometry';

const P = (x: number, y: number): Point => ({ x, y });
const wrap = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </MessagesProvider>,
  );

// ---- Section 2.2 rail tools and 2.3 default keys --------------------------------------------------------------------

// Section 2.2 floor rail table: tool id and its default key, 13 top tools, plus EZD-216 Dimension (L) and Text (T), EZD-232 Revision cloud (Q).
const FLOOR_RAIL: Readonly<Record<string, string>> = {
  select: 'V',
  move: 'M',
  wall: 'W',
  'room-rect': 'R',
  door: 'D',
  window: 'N',
  fixtures: 'F',
  sketch: 'S',
  measure: 'Shift+L',
  cabinets: 'C',
  countertops: 'K',
  electrical: 'E',
  ceiling: 'G',
  dimension: 'L',
  text: 'T',
  'revision-cloud': 'Q',
};
// Section 2.2 bottom: Assistant (no key, editors only), then Help (?).
const BOTTOM_RAIL = ['assistant', 'help'];
// Section 2.2 ceiling rail: Ceiling type, Beam, Recessed light, Ceiling fan, Acoustical grid, HVAC, Detector, Low
// voltage, Access panel, Soffit, Tag.
const CEILING_RAIL = [
  'ceiling-type',
  'beam',
  'recessed-light',
  'ceiling-fan',
  'act-grid',
  'hvac',
  'detector',
  'low-voltage',
  'access-panel',
  'soffit',
  'tag',
];
// Section 2.3: every entry of the company key map, with its default key. Status (grep, section 2.3): wired are the
// rail tool keys, help, undo, redo, copy, paste; reserved (kept in the map and in Settings, no handler yet) are
// tab-plan, tab-3d, tab-sheets, tab-render, look-up, pan, and the keys of the unbuilt tools catalog, dimension, text,
// detail-callout, revision-cloud, reference, markup, supplier-markup, check, save.
const KEY_MAP: Readonly<Record<string, string>> = {
  ...FLOOR_RAIL,
  help: '?',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  copy: 'Mod+C',
  paste: 'Mod+V',
  'tab-plan': '1',
  'tab-3d': '2',
  'tab-sheets': '3',
  'tab-render': '4',
  'look-up': 'U',
  catalog: 'P',
  dimension: 'L',
  text: 'T',
  'detail-callout': 'X',
  'revision-cloud': 'Q',
  reference: 'Shift+R',
  markup: 'Shift+M',
  'supplier-markup': 'Shift+S',
  check: 'Shift+C',
  save: 'Mod+S',
  pan: 'H',
};

describe('EZD-1901 contract: rail tools and keys (section 2.2, 2.3)', () => {
  const ready = editorRail({
    editor: 'ready',
    canEdit: true,
    canEditModel: true,
    canvasFailed: false,
    controllerEnabled: true,
  });

  it('AC-EZD-1901-1 the floor rail has the 13 top tools of section 2.2 and Dimension and Text, each with its default key', () => {
    expect(ready).not.toBeNull();
    // DrawingRail puts the Ceiling tool after the editor's tools when the plan has a surface.
    const top = railToolsWithKeys([...ready!.tools, CEILING_RAIL_TOOL], DEFAULT_BINDINGS);
    const got = Object.fromEntries(top.map((t) => [t.id, t.shortcut]));
    for (const [id, key] of Object.entries(FLOOR_RAIL)) expect(got[id], id).toBe(key);
    expect(top).toHaveLength(16);
    expect(top[0]!.id).toBe('select');
  });

  it('AC-EZD-1901-1 the bottom rail tools are Assistant and Help (?)', () => {
    const bottom = [ASSISTANT_RAIL_TOOL, helpRailTool(DEFAULT_KEYS.help)];
    expect(bottom.map((t) => t.id)).toEqual(BOTTOM_RAIL);
    expect(bottom[1]!.shortcut).toBe('?');
  });

  it('AC-EZD-1901-1 a view-only user keeps Select, Cabinets, Countertops, Electrical and Measure (section 2.2)', () => {
    const view = editorRail({
      editor: 'ready',
      canEdit: false,
      canEditModel: false,
      canvasFailed: false,
      controllerEnabled: true,
    });
    const ids = view!.tools.map((t) => t.id);
    expect(ids[0]).toBe('select');
    expect([...ids].sort()).toEqual(['cabinets', 'countertops', 'electrical', 'measure', 'select']);
  });

  it('AC-EZD-1901-1 the ceiling rail has the 11 ceiling tools of section 2.2', () => {
    expect([...CEILING_TOOL_IDS].sort()).toEqual([...CEILING_RAIL].sort());
  });

  it('AC-EZD-1901-1 the key map keeps every section 2.3 command with its default key', () => {
    const keys = DEFAULT_KEYS as Readonly<Record<string, string>>;
    for (const [id, key] of Object.entries(KEY_MAP)) expect(keys[id], id).toBe(key);
  });
});

// ---- Section 2.4 left panel tabs ------------------------------------------------------------------------------------

function phaseStub(): LayerPhase {
  const eyes: PhaseEyes = eyeDefaults('existing');
  return { get: () => ({ eyes }), version: () => 0, setEye: () => {}, subscribe: () => () => {} };
}

describe('EZD-1901 contract: left panel (section 2.4)', () => {
  it('AC-EZD-1901-1 the floor left panel has the tabs Layers, Rooms and Versions', () => {
    const store = createModelStore({ objects: houseObjects() });
    const ui = { ids: [] as string[], selectMore: false };
    const html = wrap(
      <LeftPanel
        store={store}
        layers={createLayerSetting(phaseStub())}
        selection={{ getUi: () => ui, subscribe: () => () => {}, select: () => {} }}
        showObject={() => true}
        canEdit
        versions={<div />}
      />,
    );
    for (const tab of ['layers', 'rooms', 'versions'])
      expect(elements(html, `left-panel-tab-${tab}`), tab).toHaveLength(1);
  });
});

// ---- Section 2.5 inspector branches ---------------------------------------------------------------------------------

const ROOM_ID = uid(60);
function laundry(): Map<string, ObjectValue> {
  const objects = new Map(DOOR);
  objects.set(ROOM_ID, roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Laundry', null));
  return objects;
}
function withValue(objects: Map<string, ObjectValue>, id: string, value: ObjectValue) {
  objects.set(id, value);
  return objects;
}
const valueOf = (type: string, data: Record<string, unknown>): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});

const PIN = uid(700);
const NOTE = uid(701);
const BEAM = uid(702);
const ZONE = uid(703);
const GRID = uid(704);
const DEVICE = uid(705);

function pinObjects() {
  return withValue(
    baseObjects(),
    PIN,
    valueOf('pin', {
      geometry: { point: P(48, 30) },
      status: 'existing',
      level: F1,
      attributes: { kind: 'damage_moisture', photoFileId: null },
    }),
  );
}
function noteObjects() {
  return withValue(
    baseObjects(),
    NOTE,
    valueOf('engineer_note', {
      geometry: { start: P(0, 0), end: P(144, 0) },
      status: 'existing',
      level: F1,
      attributes: {
        wallId: uid(1),
        action: 'delete',
        engineerName: '',
        approvedText: '',
        fileId: null,
        letterOnFile: false,
      },
    }),
  );
}
function beamObjects() {
  const objects = laundry();
  const room = objects.get(ROOM_ID)!.data as { attributes: Record<string, unknown> };
  room.attributes = {
    ...room.attributes,
    ceilingType: 'vaulted',
    ceiling: {
      heightsBy: 'pitch',
      wallHeights: [],
      pointHeights: [],
      pitch: 9.4,
      ridge: { start: P(0, 60), end: P(144, 60), height: 156 },
    },
  };
  return withValue(
    objects,
    BEAM,
    valueOf('beam', {
      geometry: { roomId: ROOM_ID, shift: P(0, 0) },
      status: 'new',
      level: F1,
      attributes: {
        placement: 'level_in_vault',
        heightAff: 108,
        match: 'custom',
        matchRoomId: null,
        width: 6,
        height: 8,
        layout: { by: 'spacing', spacing: 48 },
        length: null,
        direction: 'across_ridge',
        endDetail: 'square',
      },
    }),
  );
}
function zoneObjects() {
  return withValue(
    laundry(),
    ZONE,
    valueOf('switch_zone', {
      geometry: { roomId: ROOM_ID, boundary: [P(24, 24), P(96, 24), P(96, 72), P(24, 72)] },
      status: 'new',
      level: F1,
      attributes: { dimmer: false },
    }),
  );
}
function gridObjects() {
  const objects = laundry();
  const r = placeActGrid(objects, F1, P(50, 50), 'new', () => GRID, 0.5);
  if (r.kind !== 'placed') throw new Error('the ACT grid was not placed');
  return withValue(objects, GRID, r.change.value!);
}
function deviceObjects() {
  const change = placeCeilingDevice('recessed_light', P(30, 40), {
    level: F1,
    newId: () => DEVICE,
    status: 'new',
  })!;
  return withValue(baseObjects(), DEVICE, change.value! as ObjectValue);
}

function inspectorKind(objects: Objects, ids: string[]): string | null {
  const store = createModelStore({ objects: objects as Map<string, ObjectValue> });
  const ui = { ids, selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
  const html = wrap(<InspectorPanel store={store} selection={selection} canEdit drawing={null} />);
  const panel = elements(html, 'inspector');
  return panel.length === 0 ? null : (attr(panel[0]!.attrs, 'data-inspector-kind') ?? null);
}

// Section 2.5, in order: room alone, pin, beam set, ACT grid, switching zone, device, engineer note, then wall /
// opening / bulk; nothing selected is the empty inspector. The mode overrides (version inspector EZD-122, cabinet box
// inspector EZD-406, countertop inspector EZD-414/-419, Assistant panel EZD-5603a) are chosen by ProjectEditor, which a
// unit test cannot mount; e2e/versions-panel.spec.ts, e2e/cabinet-run.spec.ts, the countertop specs naming EZD-414
// and e2e/assistant-panel.spec.ts cover them.
describe('EZD-1901 contract: inspector branches (section 2.5)', () => {
  const cases: Array<[string, () => Objects, string[]]> = [
    ['room', houseObjects, [IDS.KITCHEN]],
    ['pin', pinObjects, [PIN]],
    ['beam', beamObjects, [BEAM]],
    ['act_grid', gridObjects, [GRID]],
    ['switch_zone', zoneObjects, [ZONE]],
    ['device', deviceObjects, [DEVICE]],
    ['engineer_note', noteObjects, [NOTE]],
    ['wall', houseObjects, [IDS.W1]],
    ['opening', houseObjects, [IDS.EXTERIOR_DOOR]],
    ['bulk', houseObjects, [IDS.W1, IDS.PARTITION]],
    ['empty', houseObjects, []],
  ];
  for (const [kind, objects, ids] of cases)
    it(`AC-EZD-1901-1 the inspector shows its ${kind} branch`, () => {
      expect(inspectorKind(objects(), ids)).toBe(kind);
    });
});

// ---- Section 2.6 status bar: the six plain-plan items ---------------------------------------------------------------

const scaleStub: ScaleSetting = {
  get: () => 0.5,
  set: () => {},
  subscribe: () => () => {},
  failed: () => false,
  retry: () => {},
  dispose: () => {},
};
const snapStub: SnapSettingsStore = {
  get: () => DEFAULT_SNAP_SETTINGS,
  setToggle: () => {},
  setIncrement: () => {},
  subscribe: () => () => {},
};
const handleStub = {
  onCursorChange: () => () => {},
  onCameraChange: () => () => {},
  getZoomPercent: () => 100,
  setZoomPercent: () => {},
};

describe('EZD-1901 contract: status bar (section 2.6)', () => {
  it('AC-EZD-1901-1 a plain plan has six status items: Floor, phase View, Scale, Snap, Cursor, Zoom', () => {
    const store = createModelStore({
      objects: new Map([[F1, valueOf('floor', { name: 'Floor 1', order: 1 })]]),
    });
    const floors = createFloorView();
    const phase = createPhaseSetting({ view: 'existing', canEdit: true, save: async () => true });
    const html = wrap(
      <>
        <FloorSwitcher store={store} floors={floors} canEdit />
        <PlanStatusStart scale={scaleStub} snap={snapStub} phase={phase} />
        <PlanStatusEnd handle={handleStub} />
      </>,
    );
    phase.dispose();
    expect(html.split('data-status-item').length - 1).toBe(6);
    for (const id of [
      'floor-control',
      'status-phase',
      'status-scale',
      'status-snap',
      'status-cursor',
      'status-zoom',
    ])
      expect(elements(html, id), id).toHaveLength(1);
  });
});

// ---- Section 2.6 dev and test hooks ---------------------------------------------------------------------------------

// Hook name and the members section 2.6 names. Many e2e specs read them; names and shapes must not change.
const DEV_HOOKS: Readonly<Record<string, readonly string[]>> = {
  // EZD-2009 added scene3dLoaded (whether the lazy 3D scene module has loaded); the three before it are unchanged.
  __ezdraftEditor: ['objects', 'edit', 'checkpoint', 'scene3dLoaded'],
  __ezdraftPlan: ['handle', 'stats', 'phase', 'underlay', 'drawn', 'drawnTexts'],
  __ezdraftSelection: ['ids', 'hoveredId'],
  __ezdraft3d: ['stats'],
  __ezdraftWorkerProbe: [],
};

// A type check: EditorTestHook keeps exactly objects, edit, checkpoint and (EZD-2009) scene3dLoaded (typecheck fails
// otherwise).
const EDITOR_HOOK_KEYS: Record<keyof EditorTestHook, true> = {
  objects: true,
  edit: true,
  checkpoint: true,
  scene3dLoaded: true,
};

const SRC = fileURLToPath(new URL('../../', import.meta.url));
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes(`${path.sep}test-utils${path.sep}`))
      out.push(full);
  }
  return out;
}

describe('EZD-1901 contract: dev hooks (section 2.6)', () => {
  it('AC-EZD-1901-1 the app installs every dev hook with the members section 2.6 names', () => {
    expect(Object.keys(EDITOR_HOOK_KEYS).sort()).toEqual([...DEV_HOOKS.__ezdraftEditor!].sort());
    const files = sourceFiles(SRC).map((f) => readFileSync(f, 'utf8'));
    for (const [hook, members] of Object.entries(DEV_HOOKS)) {
      const installs = files.filter((text) => new RegExp(`\\.${hook}\\s*=\\s*\\w`).test(text));
      expect(installs.length, `${hook} is installed`).toBeGreaterThan(0);
      for (const m of members)
        expect(
          installs.some((text) => new RegExp(`\\b${m}\\s*[:(,]`).test(text)),
          `${hook}.${m}`,
        ).toBe(true);
    }
  });
});
