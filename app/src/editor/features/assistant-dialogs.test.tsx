// EZD-1913c (AC-EZD-1913c-1, AC-EZD-1913c-2; editor plan 2.6, 5.3; spec S03c-ai-assistant): the Assistant, conflicts,
// the edit lock UI, Send, Upload and Help are registry features. The expected places are the ones ProjectEditor.tsx
// gave them before the move (develop 55526a3c9):
// - Assistant (S03c Entry points "Rail button", "the panel takes the inspector place"): an open panel takes the
//   inspector place on every screen, labelled with the Assistant's title (:1170-1174; feature-slots inspectorSlot);
//   the rail toggle for an editor who may edit, on the plan (assistantShown, :1044-1048, :1064); during Adjust only
//   Select is on the rail, no edit menu opens and the edit bar's clipboard is off (:1002, :1063, :775);
// - conflicts: the banner after the cleanup sheet in the header (:952-961); the list after the state column on every
//   screen, before the code check (:1077-1087, :1152-1153); outdated rows quiet the save, scale and phase banners
//   (:1012-1020);
// - the lock UI: presence and Stop editing in the header, the switcher first after it (:883-884, :926); the banner
//   and the paused note (only while the rail is paused) after the edit bar (:1005-1007); its save banner in the
//   save-failed banner's place (:1014); its toasts and prompts last on every screen (:1094, :1105, :1155, :1162); its
//   status at 700 (:1313); a lost lock pauses every edit (:570-571);
// - Send: Share with Send to client only (:885-902); its dialogs after the switcher (:927-939);
// - Upload: the button after the review pill for an editor who may edit (:914-922); the dialog last (:1273-1281);
// - Help: the rail's Help on a loaded editor (:1066-1070); the panel after the code check, before the lock's parts.
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createFeaturePage } from '../shared/feature-page';
import {
  activeFeatures,
  CANVAS_END_ORDER,
  editorInspector,
  editorScreen,
  editsAllowed,
  featureFlag,
  featureItems,
  featureParts,
  featureSlot,
  headerProps,
  railProps,
  shownView,
  STATE_ORDER,
  STATUS_START_ORDER,
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
  return {
    session: {
      store: {},
      sync: null,
      model: { viewer: { canEdit: true }, project: { name: 'Smith' } },
    } as unknown as FeatureReady['session'],
    controllers: {
      plan: { handle: {} },
    } as unknown as FeatureReady['controllers'],
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
    own?: Record<string, unknown>;
    mayEdit?: boolean;
    canSend?: boolean;
    toolsPaused?: boolean;
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
    props: { canSend: opts.canSend ?? false },
    chosenView: opts.chosenView ?? 'plan',
    planUp: true,
    toolsPaused: opts.toolsPaused ?? false,
    own: new Map(Object.entries(opts.own ?? {})),
    ...(opts.ready === false ? {} : { ready: readyOf() }),
  };
  return { ...base, shownView: shownView(features, base) };
}

const loader = { toggle: () => {} };
const assistantOwn = (over: Record<string, unknown> = {}) => ({
  assistant: loader,
  session: {},
  preview: null,
  open: true,
  adjusting: false,
  ...over,
});
const LockPart = ({ part }: { part: string }) => <i data-part={`lock-${part}`} />;
const lockOwn = (over: { lockLost?: boolean } = {}) => ({
  lock: { m: { LockPart }, ui: { switcher: { toggle: () => {} } } },
  lockLost: over.lockLost ?? false,
});

describe('EZD-1913c AC-EZD-1913c-1 Assistant (S03c)', () => {
  it('an open Assistant goes first in the inspector place on every screen, under its own title', () => {
    for (const chosenView of ['plan', '3d', 'sheets'] as const) {
      // The real panel shows where its toggle does (an editor who may edit, on the plan: assistantShown); the place
      // itself goes first on every screen (inspectorSlot), pinned with the stand-in below.
      const c = ctxOf({ chosenView, own: { assistant: assistantOwn() } });
      const part = real('assistant').inspectorTop!(c);
      if (chosenView === 'plan') expect(part, chosenView).toBeTruthy();
      else expect(part, chosenView).toBeNull();
      const top: EditorFeature = {
        id: 'assistant',
        order: real('assistant').order,
        active: () => true,
        inspectorTop: () => <i data-part="assistant" />,
      };
      const s = ctxOf({ chosenView });
      const place = editorInspector(editorScreen(s), [top], s, {
        fixtures: stub('fixtures'),
        selection: stub('selection'),
      });
      expect(shown(place.part), chosenView).toEqual(['assistant']);
      expect(place.label).toBe('office.assistant.title');
    }
  });

  it('the panel and rail toggle are for an editor who may edit, on the plan', () => {
    const own = { assistant: assistantOwn() };
    expect(real('assistant').railProps!(ctxOf({ own })).assistant).toEqual({
      open: true,
      onToggle: loader.toggle,
    });
    expect(real('assistant').railProps!(ctxOf({ own, mayEdit: false })).assistant).toBeNull();
    expect(real('assistant').railProps!(ctxOf({ own, chosenView: '3d' })).assistant).toBeNull();
    expect(real('assistant').inspectorTop!(ctxOf({ own, mayEdit: false }))).toBeNull();
    expect(
      real('assistant').inspectorTop!(ctxOf({ own: { assistant: assistantOwn({ open: false }) } })),
    ).toBeNull();
  });

  it('the preview layer draws over the plan only while a preview is open', () => {
    expect(real('assistant').planLayer!(ctxOf({ own: { assistant: assistantOwn() } }))).toBeNull();
    const preview = { subscribe: () => () => {}, getState: () => ({ preview: null }) };
    expect(
      real('assistant').planLayer!(ctxOf({ own: { assistant: assistantOwn({ preview }) } })),
    ).toBeTruthy();
  });

  it('Adjust limits the tools (rail to Select, no edit menu, no clipboard); nothing else does', () => {
    expect(
      featureFlag(
        features,
        'limitsTools',
        ctxOf({ own: { assistant: assistantOwn({ adjusting: true }) } }),
      ),
    ).toBe(true);
    expect(
      featureFlag(features, 'limitsTools', ctxOf({ own: { assistant: assistantOwn() } })),
    ).toBe(false);
  });
});

describe('EZD-1913c AC-EZD-1913c-1 the edit lock UI', () => {
  it('a lost lock pauses every edit; a held one does not', () => {
    expect(
      editsAllowed(features, ctxOf({ own: { lock: lockOwn({ lockLost: true }) } }), true),
    ).toBe(false);
    expect(editsAllowed(features, ctxOf({ own: { lock: lockOwn() } }), true)).toBe(true);
  });

  it('gives the header presence, Stop editing and the switcher menu, and draws the switcher after it', () => {
    const c = ctxOf({ own: { lock: lockOwn() } });
    const props = headerProps(activeFeatures(features, c), c);
    expect(shown(props.presence)).toEqual(['lock-presence']);
    expect(shown(props.stopEditing)).toEqual(['lock-stop']);
    expect(typeof props.onProjectMenu).toBe('function');
    expect(shown(real('lock').header!(c))).toEqual(['lock-switcher']);
    // Before the lock UI loads: nothing, and the save-failed banner keeps its place.
    const before = ctxOf({ own: { lock: { lock: null, lockLost: false } } });
    expect(real('lock').saveBanner!(before)).toBeNull();
    expect(featureSlot(activeFeatures(features, before), 'saveBanner', before)).toBeNull();
    expect(shown(real('lock').saveBanner!(c))).toEqual(['lock-save']);
  });

  it('the banner and the paused note (while the rail is paused) follow the edit bar, before the banners', () => {
    const parts = {
      editBar: stub('edit-bar'),
      banners: stub('banners'),
      canvasFailed: null,
      planRows: stub('rows'),
    };
    const list = [real('lock')];
    const paused = ctxOf({ own: { lock: lockOwn() }, toolsPaused: true });
    expect(shown(featureItems(STATE_ORDER, parts, list, 'stateItems', paused))).toEqual([
      'edit-bar',
      'lock-banner',
      'lock-paused',
      'banners',
      'rows',
    ]);
    const editing = ctxOf({ own: { lock: lockOwn() } });
    expect(shown(featureItems(STATE_ORDER, parts, list, 'stateItems', editing))).toEqual([
      'edit-bar',
      'lock-banner',
      'banners',
      'rows',
    ]);
  });

  it('its status sits at the lock place (700)', () => {
    expect(real('lock').order).toBe(STATUS_START_ORDER.lock);
    expect(STATUS_START_ORDER.lock).toBe(700);
    expect(shown(real('lock').statusStart!(ctxOf({ own: { lock: lockOwn() } })))).toEqual([
      'lock-status',
    ]);
  });
});

describe('EZD-1913c AC-EZD-1913c-1 conflicts, Send, Upload and Help', () => {
  it('after the state column on every screen: the conflict list, the code check, Help, the lock parts', () => {
    const item = (id: string, name: string): EditorFeature => ({
      id,
      order: real(id).order,
      active: () => true,
      canvasItems: real(id).canvasItems!.map((i) => ({
        order: i.order,
        part: () => <i data-part={name} />,
      })),
    });
    const list = [item('lock', 'lock'), item('help', 'help'), item('conflicts', 'conflicts')];
    const c = ctxOf();
    expect(
      shown(featureItems(CANVAS_END_ORDER, { check: stub('check') }, list, 'canvasItems', c)),
    ).toEqual(['conflicts', 'check', 'help', 'lock']);
    // Off the plan there is no code check; the order is kept.
    expect(shown(featureItems(CANVAS_END_ORDER, { check: null }, list, 'canvasItems', c))).toEqual([
      'conflicts',
      'help',
      'lock',
    ]);
  });

  it('the header parts draw in order: switcher, Send, cleanup sheet, conflict banner, Upload dialog', () => {
    const head = (id: string): EditorFeature => ({
      id,
      order: real(id).order,
      active: () => true,
      header: () => <i data-part={id} />,
    });
    const list = ['upload', 'conflicts', 'versions', 'send', 'lock'].map(head);
    const c = ctxOf();
    expect(shown(featureParts(activeFeatures(list, c), 'header', c))).toEqual([
      'lock',
      'send',
      'versions',
      'conflicts',
      'upload',
    ]);
  });

  it('outdated conflict rows quiet the save, scale and phase banners', () => {
    const conflicts = (outdatedCount: number) => ({
      listOpen: false,
      setListOpen: () => {},
      conflicts: { inputs: [], server: null, outdatedCount, othersSaved: false },
    });
    expect(
      featureFlag(features, 'quietsSaveBanners', ctxOf({ own: { conflicts: conflicts(1) } })),
    ).toBe(true);
    expect(
      featureFlag(features, 'quietsSaveBanners', ctxOf({ own: { conflicts: conflicts(0) } })),
    ).toBe(false);
    expect(real('conflicts').header!(ctxOf({ own: { conflicts: conflicts(0) } }))).toBeNull();
    expect(
      real('conflicts').canvasItems![0]!.part(ctxOf({ own: { conflicts: conflicts(0) } })),
    ).toBeNull();
    expect(
      real('conflicts').canvasItems![0]!.part(
        ctxOf({ own: { conflicts: { ...conflicts(0), listOpen: true } } }),
      ),
    ).toBeTruthy();
  });

  it('Share shows with Send to client only; the Send dialogs only while open', () => {
    const send = {
      sendOpen: false,
      settingsOpen: false,
      sendSet: null,
      open: () => {},
      closeSend: () => {},
      openSettings: () => {},
      closeSettings: () => {},
      onSent: () => {},
    };
    expect(real('send').headerProps!(ctxOf({ own: { send }, canSend: true })).share).toBeTruthy();
    expect(real('send').headerProps!(ctxOf({ own: { send } })).share).toBeUndefined();
    expect(real('send').header!(ctxOf({ own: { send } }))).toBeNull();
    expect(
      real('send').header!(ctxOf({ own: { send: { ...send, sendOpen: true } } })),
    ).toBeTruthy();
  });

  it('Upload files shows for an editor who may edit; its dialog only while open', () => {
    const upload = { uploading: false, setUploading: () => {} };
    expect(real('upload').headerEnd!(ctxOf({ own: { upload } }))).toBeTruthy();
    expect(real('upload').headerEnd!(ctxOf({ own: { upload }, mayEdit: false }))).toBeNull();
    expect(real('upload').header!(ctxOf({ own: { upload } }))).toBeNull();
    expect(
      real('upload').header!(ctxOf({ own: { upload: { ...upload, uploading: true } } })),
    ).toBeTruthy();
  });

  it('Help is on the rail of a loaded editor only; its panel shows while open', () => {
    const help = { open: false, setOpen: () => {}, close: () => {}, bindings: {} };
    expect(real('help').railProps!(ctxOf({ own: { help } })).help).toMatchObject({
      onOpen: expect.any(Function),
    });
    expect(real('help').railProps!(ctxOf({ own: { help }, ready: false })).help).toBeNull();
    expect(
      railProps(activeFeatures(features, ctxOf({ own: { help } })), ctxOf({ own: { help } })).help,
    ).toBeTruthy();
    expect(real('help').canvasItems![0]!.part(ctxOf({ own: { help } }))).toBeNull();
    expect(
      real('help').canvasItems![0]!.part(ctxOf({ own: { help: { ...help, open: true } } })),
    ).toBeTruthy();
  });

  it('none of these is on before the editor opens, so the EZD-1913a precedence holds', () => {
    const off = activeFeatures(features, ctxOf({ ready: false })).map((f) => f.id);
    for (const id of ['assistant', 'conflicts', 'lock', 'send', 'upload', 'help', 'versions'])
      expect(off, id).not.toContain(id);
  });
});

describe('EZD-1913c AC-EZD-1913c-1 ProjectEditor names none of the moved features', () => {
  const text = fs
    .readFileSync(path.join(__dirname, '..', 'ProjectEditor.tsx'), 'utf8')
    // Import paths name folders (shared/, help/rail-keys for the rail's key text); the names in the code count.
    .replace(/from '[^']*'/g, "from ''");

  it('names neither the Assistant, conflicts, the lock UI, Send, Upload nor Help', () => {
    expect(text).not.toMatch(/assistant/i);
    expect(text).not.toMatch(/conflict/i);
    expect(text).not.toMatch(/\bsend/i);
    expect(text).not.toMatch(/canSend|header-share|\bShare\b/);
    expect(text).not.toMatch(/upload/i);
    expect(text).not.toMatch(/help/i);
    for (const part of [
      'LockPart',
      'lockUi',
      'LockUi',
      'lockLost',
      'holdsLock',
      'lock-ui',
      'part(',
      'adjusting',
      'PreviewLayer',
    ])
      expect(text, part).not.toContain(part);
  });
});
