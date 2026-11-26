'use client';
// EZD-120c Build step 6 (vault/plans/EZD-120c.md section 3; Decided "Open", "Frame", "Header", "Canvas", "Test
// hook", "Report, dispose"; Q-0500; Q-0214; Q-0501; Q-0505; Q-0506): the editor for one project. The frame has no
// rail, panels or status items yet; the canvas area shows loading, a failed load with Retry, no access, not
// found, or, for an editor, the offline and save-failed banners. The header names the project and, for an editor,
// whether the work is saved.
// EZD-207a Build step 16 (vault/plans/EZD-207a.md Decided "Editor wiring", "Test hook"; Q-0568; Q-0500; Q-0214):
// ready, the plan canvas fills the frame behind the cards and the Plan tab is the one view; a canvas that cannot
// start shows an inline error with Retry.
// EZD-376 Build step 7 (vault/plans/EZD-376.md; Q-0692): ready, a plan whose text atlas failed shows the text-failed banner in the state column, for every viewer.
// EZD-210b Build step 12 (vault/plans/EZD-210b.md Decided "Rail mode", "Editor wiring", "Messages"; Q-0568): the
// drawing rail (disabled while loading, absent without Edit model) and, over the plan, the drawing layer.
// EZD-299 Build step 9 (vault/plans/EZD-299.md Decided D-Editor, D-Banner, D-Show; C9; Q-0511 a): the conflict
// banner under the header card and "Changes not saved" over the canvas; `conflictsOpen` opens the list at start.
// EZD-221b Build step 13 (vault/plans/EZD-221b.md Decided "Empty hint"; S03 States; Q-0591 (a)): a plan with no
// walls shows the draw-walls hint over the canvas, for an editor only.
// EZD-208b Build step 7 (vault/plans/EZD-208b.md section 3; DB1, DB3, DB7, DB11, DB15; Q-0630 rows 9, 28; Q-0633 G9):
// selection for every viewer: the rail from `editorRail` with Select first, the selection layer over the plan, the
// tablet edit bar first in the canvas state column, and `window.__ezdraftSelection` with `devHooks`.
// EZD-219 Build step 15 (vault/plans/EZD-219.md Decided "Editor wiring"; Q-0568; Q-0680 (b)): ready, the status bar
// shows Scale, Snap, Cursor and Zoom; the project's plan scale is held in a ScaleSetting that the plan follows, and
// a failed scale save shows its own "Changes not saved" banner unless the model's shows.
// EZD-217 Build step 8 (vault/plans/EZD-217.md Decided "Editor wiring"): the edit controller (Delete, Copy, Paste,
// Duplicate, Undo, Redo) beside the selection, given to the selection layer and the tablet edit bar.
// EZD-212c (vault/plans/EZD-212c.md D21): the drawing layer's tablet Cancel turns the tool off.
// EZD-5603a Build step 12 (vault/plans/EZD-5603a.md Decided "Editor wiring", "Rail button"): for an editor, one
// Assistant session per page load; its rail toggle opens the Assistant panel in the inspector place.
// EZD-234 Build (11 Budgets editor download size): the conflict list panel loads through lazyModule when first opened.
// EZD-218 (S03 Controls — left panel; AC-EZD-218-1 to -5): the left panel with Layers and Rooms for every viewer of
// a ready plan. The layer store wraps the phase setting: the canvas draws what is shown, and selection picks what
// is shown and not locked; the panel and the plan share one derived-values cache for room areas.
// EZD-223 (S03 Sketch; Q-0392): the drawing controller reads the viewer's iPad drawing setting from the load.
// EZD-233 (S03 Context menu; Inspector More; vault/build/assumptions.md EZD-233): for an editor, a right-click or long
// press on the plan with no drawing tool on opens the context menu (an object under it that is not selected is
// selected first, with its group); the inspector footer's More opens the More menu. Both load lazily.
// EZD-6001 (vault/plans/EZD-6001.md D-Store, D-Wire, D-Mount; Q-0509; Q-0666): one floor view per session, given to
// every controller and panel that reads the open floor; the Floor control is first in the status bar.
// EZD-126 (S06 Controls; 11 rule 7; vault/build/assumptions.md EZD-126): the edit lock UI (banner, holder prompt,
// toasts, Stop editing, View only, presence) loads as one lazy module on the first user input, then draws its
// parts through `LockPart`; until it loads the save-failed banner shows as before.
// EZD-224b Build step 10 (vault/plans/EZD-224b.md Decided "Dev hook"; Q-0681 (a)): `__ezdraftEditor.checkpoint()`
// drains the outbox, then makes a checkpoint with the plan's thumbnail through a lazily loaded module.
// EZD-225 (S03 States; S06:48, 78, 100; Q-0697 decisions 05): Edit model without the lock shows the drawing tools
// paused with the note under the banner; a lock lost mid-session pauses the drawing controller and every edit path
// reads `mayEdit`.
// EZD-404 (S04 Layout; AC-EZD-404-1): while the Cabinets tool is on, the cabinet run screen (lazy) covers the plan
// and the status bar shows its View "Plan + elevation A" before Scale.
// EZD-406 (S04 Layout "Inspector 336px: selected box"): while it is on, the inspector place holds the box inspector
// (lazy, same module), which reads the box selected on the drawing through one small selection store per session.
// EZD-111 (vault/plans/EZD-111.md D-Entry, C2; Q-0700; Q-0701): with Send to client, the header Share button opens
// the Send dialog (lazy). Its no-client link opens Project settings for the session, after the Send dialog closes.
// EZD-304 (S01 PDF: scale calibration; Q-0203): the project's newest calibrated PDF lies under the plan for tracing;
// for an editor, a PDF with no scale shows a banner with Set scale. An upload from the header reads it again.
// EZD-122 (S20 Entry points, Controls; Q-0700 05, 03 "Revert", 10; AC-EZD-122-2 to -10): the Versions tab in the left
// panel (lazy, with the version inspector and the status bar text). The header's version text opens it. A version
// row opens that version read-only (version-view.ts): every edit path reads `mayEdit`, which is false while a version
// shows, so the rail shows the EZD-225 paused state. Revert drains the outbox, posts, then reopens the editor (a new
// store, so undo is cleared); a version.reverted from someone else reopens it too.
// EZD-139 (Q-0220; Q-0700 05; Q-0703): while a version is open, the diff layer outlines what changed since (amber)
// and what was removed since (red dashed) over the canvas, and the status bar shows its counts and Show changes.
// EZD-1401 (11 Offline; S17 Offline status icon; AC-EZD-1401-1): the model load is stored on the device and, with no
// network, answered read-only from that copy (lib/pwa/project-cache.ts); the header shows the offline icon.
// EZD-1001a (phase-10.md EZD-1001a; S07 Data shown, States; 11 rules 4, 6, 7): the 3D tab. Its scene loads as the
// lazy `scene-3d` module on the first press of 3D, is built from the routed store (the model in memory) and kept
// current per changed object, and is drawn into the plan's one renderer (`plan.showScene`), so a tab switch makes no
// WebGL context. Plan's overlays, rail, left panel and inspector are off while 3D shows; the canvas region shows the
// sync footer ("Updating from plan" while the scene loads, then "Model synced with plan") and the empty message.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { DeviceLayout } from '../components/device/DeviceLayout';
import { commandForKey } from '../lib/defaults/shortcut-keys';
import { railToolsWithKeys, shortcutText } from './help/rail-keys';
import { nextRailOrder } from '../components/shell/rail-types';
import { isTypingTarget } from './typed-entry/typed-entry';
import { EditorFrame } from '../components/shell/EditorFrame';
import { EditorHeader } from '../components/shell/EditorHeader';
import { EditorReview } from './review/EditorReview';
import { HeaderButton } from '../components/shell/HeaderButton';
import type { EditorView } from '../components/shell/editor-views';
import { HeaderCard } from '../components/shell/HeaderCard';
import { StatusBar } from '../components/shell/StatusBar';
import { Wordmark } from '../components/shell/Wordmark';
import { InlineError } from '../components/states/InlineError';
import { OfflineBanner } from '../components/states/OfflineBanner';
import { Skeleton, SkeletonGroup } from '../components/states/Skeleton';
import { StateButton } from '../components/states/StateButton';
import { useToast } from '../components/states/ToastProvider';
import { countForProject } from '../lib/conflicts/conflict-groups';
import { useCoarsePointer } from '../lib/device/useDeviceLayout';
import { useT } from '../lib/messages';
import type { MessageKey } from '../server/messages/catalog';
import type { PreviewStore } from './assistant/preview-store';
import { newObjectId } from './tools/model-changes';
import {
  CEILING_DEVICE_TOOL_IDS,
  createDeviceChoice,
  isDeviceTool,
  wireCeilingTools,
  type DeviceChoice,
} from './tools/ceiling-device-tool';
import type { PlanPointerReceiver } from './plan/input';
import { assistantShown } from './assistant/assistant-ui';
import {
  openEditorSession,
  type EditorSession,
  type OpenDeps,
  type OpenResult,
} from './editor-session';
import { hubResync } from './project-defaults';
import { newerVersionNo, versionLabel } from './version-label';
import { hubVersionSent } from './version-sent';
import { InspectorMore, InspectorStack } from './edit/InspectorMore';
import type { EditMenuRequest } from '../lazy/edit-menu';
import { expandGroups } from './selection/groups';
import { EmptyPlanHint } from './EmptyPlanHint';
import { createCountertopSelectionStore } from './countertops/selection-store';
import { createCabinetSelectionStore } from './cabinets/cabinet-selection-store';
import { InspectorEmpty } from './inspector/InspectorEmpty';
import type { InspectorPanelProps } from '../lazy/inspector-panel';
import { chosenFloor } from './floors/floors';
import { FloorSwitcher } from './floors/FloorSwitcher';
import { PlanCanvas, PlanInputSurface } from './plan/PlanCanvas';
import { PlanTextFailedBanner } from './plan/PlanTextFailedBanner';
import { usePdfUnderlay } from './plan/PdfUnderlay';
import { ZoomStack } from './plan/ZoomStack';
import type { ConflictBannerProps } from './conflicts/ConflictBanner';
import { lazyModule } from '../lib/lazy/lazy-module';
import { lazyPart, useLazy } from './shared/lazy-part';
import { useStoreValue } from './shared/use-store-value';
import { editorDefaults, useDefault } from './shared/use-default';
import type { Scene3d } from '../lazy/scene-3d';
import { useConflictInputs } from './conflicts/use-conflicts';
import { SelectionLayer } from './selection/SelectionLayer';
import type { LockPartName, LockUi } from '../lazy/lock-ui';
import { editorRail } from './selection/selection-controller';
import { SaveFailedBanner, SaveStateText } from './SaveStatus';
import { OfflineStatusIcon } from './OfflineStatusIcon';
import { createProjectCache } from '../lib/pwa/project-cache';
import {
  PhaseFailedBanner,
  PlanScaleFailedBanner,
  PlanStatusEnd,
  PlanStatusStart,
} from './status/PlanStatus';
import { LeftPanel, type Tab as LeftTab } from './layers/LeftPanel';
import type { ToolBase } from './electrical';
import { createReceiverSlot } from './electrical/receiver-slot';
import { createSurfaceSetting, type SurfaceSetting } from './ceiling/surface';
import { rcpModule } from './ceiling/rcp-module';
import { useCeilingKeys } from './ceiling/CeilingParts';
import { versionTitle } from './versions/versions-list';
import type { VersionViewState } from './versions/version-view';
import { hubVersionEvents } from './versions/version-events';
import { fetchVersions, postRevert, postSnapshot, type VersionRow } from '../lib/versions/versions';
import { deviceSnapSettings } from './status/view-settings';
import { fixturesModule } from './tools/fixtures-module';
import { DrawingLayer, DrawingRail } from './tools/DrawingTools';
import { CheckPill } from './check/CheckPill';
import { useCodeCheck } from './check/use-code-check';
import { useDevHooks } from './dev-hooks';
import { createControllers, type EditorControllers } from './session/create-controllers';
import styles from './ProjectEditor.module.css';

// EZD-1911: kept here for the code that reads it from ProjectEditor.
export type { EditorTestHook } from './dev-hooks';

// EZD-120d: `openDeps` is passed to openEditorSession (the test page injects a fault into the save); `onSession`
// is told when the session is ready, then null when it is disposed.
export type ProjectEditorProps = {
  projectId: string;
  devHooks: boolean;
  openDeps?: OpenDeps;
  onSession?: (session: EditorSession | null) => void;
  conflictsOpen?: boolean;
  // EZD-237 (vault/plans/EZD-237.md D-Editor): `?benchmark=run`, opened in the Benchmark card's frame.
  benchmark?: boolean;
  // EZD-111: the viewer holds Send to client for this project (the page decides; the route checks again).
  canSend?: boolean;
  // EZD-230 (Q-0038): the user's own rail tool order, read by the page; the default order without it.
  railOrder?: readonly string[];
  // EZD-416: the viewer holds Settings → Defaults (the countertop panel's "Change in company settings" link).
  canManageDefaults?: boolean;
  // EZD-503 (S05 Read heights from scan "Only when a GLB mesh exists for the project"): the project's Polycam GLB
  // link the page signed; absent without one.
  meshUrl?: string | null;
  // EZD-1991 (Q-0813; Settings > Title block "Open Sheets"): `?view=sheets` opens the editor on its Sheets screen.
  initialView?: 'sheets';
};

type CanvasState =
  | { kind: 'loading' }
  | Exclude<OpenResult, { kind: 'ready' }>
  | ({ kind: 'ready'; session: EditorSession } & EditorControllers);

// EZD-702a: the Sheets tab needs no plan canvas, so it shows with the plan alone too.
const PLAN_VIEWS: EditorView[] = ['plan', 'sheets'];
// EZD-1001a: 3D ships, so its tab shows once the plan canvas is up (Q-0500).
const PLAN_3D_VIEWS: EditorView[] = ['plan', '3d', 'sheets'];

const noop = () => {};
const NOT_VIEWING: VersionViewState = {
  viewing: null,
  opening: null,
  failed: false,
  objects: null,
  diff: null,
  showChanges: true,
};

export function ProjectEditor({
  projectId,
  devHooks,
  openDeps,
  onSession,
  conflictsOpen,
  benchmark,
  canSend = false,
  railOrder: initialRailOrder,
  canManageDefaults = false,
  meshUrl = null,
  initialView,
}: ProjectEditorProps): ReactElement {
  const t = useT();
  // EZD-111: the Send dialog, and Project settings opened from its no-client message.
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSettingsOpen, setSendSettingsOpen] = useState(false);
  // EZD-121 (Q-0700 05): the newest sent version number from a send or a version.sent broadcast; the load's
  // number until one arrives.
  const [sentNo, setSentNo] = useState<number | null>(null);
  const onSent = useCallback((n: number) => {
    if (Number.isInteger(n) && n >= 1) setSentNo((cur) => newerVersionNo(cur, n));
  }, []);
  useEffect(() => hubVersionSent(projectId, onSent), [projectId, onSent]);
  // EZD-301 (S02 Entry): the Upload files dialog, loaded with the edit menus' lazy module.
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<CanvasState>({ kind: 'loading' });
  // EZD-502 (S05 Entry points; AC-EZD-502-1): the plan's surface for this page. EZD-505: made before the session so
  // selection can leave ceiling items out on Floor.
  const [surface] = useState(createSurfaceSetting);
  // EZD-507: the kind each ceiling device tool places next.
  const [deviceChoice] = useState(createDeviceChoice);
  // EZD-602: where the electrical device toolbar puts its armed item's receiver.
  const [deviceSlot] = useState(createReceiverSlot<ToolBase>);
  const [attempt, setAttempt] = useState(0);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const [listOpen, setListOpen] = useState(conflictsOpen === true);
  const [menu, setMenu] = useState<EditMenuRequest | null>(null);
  // EZD-1401 (11 Offline): this page's copy of the open project's data, and the header icon's state.
  // One per project, so another project's stored state never shows.
  const projectCache = useMemo(() => createProjectCache(), [projectId]);
  const openDepsRef = useRef(openDeps);
  const onSessionRef = useRef(onSession);
  const messageRef = useRef<(key: MessageKey) => void>(noop);
  const toast = useToast();
  useEffect(() => {
    openDepsRef.current = openDeps;
    onSessionRef.current = onSession;
  });
  useEffect(() => {
    messageRef.current = (key) => toast.show({ message: key });
  }, [toast]);

  useEffect(() => {
    let live = true;
    let dispose: (() => void) | null = null;
    // EZD-116 (AC-EZD-116-8): the session re-reads the defaults on the project channel resync.
    // EZD-1401: the model load goes through the project cache (stored online, read-only from the copy offline).
    const deps = openDepsRef.current;
    void openEditorSession(projectId, {
      resync: hubResync,
      ...deps,
      fetchImpl: projectCache.wrap(deps?.fetchImpl ?? globalThis.fetch.bind(globalThis)),
    }).then((result) => {
      if (!live) {
        if (result.kind === 'ready') result.session.dispose();
        return;
      }
      if (result.kind === 'ready') {
        // EZD-1912: the controllers are built and disposed in session/create-controllers.ts.
        const made = createControllers({
          projectId,
          session: result.session,
          surface,
          onMessage: (key) => messageRef.current(key),
          loadAssistant: () => assistantPanelModule.load(),
        });
        dispose = () => {
          made.dispose();
          result.session.dispose();
          onSessionRef.current?.(null);
        };
        onSessionRef.current?.(result.session);
        setState({ kind: 'ready', session: result.session, ...made.controllers });
        return;
      }
      setState(result);
    });
    return () => {
      live = false;
      dispose?.();
    };
  }, [projectId, attempt, surface, projectCache]);

  const session = state.kind === 'ready' ? state.session : null;
  const plan = state.kind === 'ready' ? state.plan : null;
  const drawing = state.kind === 'ready' ? state.drawing : null;
  const selection = state.kind === 'ready' ? state.selection : null;
  const edit = state.kind === 'ready' ? state.edit : null;
  const coarse = useCoarsePointer();
  const scale = state.kind === 'ready' ? state.scale : null;
  const phase = state.kind === 'ready' ? state.phase : null;
  const layers = state.kind === 'ready' ? state.layers : null;
  const derived = state.kind === 'ready' ? state.derived : null;
  const assistant = state.kind === 'ready' ? state.assistant : null;
  const floors = state.kind === 'ready' ? state.floors : null;
  // EZD-5604b: the session's preview store, made with the first reply that has changes.
  // EZD-1910 (editor plan R3): the store reads below go through useStoreValue (shared/use-store-value.ts).
  const assistantSession = useStoreValue(assistant, (a) => a.getSession(), null);
  const preview = useStoreValue(assistant, (a) => a.getPreview(), null);
  // Only `open` is read here, so typing in the panel does not render the whole editor again (11 Performance).
  const assistantOpen = useStoreValue(assistant, (a) => a.isOpen(), false);
  const sync = session?.sync ?? null;

  // EZD-5605 D-Wire: Adjust is made by the Assistant session, which tells its listeners when Adjust starts or ends.
  const adjusting = useStoreValue(assistant, (a) => a.getControls()?.adjust.getUi().adjusting ?? false, false);

  // EZD-404: the cabinet run screen is shown while the Cabinets tool is on.
  const cabinetsOn = useStoreValue(drawing, (d) => d.getUi().tool === 'cabinets', false);
  // EZD-412 (S04b Entry points "Countertops (K) tool on the rail"): the countertop screen is shown while the
  // Countertops tool is on. Like the cabinet screen it covers the plan, so the plan's edit keys and zoom are off.
  const countertopsOn = useStoreValue(drawing, (d) => d.getUi().tool === 'countertops', false);
  const screenOn = cabinetsOn || countertopsOn;
  // EZD-601 (S06 Entry points "Plan tab, Electrical tool (E)"): electrical mode is on while the Electrical tool is.
  const electricalOn = useStoreValue(drawing, (d) => d.getUi().tool === 'electrical', false);
  // EZD-1985 (Q-0809 (a)): while the Fixtures tool is on, its panel docks in the inspector place, like the
  // Countertops tool's inspector, instead of floating over the plan. The choice is the controller's own object, so the
  // snapshot is stable between renders.
  const fixtureChoice = useStoreValue(
    drawing,
    (d) => (d.getUi().tool === 'fixtures' ? d.getUi().fixtureChoice : null),
    null,
  );
  const sessionStore = session?.store ?? null;
  // A new model session starts with no cabinet selected.
  const cabinetSelection = useMemo(
    () => (sessionStore === null ? null : createCabinetSelectionStore()),
    [sessionStore],
  );
  // EZD-407: the Defaults "Cabinet fit" tolerance for the fit chip, re-read on every defaults resync; null while not
  // set.
  // EZD-1910 (editor plan R12): every Defaults reader below goes through useDefault (shared/use-default.ts).
  const sessionDefaults = session?.defaults ?? null;
  const fitTolerance = useDefault(sessionDefaults, editorDefaults.fitTolerance);
  // EZD-222 (S15d Keyboard shortcuts; phase-02.md EZD-222 "rail and tooltips read bindings"): the company key map,
  // re-read on every defaults resync; the rail's tooltips and the Help list show it.
  const bindings = useDefault(sessionDefaults, editorDefaults.keyboardShortcuts);
  // EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): the user's own tool order, read
  // by the page. A move shows at once and is saved; a failed save shows a toast and the rail keeps the new order for
  // this page.
  const [railOrder, setRailOrder] = useState<readonly string[]>(initialRailOrder ?? []);
  const onRailReorder = useCallback((shown: string[]) => {
    setRailOrder((stored) => {
      const next = nextRailOrder(shown, stored);
      void fetch('/api/profile/rail-order', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: next }),
      })
        .then((r) => r.ok)
        .catch(() => false)
        .then((ok) => {
          if (!ok) messageRef.current('office.rail.order_save_failed');
        });
      return next;
    });
  }, []);
  // EZD-222 (S03 Help): the Help panel, opened by the rail button or the Help key on a loaded editor.
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const helpReady = state.kind === 'ready';
  useEffect(() => {
    if (!helpReady) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (commandForKey(bindings, e) !== 'help') return;
      e.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpReady, bindings]);
  // EZD-612 (S03 Check; S06 Check, Check status pill; 04 Tool rail "Check | Shift+C"): the code check on a loaded
  // editor. It flushes unsaved edits first, so the check reads what is on screen.
  const flushEdits = useCallback(async () => {
    await sync?.flush();
  }, [sync]);
  const codeCheck = useCodeCheck({
    projectId,
    enabled: helpReady,
    store: session?.store ?? null,
    flush: flushEdits,
  });
  const runCheck = codeCheck.runCheck;
  const checkKeyOn = helpReady && codeCheck.canRun;
  useEffect(() => {
    if (!checkKeyOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (commandForKey(bindings, e) !== 'check') return;
      e.preventDefault();
      runCheck();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checkKeyOn, bindings, runCheck]);
  // Go to (S03 "click a warning to zoom to the object"): selects the object and zooms to it; a hidden phase is shown.
  const goToObject = useCallback(
    (id: string) => {
      if (plan === null) return;
      const status = (
        session?.store.getState().objects.get(id)?.data as { status?: string } | undefined
      )?.status;
      if (layers !== null && status !== undefined) {
        const eyes = layers.eyes() as Record<string, boolean>;
        if (eyes[status] === false) layers.setEye(status as never, true);
      }
      selection?.select([id]);
      plan.handle.showObject(id);
    },
    [plan, session, layers, selection],
  );
  const checkObjectName = useCallback(
    (id: string): string | null => {
      const o = session?.store.getState().objects.get(id);
      if (o === undefined) return null;
      const a = (o.data as { attributes?: { name?: unknown; kind?: unknown } }).attributes;
      if (typeof a?.name === 'string' && a.name !== '') return a.name;
      const kind = typeof a?.kind === 'string' ? a.kind : o.type;
      const words = kind.replace(/_/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    },
    [session],
  );
  const checkParts =
    helpReady && (codeCheck.canRun || codeCheck.run !== null) ? (
      <>
        <CheckPill
          run={codeCheck.run}
          changedSinceRun={codeCheck.changedSinceRun}
          onOpen={codeCheck.show}
        />
        {codeCheck.open ? (
          <LazyCheckPanel
            status={codeCheck.status}
            run={codeCheck.run}
            changedSinceRun={codeCheck.changedSinceRun}
            canRun={codeCheck.canRun}
            canAccept={codeCheck.canAccept}
            objectName={checkObjectName}
            onGoTo={goToObject}
            onRun={codeCheck.runCheck}
            onAccept={codeCheck.accept}
            onClose={codeCheck.close}
          />
        ) : null}
      </>
    ) : null;
  // EZD-408: the Defaults "Cabinet auto-fill increment" (per project) for Auto-fill run; null while not read.
  const autoFillIncrement = useDefault(sessionDefaults, editorDefaults.autoFillIncrement);
  // EZD-515 (S05 Validation; S05 Decision 4): the Defaults "Fan blade clearance" for the RCP and the inspector, re-read
  // on every defaults resync; null while Not set (no fan check).
  const fanClearance = useDefault(sessionDefaults, editorDefaults.fanClearance);
  // EZD-511 (S05 Validation "Minimum border is a company setting under Defaults"): the Defaults "ACT minimum border"
  // as a share of the tile, for the RCP, the inspector, the legend and the tools; half a tile while not read.
  const actMinShare = useDefault(sessionDefaults, editorDefaults.actMinShare);
  const actMinShareRef = useRef(actMinShare);
  // EZD-509: the light target per room type, CU and LLF for Auto-layout cans.
  const autoLayoutDefaults = useDefault(sessionDefaults, editorDefaults.autoLayout);
  useEffect(() => {
    actMinShareRef.current = actMinShare;
  }, [actMinShare]);
  // EZD-412, EZD-416, EZD-414: the Defaults the countertop screen, panel and inspector read (per project): Trace's
  // and the presets' overhangs, the countertop increment and the support check (EZD-415). One read of all eight, as
  // text so the snapshot stays the same between changes (one hook instead of eight keeps the editor route within its
  // budget).
  const countertopDefaults = useDefault(sessionDefaults, editorDefaults.countertopDefaults);
  // EZD-416: the countertop selection the screen and its left panel share; a new model session starts with none,
  // and leaving the Countertops tool drops it.
  const countertopSelection = useMemo(
    () => (sessionStore === null ? null : createCountertopSelectionStore()),
    [sessionStore],
  );
  useEffect(() => {
    if (!countertopsOn) countertopSelection?.getState().select(null);
  }, [countertopsOn, countertopSelection]);
  // Leaving the Cabinets tool drops its selection, as the screen's own selection did before EZD-406.
  useEffect(() => {
    if (!cabinetsOn) cabinetSelection?.getState().send({ type: 'set', ids: [] });
  }, [cabinetsOn, cabinetSelection]);

  const conflicts = useConflictInputs(session, projectId, listOpen);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  // EZD-126: the lock UI for this session, made once its module is there (at once when it already is). Start
  // editing reopens through `retry`.
  const [lock, setLock] = useState<{ m: typeof import('../lazy/lock-ui'); ui: LockUi } | null>(
    null,
  );
  useEffect(() => {
    if (session === null || plan === null) return;
    let ui: LockUi | undefined;
    let live = true;
    const start = () => {
      off();
      lockUiModule.load().then((m) => {
        if (!live) return;
        ui = m.createLockUi(session, plan.captureThumbnail, retry, t('office.lock.someone'));
        setLock({ m, ui });
      }, noop);
    };
    // The first edit loads it too (a pan right after an edit then makes no React commit, 11 rule 4).
    const offEdit = session.store.subscribe(start);
    const off = () => {
      offEdit();
      removeEventListener('pointermove', start, true);
      removeEventListener('pointerdown', start, true);
    };
    if (lockUiModule.peek()) start();
    else {
      addEventListener('pointermove', start, true);
      addEventListener('pointerdown', start, true);
    }
    return () => {
      live = false;
      off();
      ui?.dispose();
      setLock(null);
    };
    // `retry` only sets state, so the one from the render that made the session is enough.
  }, [session, plan, t]);
  const part = (name: LockPartName) => lock && <lock.m.LockPart ui={lock.ui} part={name} />;

  // EZD-225 (S03:17, 143; S06:78; vault/build/assumptions.md EZD-126): the lock UI saw the lock leave this viewer
  // (Release, auto release, their other device, or someone else took it). From then on this editor edits nothing:
  // the drawing controller pauses and every edit path below reads `mayEdit`. Start editing reopens the editor.
  const lockLost = useStoreValue(
    lock?.ui.store,
    (l) => {
      const s = l.getState();
      return s.loaded && !s.isHolder;
    },
    false,
  );
  // EZD-122: the Versions tab, its rows and the version open read-only.
  const versionView = state.kind === 'ready' ? state.versions : null;
  const view = useStoreValue(versionView, (v) => v.getState(), NOT_VIEWING);
  const viewing = view.viewing;
  const [leftTab, setLeftTab] = useState<LeftTab>('layers');
  // EZD-502: Ceiling and Both draw through the lazy RCP module, and a switch away from Floor ends any standard tool
  // (the cabinet screen too).
  const shownSurface = useSyncExternalStore(
    surface.subscribe,
    () => surface.get().surface,
    () => surface.get().surface,
  );
  // EZD-508: the RCP module also holds the ceiling legend, status items and fixture schedule (11 Budgets).
  const [rcp, setRcp] = useState(rcpModule.peek);
  useEffect(() => {
    if (plan === null) return;
    if (shownSurface === 'floor') {
      plan.setSurface('floor', null);
      return;
    }
    selection?.selectTool();
    let live = true;
    rcpModule.load().then(
      (m) => {
        if (!live) return;
        setRcp(m);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [plan, selection, shownSurface]);
  // EZD-515: the RCP draws through a builder holding the Defaults fan clearance; a new clearance makes a new builder,
  // so the canvas redraws its flags without ending the tool.
  useEffect(() => {
    if (plan === null || shownSurface === 'floor' || !rcp) return;
    // EZD-510 (11 Budgets): the RCP module shows the view and redraws it as a zone is drawn.
    // EZD-511: and the ACT minimum border the grids balance to.
    return rcp.showRcp(plan, shownSurface, surface, { fanClearance, actMinShare });
  }, [plan, shownSurface, rcp, fanClearance, actMinShare, surface]);
  // EZD-503: Read heights from scan reads the page's GLB link through EZD-303's reader, loaded on the first press.
  const readScan = useMemo(
    () =>
      meshUrl === null
        ? undefined
        : () => import('./ceiling/scan').then((m) => m.readScanCeiling(meshUrl)),
    [meshUrl],
  );
  const ceilingSelect = useCallback(() => selection?.selectTool(), [selection]);
  // EZD-222: the Ceiling view swallows the company's floor tool keys.
  const ceilingKeys = useCallback(() => bindings, [bindings]);
  useCeilingKeys(surface, ceilingSelect, ceilingKeys);
  const [versionRows, setVersionRows] = useState<VersionRow[] | null>(null);
  const [versionsFailed, setVersionsFailed] = useState(false);
  const [reverting, setReverting] = useState(false);
  // The last refusal, for the version it was about.
  const [versionError, setVersionError] = useState<{ id: string; key: MessageKey } | null>(null);
  const refreshVersions = useCallback(() => {
    void fetchVersions(projectId).then((r) => {
      if (r.ok) setVersionRows(r.body);
      setVersionsFailed(!r.ok);
    });
  }, [projectId]);
  // Each time the tab opens, and after a reopen, the list is read again.
  useEffect(() => {
    if (leftTab === 'versions' && session !== null) refreshVersions();
  }, [leftTab, session, refreshVersions]);
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });
  // The id of the version this editor's own revert made: its broadcast is not a reason to reopen again.
  const ownRevert = useRef<string | null>(null);
  useEffect(
    () =>
      hubVersionEvents(projectId, {
        onReverted: (p) => {
          if (p.modelVersionId !== ownRevert.current) retryRef.current();
        },
        onNamed: () => refreshVersions(),
      }),
    [projectId, refreshVersions],
  );

  // May edit now: Edit model and holding the lock (`viewer.canEdit` is the hold at open, editor-session.ts), and the
  // working copy shown (EZD-122).
  const holdsLock = (session?.model.viewer.canEdit ?? false) && !lockLost;
  const mayEdit = holdsLock && viewing === null;
  useEffect(() => {
    if (lockLost) drawing?.pause();
  }, [lockLost, drawing]);
  // EZD-505 (S05 Controls "Beam"): the Beam tool takes the plan's clicks while it is on and editing is allowed.
  const toolRoute = state.kind === 'ready' ? state.toolRoute : null;
  const routedStore = state.kind === 'ready' ? state.routed : null;

  // EZD-1001a: the 3D view. The scene is made on the first press of 3D and kept while the session lasts, so a
  // later switch back to 3D draws it at once; it is dropped with the session.
  const [editorView, setEditorView] = useState<EditorView>(initialView ?? 'plan');
  const [opened3d, setOpened3d] = useState(false);
  const [scene3d, setScene3d] = useState<Scene3d | null>(null);
  const show3d = plan !== null && !canvasFailed && editorView === '3d';
  // EZD-702a (S13 Entry points "Header tab Sheets"): the Sheets screen covers the plan like 3D. Its module and store
  // are made on the first press of Sheets and kept while the editor is open, so the open sheet stays on a return.
  const showSheets = session !== null && editorView === 'sheets';
  const [openedSheets, setOpenedSheets] = useState(initialView === 'sheets');
  const sheetsMod = useLazy(sheetsScreenModule, openedSheets);
  const sheetsScreen = useMemo(
    () => (sheetsMod === undefined ? null : sheetsMod.createSheetsScreen(projectId)),
    [sheetsMod, projectId],
  );
  useEffect(() => {
    if (sheetsScreen !== null) void sheetsScreen.load();
  }, [sheetsScreen]);
  // EZD-702b (AC-EZD-702b-2): the screen draws its open sheet from the model only while Sheets is shown.
  useEffect(() => {
    if (sheetsScreen === null) return;
    sheetsScreen.setModel(routedStore);
    return () => sheetsScreen.setModel(null);
  }, [sheetsScreen, routedStore]);
  useEffect(() => {
    sheetsScreen?.setShown(showSheets);
  }, [sheetsScreen, showSheets]);
  useEffect(
    () => (sheetsScreen === null ? undefined : () => sheetsScreen.dispose()),
    [sheetsScreen],
  );
  const changeView = useCallback((v: EditorView) => {
    if (v === '3d') setOpened3d(true);
    if (v === 'sheets') setOpenedSheets(true);
    if (v === 'plan' || v === '3d' || v === 'sheets') setEditorView(v);
  }, []);
  useEffect(() => {
    if (!opened3d || routedStore === null || phase === null || floors === null) return;
    let live = true;
    let made: Scene3d | null = null;
    scene3dModule.load().then(
      (m) => {
        if (!live) return;
        made = m.createScene3d({ store: routedStore, phase, floors });
        setScene3d(made);
      },
      () => {
        // The footer stays on "Updating from plan"; the next press of 3D tries the load again.
        if (live) setOpened3d(false);
      },
    );
    return () => {
      live = false;
      made?.dispose();
      setScene3d(null);
    };
  }, [opened3d, routedStore, phase, floors]);
  useEffect(() => {
    if (plan === null) return;
    plan.showScene(show3d ? scene3d : null);
  }, [plan, show3d, scene3d]);
  useEffect(() => {
    if (toolRoute === null || routedStore === null || selection === null || phase === null) return;
    // EZD-222 (11 Budgets; EZD-1401 precedent): the placement code comes with the Ceiling view's lazy module, which
    // loads when that view first shows; a click before it arrives is placed once it has.
    let live = true;
    // What every ceiling tool is given (EZD-510: held once, 11 Budgets).
    const base = {
      store: routedStore,
      chosenFloor: () => chosenFloor(floors),
      newStatus: () => phase.newObjectStatus(),
      newId: newObjectId,
      select: (ids: readonly string[]) => selection.select(ids),
      onMessage: (key: MessageKey) => messageRef.current(key),
    };
    // One receiver shape for every lazily placed ceiling tool: placed at once when the module is in; before that a
    // click loads it and is placed once it has.
    const lazily =
      <M,>(
        module: { peek(): M | undefined; load(): Promise<M> },
        make: (mod: M) => PlanPointerReceiver,
      ): PlanPointerReceiver =>
      (e) => {
        const mod = module.peek();
        if (mod) return make(mod)(e);
        if (e.kind !== 'click') return;
        module.load().then(
          (m) => {
            if (live) make(m)(e);
          },
          () => {},
        );
      };
    const receivers: Partial<Record<string, PlanPointerReceiver>> = {
      beam: lazily(beamSpacingModule, (m) => m.beamReceiver(base)),
    };
    // EZD-507: each ceiling device tool places through the lazy RCP module the same way.
    for (const tool of CEILING_DEVICE_TOOL_IDS)
      receivers[tool] = lazily(ceilingDeviceModule, (m) =>
        // EZD-511: a light clicked in an ACT room snaps into a tile.
        m.deviceReceiver({
          ...base,
          tool,
          choice: deviceChoice,
          actMinShare: () => actMinShareRef.current,
        }),
      );
    // EZD-510: the Switching zones tool, turned on from the left panel's Lighting section (shown once the RCP
    // module is in); the tool and its placement come with that module.
    if (rcp) receivers['switch-zone'] = rcp.zoneReceiver(surface, base);
    // EZD-514: the framing line tool, turned on from the inspector's Framing known section.
    if (rcp) receivers['framing-line'] = rcp.framingReceiver(surface, base);
    // EZD-513: the Soffit, tray, coffer and Height and material tag tools, from the same module.
    if (rcp) {
      receivers.soffit = rcp.shapeReceiver(surface, base);
      receivers.tag = rcp.tagReceiver(base);
      // EZD-511: the Acoustical grid tool, from the same module.
      receivers['act-grid'] = rcp.actReceiver({ ...base, minShare: () => actMinShareRef.current });
    }
    // One wire for every ceiling tool, so one tool turning off never clears another's receiver. EZD-602: and, on
    // the floor plan, the electrical device toolbar's armed item.
    deviceSlot.setState({ base });
    const off = wireCeilingTools(surface, toolRoute, receivers, mayEdit, deviceSlot);
    return () => {
      live = false;
      off();
    };
  }, [
    toolRoute,
    routedStore,
    selection,
    phase,
    floors,
    surface,
    mayEdit,
    deviceChoice,
    rcp,
    deviceSlot,
  ]);
  const pdfUnderlay = usePdfUnderlay({ projectId, plan, canEdit: mayEdit });

  // EZD-130: a Project settings save (in the switcher) draws the header again with the new name and client.
  useEffect(() => lock?.ui.switcher.onSaved(() => setLock({ ...lock })), [lock]);

  // D-Editor: each time the list opens (and at start with `conflictsOpen`), the list is read again.
  useEffect(() => {
    if (listOpen && session !== null) void session.conflicts.refresh();
  }, [listOpen, session]);

  // EZD-1911: the dev and test hooks (`__ezdraftEditor`, `__ezdraftPlan`, `__ezdraftSelection`, `__ezdraft3d`).
  useDevHooks({ devHooks, projectId, session, sync, plan, phase, selection, scene3d, show3d });

  const menuCanEdit = mayEdit;
  useEffect(() => {
    if (plan === null || selection === null || drawing === null || session === null) return;
    if (!menuCanEdit) return;
    return plan.handle.onContextMenu((screen, client) => {
      if (drawing.getUi().tool !== null) return false;
      // EZD-5605 (vault/build/assumptions.md): no edit menu while an Assistant preview is adjusted.
      if (adjusting) return true;
      const hit = selection.pickAt(plan.handle.screenToModel(screen))[0];
      if (hit !== undefined) {
        const lower = hit.toLowerCase();
        if (!selection.getUi().ids.some((id) => id.toLowerCase() === lower))
          selection.select(expandGroups(session.store.getState().objects, [hit]));
      }
      setMenu({ kind: 'canvas', at: client });
      return true;
    });
  }, [plan, selection, drawing, session, menuCanEdit, adjusting]);

  const versionNo = newerVersionNo(session?.model.project.versionNo ?? null, sentNo);
  const label = versionLabel({
    lastSent: versionNo === null ? null : { kind: 'version', no: versionNo },
    // EZD-121 text: "Version N" while that sent version is open read-only.
    viewing:
      viewing !== null && viewing.isSent && viewing.versionNo !== null
        ? { kind: 'version', no: viewing.versionNo }
        : null,
  });
  const versionText = t(label.key, label.params);
  const clientName = session?.model.project.clientName ?? null;
  // EZD-122 (S20 Entry points; Q-0700 05): the version text opens the Versions tab.
  const subtitle = useMemo(
    () => [
      clientName,
      <button
        key="version"
        type="button"
        className={styles.versionLink}
        data-testid="editor-version"
        onClick={() => setLeftTab('versions')}
      >
        {versionText}
      </button>,
      sync ? <SaveStateText sync={sync} /> : null,
    ],
    [clientName, versionText, sync],
  );

  // EZD-122 (Q-0700 03 "Revert"): the outbox drains, the route reverts, then the editor reopens with a new store.
  const versionLabelOf = (row: VersionRow): string => {
    const title = versionTitle(row);
    return 'text' in title ? title.text : t(title.key, title.params);
  };
  const revert = async () => {
    if (session === null || viewing === null || reverting) return;
    setReverting(true);
    setVersionError(null);
    try {
      await sync?.flush();
    } catch {
      /* the save-failed banner says it; the route refuses a stale generation */
    }
    // The row as the list has it now (a name given since it was opened included).
    const current = versionRows?.find((row) => row.id === viewing.id) ?? viewing;
    const r = await postRevert(projectId, viewing.id, {
      lockEpoch: session.model.lockEpoch,
      label: versionLabelOf(current),
    });
    setReverting(false);
    if (!r.ok) {
      setVersionError({ id: viewing.id, key: versionErrorKey(r.code) });
      return;
    }
    ownRevert.current = r.body.id;
    retry();
  };
  const nameSnapshot = async (name: string): Promise<string | null> => {
    if (viewing === null) return 'no_version';
    const r = await postSnapshot(projectId, viewing.id, name);
    if (!r.ok) {
      setVersionError({ id: viewing.id, key: versionErrorKey(r.code) });
      return r.code;
    }
    setVersionError(null);
    refreshVersions();
    return null;
  };
  const cleanupAge = session?.defaults.get()['version_cleanup_age'];

  const closeMenu = useCallback(() => setMenu(null), []);

  const conflictCount = countForProject(conflicts.inputs, projectId);
  const header =
    session === null ? (
      <HeaderCard>
        <Wordmark href="/" />
      </HeaderCard>
    ) : (
      <>
        <EditorHeader
          projectsHref="/"
          projectName={session.model.project.name}
          // EZD-128: the name opens the project switcher once the lock UI is there.
          onProjectMenu={lock?.ui.switcher.toggle}
          subtitle={subtitle}
          activeView={show3d ? '3d' : showSheets ? 'sheets' : 'plan'}
          views={plan !== null && !canvasFailed ? PLAN_3D_VIEWS : PLAN_VIEWS}
          onViewChange={changeView}
          presence={part('presence')}
          stopEditing={part('stop')}
          share={
            canSend ? (
              <HeaderButton
                icon="share"
                data-testid="header-share"
                onClick={() => setSendOpen(true)}
              >
                {t('office.header.share')}
              </HeaderButton>
            ) : undefined
          }
          // EZD-127: the review pill (every viewer), then Upload files for an editor (EZD-301).
          reviewPill={
            <>
              {/* EZD-1401 (S17 Offline status icon): on the header's right, as beside the revision badge on the board. */}
              <OfflineStatusIcon
                cache={projectCache}
                projectId={projectId}
                queued={session.queued}
                sync={sync}
              />
              <EditorReview projectId={projectId} />
              {menuCanEdit ? (
                <StateButton
                  data-testid="editor-upload-files"
                  compact
                  onClick={() => setUploading(true)}
                >
                  {t('office.upload.editor_button')}
                </StateButton>
              ) : null}
            </>
          }
        />
        {part('switcher')}
        {sendOpen || sendSettingsOpen ? (
          <LazySend
            projectId={projectId}
            sync={sync}
            sendOpen={sendOpen}
            settings={sendSettingsOpen && lock ? lock.ui.switcher : null}
            onCloseSend={() => setSendOpen(false)}
            onSent={onSent}
            onOpenSettings={() => setSendSettingsOpen(true)}
            onCloseSettings={() => setSendSettingsOpen(false)}
          />
        ) : null}
        {conflictCount > 0 ? (
          <LazyNotice
            name="ConflictBanner"
            count={conflictCount}
            projectName={session.model.project.name}
            othersSaved={conflicts.othersSaved}
            expanded={listOpen}
            onReview={() => setListOpen(true)}
          />
        ) : null}
      </>
    );

  const showPlan = plan !== null && !canvasFailed;
  const canEdit = mayEdit;
  const spec = editorRail({
    editor: state.kind,
    canEdit,
    canEditModel: session?.lock.canEditModel,
    canvasFailed,
    controllerEnabled: drawing?.getUi().enabled ?? false,
  });
  const deviceTools =
    showPlan &&
    electricalOn &&
    shownSurface === 'floor' &&
    session?.lock.canEditModel &&
    selection ? (
      // EZD-602: shown with Edit model, paused (not hidden) in view only or while a version is open.
      <LazyDeviceTools
        slot={deviceSlot}
        paused={!mayEdit}
        handle={plan.handle}
        selection={selection}
      />
    ) : null;
  let body: ReactNode = null;
  if (state.kind === 'loading') {
    body = (
      <SkeletonGroup count={1} className={styles.fill}>
        <Skeleton width="100%" height="100%" radius="lg" />
      </SkeletonGroup>
    );
  } else if (state.kind === 'failed') {
    body = <InlineError message="office.editor.load_failed" onRetry={retry} />;
  } else if (state.kind === 'no-access') {
    body = <LazyNotice name="NoAccess" />;
  } else if (state.kind === 'not-found') {
    body = (
      <p className={styles.notice} data-testid="editor-not-found">
        {t('error.page_not_found')}
      </p>
    );
  } else {
    const retryCanvas = () => {
      setCanvasFailed(false);
      setCanvasAttempt((n) => n + 1);
    };
    body = (
      <>
        {showPlan && !show3d && !showSheets && coarse && selection !== null ? (
          <LazyEditBar
            selection={selection}
            edit={mayEdit && !screenOn ? edit : null}
            clipboardOff={adjusting}
          />
        ) : null}
        {part('banner')}
        {/* EZD-225 (Q-0740 (a), vault/build/assumptions.md EZD-225): the note under the banner. */}
        {spec?.paused !== undefined ? part('paused') : null}
        {sync !== null ? (
          <>
            <OfflineBanner message="office.editor.offline" />
            {/* D-Editor: outdated rows exist only while the problem is app_outdated; they say Reload. */}
            {conflicts.outdatedCount > 0
              ? null
              : (part('save') ?? <SaveFailedBanner sync={sync} />)}
            {conflicts.outdatedCount > 0 || scale === null ? null : (
              <PlanScaleFailedBanner scale={scale} sync={sync} />
            )}
            {conflicts.outdatedCount > 0 || phase === null ? null : (
              <PhaseFailedBanner phase={phase} sync={sync} />
            )}
          </>
        ) : null}
        {canvasFailed ? (
          <InlineError message="office.plan.canvas_failed" onRetry={retryCanvas} />
        ) : null}
        {/* EZD-1001a: plan-only parts are off on the 3D tab. */}
        {showPlan && !show3d && !showSheets ? <PlanTextFailedBanner controller={plan} /> : null}
        {showPlan && !show3d && !showSheets ? pdfUnderlay.part : null}
        {/* EZD-1979 (audit F4): under a coarse pointer the Electrical tool strip is the last row of this column,
            below the edit bar and every banner, so it covers none of them. */}
        {showPlan && !show3d && !showSheets && coarse ? deviceTools : null}
      </>
    );
  }

  const stateArea = (
    <div
      className={showPlan ? `${styles.state} ${styles.besideStack}` : styles.state}
      data-testid="editor-state"
      data-editor-state={state.kind}
    >
      {body}
    </div>
  );
  const shown =
    assistant !== null &&
    assistantShown({ canEdit, view: show3d ? '3d' : showSheets ? 'sheets' : 'plan' })
      ? assistant
      : null;
  // EZD-222: each rail tool shows the company's key for it.
  const railSpec =
    spec === null
      ? null
      : {
          ...spec,
          tools: railToolsWithKeys(spec.tools, bindings),
        };
  const rail =
    railSpec === null ? null : (
      <DrawingRail
        drawing={drawing}
        selection={selection}
        // EZD-5605 D-Tools off (Q-0641 row 56-4): during Adjust every rail tool but Select is off, Assistant too.
        rail={adjusting ? { ...railSpec, only: 'select' } : railSpec}
        assistant={shown !== null ? { open: assistantOpen, onToggle: shown.toggle } : null}
        surface={surface}
        help={
          state.kind === 'ready'
            ? { shortcut: shortcutText(bindings, 'help'), onOpen: () => setHelpOpen(true) }
            : null
        }
        check={checkKeyOn ? { shortcut: shortcutText(bindings, 'check'), onRun: runCheck } : null}
        bindings={bindings}
        order={railOrder}
        onReorder={onRailReorder}
      />
    );
  const panel =
    session !== null && listOpen ? (
      <LazyConflictPanel
        session={session}
        projectId={projectId}
        inputs={conflicts.inputs}
        server={conflicts.server}
        plan={showPlan && !show3d && !showSheets ? plan : null}
        onClose={() => setListOpen(false)}
      />
    ) : null;
  const canvas = showSheets ? (
    <>
      {sheetsScreen && <LazySheets part="canvas" screen={sheetsScreen} />}
      {stateArea}
      {panel}
      {helpOpen ? <LazyHelpPanel bindings={bindings} onClose={closeHelp} /> : null}
      {part('canvas')}
    </>
  ) : show3d ? (
    <>
      {scene3d !== null ? <LazyScene3dOverlay scene={scene3d} /> : null}
      <p className={styles.sync3d} data-testid="scene-3d-sync" role="status">
        {t(scene3d !== null ? 'office.scene3d.synced' : 'office.scene3d.updating')}
      </p>
      {stateArea}
      {panel}
      {helpOpen ? <LazyHelpPanel bindings={bindings} onClose={closeHelp} /> : null}
      {part('canvas')}
    </>
  ) : showPlan ? (
    <>
      <PlanInputSurface controller={plan} />
      {screenOn ? null : <ZoomStack handle={plan.handle} />}
      {shownSurface === 'floor' || rcp === undefined ? null : (
        // EZD-511: with the selected ACT grid's border sizes.
        <rcp.CeilingLegend>
          {session !== null && selection !== null ? (
            <rcp.ActLegend store={session.store} selection={selection} minShare={actMinShare} />
          ) : null}
        </rcp.CeilingLegend>
      )}
      {shownSurface !== 'floor' && mayEdit ? (
        <CeilingDeviceChooser surface={surface} choice={deviceChoice} />
      ) : null}
      {shownSurface !== 'floor' && mayEdit && rcp !== undefined ? (
        // EZD-513: the Soffit, tray, coffer card, shown while that tool is on.
        <rcp.ShapeChooser surface={surface} />
      ) : null}
      {coarse ? null : deviceTools}
      {shownSurface !== 'floor' && selection !== null && routedStore !== null ? (
        <LazyBeamSpacingPill
          store={routedStore}
          selection={selection}
          handle={plan.handle}
          canEdit={canEdit}
        />
      ) : null}
      {preview !== null ? <LazyPreviewLayer store={preview} handle={plan.handle} /> : null}
      {versionView !== null && viewing !== null ? (
        <LazyDiffLayer view={versionView} handle={plan.handle} floors={floors} />
      ) : null}
      {drawing !== null ? (
        <DrawingLayer
          controller={drawing}
          handle={plan.handle}
          canEdit={canEdit}
          onCancel={() => (selection !== null ? selection.selectTool() : drawing.selectTool(null))}
        />
      ) : null}
      {selection !== null ? (
        // EZD-404: under the cabinet screen the plan's edit keys (Delete, copy, paste, undo) are off. EZD-412: and
        // under the countertop screen.
        <SelectionLayer selection={selection} edit={mayEdit && !screenOn ? edit : null} />
      ) : null}
      {session !== null ? (
        <EmptyPlanHint store={session.store} canEdit={canEdit} floors={floors ?? undefined} />
      ) : null}
      {benchmark === true && session !== null && drawing !== null ? (
        <LazyBenchmarkRunner
          plan={plan}
          drawing={drawing}
          store={session.store}
          canEdit={canEdit}
        />
      ) : null}
      {session !== null && edit !== null && selection !== null && canEdit ? (
        <LazyEditMenus
          request={menu}
          edit={edit}
          selection={selection}
          store={session.store}
          onClose={closeMenu}
          onMessage={(key) => messageRef.current(key)}
          floors={floors ?? undefined}
        />
      ) : null}
      {cabinetsOn && session !== null ? (
        // EZD-405: boxes are edited here with Edit model and the lock.
        <LazyCabinetRun
          store={session.store}
          floors={floors ?? undefined}
          canEdit={mayEdit}
          selectionStore={cabinetSelection ?? undefined}
          fitTolerance={fitTolerance}
          autoFillIncrement={autoFillIncrement}
        />
      ) : null}
      {countertopsOn && session !== null ? (
        // EZD-412: tops are traced and drawn here with Edit model and the lock.
        <LazyCountertops
          store={session.store}
          floors={floors ?? undefined}
          canEdit={mayEdit}
          newId={newObjectId}
          defaults={countertopDefaults}
          selection={countertopSelection ?? undefined}
        />
      ) : null}
      {stateArea}
      {panel}
      {checkParts}
      {helpOpen ? <LazyHelpPanel bindings={bindings} onClose={closeHelp} /> : null}
      {part('canvas')}
    </>
  ) : (
    <>
      {stateArea}
      {panel}
      {helpOpen ? <LazyHelpPanel bindings={bindings} onClose={closeHelp} /> : null}
      {part('canvas')}
    </>
  );
  // EZD-213b (vault/plans/EZD-213b.md D-Editor): the inspector aside for every viewer of a ready plan.
  const inspector =
    show3d || showSheets ? null : showPlan && viewing !== null && session !== null ? (
      <LazyVersionInspector
        row={versionRows?.find((r) => r.id === viewing.id) ?? viewing}
        rows={versionRows ?? []}
        canEditModel={session.lock.canEditModel}
        canRevert={holdsLock}
        onName={nameSnapshot}
        onRevert={() => void revert()}
        reverting={reverting}
        error={versionError?.id === viewing.id ? t(versionError.key) : null}
      />
    ) : showPlan && cabinetsOn && session !== null && cabinetSelection !== null ? (
      <LazyCabinetInspector
        store={session.store}
        selectionStore={cabinetSelection}
        floors={floors ?? undefined}
        canEdit={mayEdit}
      />
    ) : showPlan && countertopsOn && session !== null ? (
      // EZD-418 (S04b Layout "Inspector: ... Top schedule"): while the Countertops tool is on, the inspector place
      // holds the countertop inspector: the selected top's piece inspector (EZD-414) above its footer's Top schedule.
      <LazyCountertopsInspector
        store={session.store}
        floors={floors ?? undefined}
        selection={countertopSelection ?? undefined}
        canEdit={mayEdit}
        defaults={countertopDefaults}
        canManageDefaults={canManageDefaults}
      />
    ) : showPlan && drawing !== null && fixtureChoice !== null ? (
      <LazyFixturesPanel choice={fixtureChoice} onChoose={drawing.setFixtureChoice} />
    ) : showPlan && session !== null && selection !== null ? (
      <InspectorStack>
        <LazyInspectorPanel
          store={session.store}
          selection={selection}
          canEdit={canEdit}
          drawing={drawing}
          newStatus={phase === null ? undefined : phase.newObjectStatus}
          floors={floors ?? undefined}
          projectId={projectId}
          fanClearance={fanClearance}
          actMinShare={actMinShare}
          surface={surface}
          framingDrawing={
            shownSurface === 'floor' || !rcp ? undefined : rcp.framingDrawingFor(surface)
          }
        />
        <InspectorMore
          selection={selection}
          canEdit={canEdit}
          onOpen={(at) => setMenu({ kind: 'more', at })}
        />
      </InspectorStack>
    ) : null;
  // EZD-416 (S04b Layout "Left panel: tabs Pieces / Edges / Material"): while the Countertops tool is on, the
  // countertop panel takes the left panel.
  // EZD-403 (S04 Layout "Left panel 248px 'Cabinet library'"): while the Cabinets tool is on, the cabinet library
  // takes the left panel.
  const leftPanel = show3d ? null : showSheets ? (
    sheetsScreen && <LazySheets part="panel" screen={sheetsScreen} canEdit={mayEdit} />
  ) : showPlan && cabinetsOn && session !== null && cabinetSelection !== null ? (
    <LazyCabinetLibrary
      store={session.store}
      floors={floors ?? undefined}
      canEdit={mayEdit}
      selectionStore={cabinetSelection}
      fitTolerance={fitTolerance}
    />
  ) : showPlan && countertopsOn && session !== null && countertopSelection !== null ? (
    <LazyCountertopsPanel
      store={session.store}
      floors={floors ?? undefined}
      canEdit={mayEdit}
      selection={countertopSelection}
      defaults={countertopDefaults}
      canManageDefaults={canManageDefaults}
    />
  ) : showPlan && session !== null && selection !== null && layers !== null && plan !== null ? (
    <LeftPanel
      store={session.store}
      layers={layers}
      selection={selection}
      showObject={plan.handle.showObject}
      canEdit={canEdit}
      roomArea={derived?.roomAreaSqFt}
      floors={floors ?? undefined}
      projectId={projectId}
      tab={leftTab}
      onTab={setLeftTab}
      surface={surface}
      ceiling={
        rcp === undefined ? undefined : (
          <>
            <rcp.RoomCeiling
              store={session.store}
              selection={selection}
              floors={floors ?? undefined}
              canEdit={canEdit}
              {...(readScan === undefined ? {} : { readScan })}
            />
            <rcp.Lighting
              surface={surface}
              canEdit={mayEdit}
              // EZD-509: Auto-layout cans, above Switching zones; it places through the routed store like the tools.
              autoLayout={
                routedStore === null || phase === null ? undefined : (
                  <rcp.AutoLayout
                    store={routedStore}
                    selection={selection}
                    floors={floors ?? undefined}
                    surface={surface}
                    canEdit={mayEdit}
                    defaults={autoLayoutDefaults}
                    newId={newObjectId}
                    newStatus={() => phase.newObjectStatus()}
                    actMinShare={actMinShare}
                  />
                )
              }
            />
            <rcp.FixtureSchedule
              store={session.store}
              floors={floors ?? undefined}
              onPick={(ids) => selection.select(ids)}
            />
          </>
        )
      }
      electrical={
        electricalOn ? (
          <LazyElectricalPanel
            store={session.store}
            selection={selection}
            showObject={plan.handle.showObject}
            layers={layers}
            floors={floors ?? undefined}
            // EZD-604: New circuit, rename and the circuit fields with Edit model, paused while view only.
            // EZD-606: the project the Existing panel dialog reads panel photos for.
            edit={
              session.lock.canEditModel
                ? { slot: deviceSlot, paused: !mayEdit, projectId }
                : undefined
            }
          />
        ) : undefined
      }
      versions={
        versionView !== null ? (
          <LazyVersions
            rows={versionRows}
            failed={versionsFailed}
            openFailed={view.failed}
            viewingId={viewing?.id ?? null}
            openingId={view.opening}
            cleanupAgeDays={typeof cleanupAge === 'number' ? cleanupAge : CLEANUP_AGE_DEFAULT}
            onOpen={(row) => void versionView.open(row)}
            onBack={versionView.back}
          />
        ) : undefined
      }
    />
  ) : null;
  const openAssistant = shown !== null && assistantOpen ? assistantSession : null;
  // EZD-702a: one wrapper on every tab, so a switch to Sheets and back never remounts the plan canvas.
  const backdrop = showPlan ? (
    <div
      className={
        showSheets ? `${styles.backdropLayer} ${styles.backdropHidden}` : styles.backdropLayer
      }
    >
      <PlanCanvas key={canvasAttempt} controller={plan} onFailed={() => setCanvasFailed(true)} />
    </div>
  ) : undefined;

  return (
    <DeviceLayout
      full={
        <EditorFrame
          header={
            <>
              {header}
              {uploading ? (
                <LazyUploadFiles
                  projectId={projectId}
                  onClose={() => {
                    setUploading(false);
                    pdfUnderlay.refresh();
                  }}
                />
              ) : null}
            </>
          }
          rail={
            show3d || showSheets || rail === null ? null : (
              // EZD-1986 (audit F9): while the cabinet library is open the pressed Cabinets tool shows no tooltip,
              // which would sit over the library's rows. The wrapper is always there, so the rail is not remounted
              // (and keeps its focus) when the tool turns on or off; only its class changes.
              <div
                className={
                  cabinetsOn ? `${styles.railWrap} ${styles.cabinetsRail}` : styles.railWrap
                }
              >
                {rail}
              </div>
            )
          }
          leftPanel={leftPanel ?? undefined}
          leftPanelLabel={leftPanel === null ? undefined : 'office.shell.left_panel'}
          canvas={canvas}
          inspector={
            openAssistant !== null ? (
              <LazyAssistantPanel session={openAssistant} preview={preview} />
            ) : (
              (inspector ?? undefined)
            )
          }
          inspectorLabel={
            openAssistant !== null
              ? 'office.assistant.title'
              : inspector === null
                ? undefined
                : 'office.shell.inspector'
          }
          statusBar={
            <StatusBar
              start={
                showSheets ? (
                  sheetsScreen && <LazySheets part="start" screen={sheetsScreen} />
                ) : !show3d && showPlan && scale && phase ? (
                  <>
                    {session !== null && floors !== null ? (
                      <FloorSwitcher store={session.store} floors={floors} canEdit={canEdit} />
                    ) : null}
                    {cabinetsOn && session !== null ? (
                      <LazyCabinetStatus
                        store={session.store}
                        floors={floors ?? undefined}
                        selectionStore={cabinetSelection ?? undefined}
                      />
                    ) : null}
                    {countertopsOn && session !== null ? (
                      <LazyCountertopsStatus
                        store={session.store}
                        floors={floors ?? undefined}
                        defaults={countertopDefaults}
                      />
                    ) : null}
                    {shownSurface === 'floor' || rcp === undefined ? null : (
                      <rcp.CeilingViewStatus />
                    )}
                    {electricalOn && shownSurface === 'floor' && session !== null ? (
                      <LazyElectricalStatus store={session.store} />
                    ) : null}
                    <PlanStatusStart scale={scale} snap={deviceSnapSettings} phase={phase} />
                    {shownSurface === 'floor' || rcp === undefined ? null : (
                      // EZD-514: the text follows the active room's Framing known choice.
                      <rcp.JoistsStatus
                        store={session?.store}
                        selection={selection ?? undefined}
                        floors={floors ?? undefined}
                      />
                    )}
                    {part('status')}
                    {leftTab === 'versions' || viewing !== null ? (
                      <LazyVersionsStatus
                        rows={versionRows}
                        viewing={viewing}
                        onBack={versionView?.back ?? noop}
                        diff={view.diff}
                        showChanges={view.showChanges}
                        onShowChanges={versionView?.setShowChanges ?? noop}
                      />
                    ) : null}
                  </>
                ) : undefined
              }
              end={
                showSheets ? (
                  sheetsScreen && <LazySheets part="end" screen={sheetsScreen} />
                ) : showPlan && !show3d ? (
                  <PlanStatusEnd handle={plan.handle} />
                ) : undefined
              }
            />
          }
          backdrop={backdrop}
        />
      }
      phone={<LazyNotice name="EditorPhoneNotice" />}
    />
  );
}

const conflictPanelModule = lazyModule(() => import('../lazy/conflict-panel'));

// EZD-1910 (editor plan R11, L4): every lazy part below is one `lazyPart` call (shared/lazy-part.tsx); nothing shows
// for the moment a module downloads, and a failed download is tried again the next time the part is wanted.

// EZD-111 (11 Budgets; EZD-120c B11): the Send dialog and the Project settings dialog it opens load when Share is
// first pressed.
const sendDialogModule = lazyModule(() => import('../lazy/send-dialog'));

const LazySend = lazyPart(
  sendDialogModule,
  (
    mod,
    props: {
      projectId: string;
      sync: EditorSession['sync'];
      sendOpen: boolean;
      settings: LockUi['switcher'] | null;
      onCloseSend: () => void;
      onSent: (versionNo: number) => void;
      onOpenSettings: () => void;
      onCloseSettings: () => void;
    },
  ) => {
    const { settings } = props;
    return (
      <>
        {props.sendOpen ? (
          <mod.SendDialog
            projectId={props.projectId}
            sync={props.sync}
            onClose={props.onCloseSend}
            onSent={props.onSent}
            onOpenProjectSettings={props.onOpenSettings}
          />
        ) : null}
        {settings ? (
          <mod.ProjectSettingsDialog
            {...settings.settings()}
            onClose={props.onCloseSettings}
            onSaved={(s) => {
              props.onCloseSettings();
              settings.saved(s);
            }}
          />
        ) : null}
      </>
    );
  },
);

// EZD-126 (11 rule 7): the lock UI loads on the first pointer move or press, or the first edit (not on
// pointerover, which a browser fires when the page changes under a resting mouse).
const lockUiModule = lazyModule(() => import('../lazy/lock-ui'));

// EZD-122 (11 Budgets): the Versions tab, the version inspector and the status text load when the tab first opens.
// EZD-1910: through the lazy facade, so the entry contents check (EZD-120c B11) covers them.
const versionsModule = lazyModule(() => import('../lazy/versions'));

// EZD-601 (11 Budgets editor download size): electrical mode's panel and status items load when it is first on.
// EZD-1910: through the lazy facade, as versions.
const electricalModule = lazyModule(() => import('../lazy/electrical'));

const LazyElectricalPanel = lazyPart(electricalModule, 'ElectricalPanel');
const LazyDeviceTools = lazyPart(electricalModule, 'DeviceTools');
const LazyElectricalStatus = lazyPart(electricalModule, 'ElectricalStatus');

const CLEANUP_AGE_DEFAULT = 30;

function versionErrorKey(code: string): MessageKey {
  switch (code) {
    case 'stale_lock_epoch':
      return 'error.stale_lock_epoch';
    case 'permission_denied':
      return 'error.not_authorized';
    case 'version_not_found':
      return 'error.version_not_found';
    case 'version_not_working':
      return 'error.version_not_working';
    case 'invalid_input':
    case 'invalid_object':
      return 'error.invalid_input';
    default:
      return 'office.versions.action_failed';
  }
}

const LazyVersions = lazyPart(versionsModule, 'VersionsPanel');
const LazyVersionInspector = lazyPart(versionsModule, 'VersionInspector');
const LazyVersionsStatus = lazyPart(versionsModule, 'VersionsStatus');

// EZD-1401 (11 Budgets; EZD-120c B11): the beam spacing pill loads when the Ceiling or Both view first shows.
const beamSpacingModule = lazyModule(() => import('../lazy/beam-spacing'));

// EZD-507 (11 Budgets; EZD-1401 precedent): the ceiling device tools' placement and kind chooser load when a device
// tool is first turned on.
const ceilingDeviceModule = lazyModule(() => import('../lazy/rcp'));

const LazyDeviceChooser = lazyPart(ceilingDeviceModule, 'DeviceChooser');

// EZD-507: the kind chooser of the ceiling device tool that is on.
function CeilingDeviceChooser({
  surface,
  choice,
}: {
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>;
  choice: DeviceChoice;
}) {
  const tool = useSyncExternalStore(
    surface.subscribe,
    () => surface.get().tool,
    () => surface.get().tool,
  );
  const kind = useSyncExternalStore(
    choice.subscribe,
    () => (isDeviceTool(tool) ? choice.get(tool) : null),
    () => (isDeviceTool(tool) ? choice.get(tool) : null),
  );
  if (!isDeviceTool(tool) || kind === null) return null;
  return <LazyDeviceChooser tool={tool} kind={kind} onChoose={(k) => choice.set(tool, k)} />;
}

const LazyBeamSpacingPill = lazyPart(beamSpacingModule, 'BeamSpacingPill');
const LazyDiffLayer = lazyPart(versionsModule, 'DiffLayer');

// EZD-227 Build (11 Budgets; vault/build/assumptions.md EZD-227): the assistant panel loads when first opened, as the
// conflict list does; nothing shows for the moment it downloads, and a failed download is tried again on next open.
const assistantPanelModule = lazyModule(() => import('../lazy/assistant-panel'));

// EZD-5604b (11 Budgets; EZD-120c B11): the Assistant preview layer comes with the panel's lazy module, shown while
// a preview is open.
function usePreviewOpen(props: { store: PreviewStore }) {
  return useSyncExternalStore(
    props.store.subscribe,
    () => props.store.getState().preview !== null,
    () => props.store.getState().preview !== null,
  );
}

const LazyPreviewLayer = lazyPart(assistantPanelModule, 'PreviewLayer', { useWanted: usePreviewOpen });

// EZD-214 (11 Budgets; EZD-120c B11): the inspector panel loads on the first press or key in the editor, or when
// something is selected; until then the empty inspector is drawn from the entry.
const inspectorModule = lazyModule(() => import('../lazy/inspector-panel'));

function useSomethingSelected({ selection }: InspectorPanelProps) {
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().ids.length > 0,
    () => false,
  );
}

function InspectorPlaceholder() {
  return <InspectorEmpty coarse={useCoarsePointer()} />;
}

const LazyInspectorPanel = lazyPart(inspectorModule, 'InspectorPanel', {
  useWanted: useSomethingSelected,
  fallback: InspectorPlaceholder,
  preloadOnFirstInput: true,
});

// EZD-233 (11 Budgets): the tablet edit bar loads on touch screens only.
const editBarModule = lazyModule(() => import('../lazy/edit-bar'));

const LazyEditBar = lazyPart(editBarModule, 'EditBar');

// EZD-233: the menus load when one first opens and then stay, so the Save as group dialog outlives its menu.
const editMenuModule = lazyModule(() => import('../lazy/edit-menu'));

const LazyUploadFiles = lazyPart(editMenuModule, 'UploadFilesDialog');
const LazyEditMenus = lazyPart(editMenuModule, 'EditMenus', {
  useWanted: (props) => props.request !== null,
});

const LazyAssistantPanel = lazyPart(assistantPanelModule, 'AssistantPanel');

// EZD-237: the benchmark runner loads only with `?benchmark=run` (the Benchmark card's frame).
const benchmarkRunnerModule = lazyModule(() => import('../lazy/benchmark-runner'));

// EZD-1001a (11 rule 7): the 3D scene loads on the first press of the 3D tab.
const scene3dModule = lazyModule(() => import('../lazy/scene-3d'));

const LazyScene3dOverlay = lazyPart(scene3dModule, 'Scene3dOverlay');
const LazyBenchmarkRunner = lazyPart(benchmarkRunnerModule, 'BenchmarkRunner');

// EZD-404 (11 Budgets; 11 rule 7): the cabinet run screen loads when the Cabinets tool is first turned on.
const cabinetRunModule = lazyModule(() => import('../lazy/cabinet-run'));

const LazyCabinetRun = lazyPart(cabinetRunModule, 'CabinetRunView');
const LazyCabinetInspector = lazyPart(cabinetRunModule, 'CabinetInspector');
const LazyCabinetLibrary = lazyPart(cabinetRunModule, 'CabinetLibrary');
const LazyCabinetStatus = lazyPart(cabinetRunModule, 'CabinetRunStatus');

// EZD-702a (11 Budgets; 11 rule 7): the Sheets screen loads when the Sheets tab is first pressed.
const sheetsScreenModule = lazyModule(() => import('../lazy/sheets-screen'));

// One part for the panel, canvas and status (EZD-120c B11: the entry's size).
const LazySheets = lazyPart(sheetsScreenModule, 'SheetsPart');

// EZD-412 (11 Budgets; 11 rule 7): the countertop screen loads when the Countertops tool is first turned on.
const countertopsModule = lazyModule(() => import('../lazy/countertops'));

const LazyCountertops = lazyPart(countertopsModule, 'CountertopsView');
// EZD-416: the countertop left panel and status readouts, from the same module.
const LazyCountertopsPanel = lazyPart(countertopsModule, 'CountertopsPanel');
const LazyCountertopsStatus = lazyPart(countertopsModule, 'CountertopsStatus');
// EZD-418: the countertop inspector place (footer Top schedule), from the same module.
const LazyCountertopsInspector = lazyPart(countertopsModule, 'CountertopsInspector');

// EZD-1985 (Q-0809 (a)): the Fixtures panel in the inspector place, from the module the Fixtures tool loads.
const LazyFixturesPanel = lazyPart(fixturesModule, 'FixturesPanel');

// EZD-126 (11 Budgets): the phone and no-access notices and the conflict banner load when shown; a ready desktop
// editor with every change saved shows none of them.
const noticesModule = lazyModule(() => import('../lazy/editor-notices'));

const LazyNotice = lazyPart(
  noticesModule,
  (
    mod,
    {
      name,
      ...props
    }: { name: 'NoAccess' | 'EditorPhoneNotice' | 'ConflictBanner' } & Partial<ConflictBannerProps>,
  ) => {
    const Notice = mod[name] as (p: typeof props) => ReactNode;
    return <Notice {...props} />;
  },
);

// EZD-222 (11 Budgets): the Help panel loads when Help is first opened.
const helpPanelModule = lazyModule(() => import('../lazy/help-panel'));

const LazyHelpPanel = lazyPart(helpPanelModule, 'HelpPanel');

// EZD-612 (11 Budgets): the code check list loads when it is first opened.
const checkPanelModule = lazyModule(() => import('./check/CheckResultsPanel'));

const LazyCheckPanel = lazyPart(checkPanelModule, 'CheckResultsPanel');
const LazyConflictPanel = lazyPart(conflictPanelModule, 'ConflictPanel');
