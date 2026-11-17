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
import { EditorFrame } from '../components/shell/EditorFrame';
import { EditorHeader } from '../components/shell/EditorHeader';
import type { EditorView } from '../components/shell/editor-views';
import { HeaderCard } from '../components/shell/HeaderCard';
import { StatusBar } from '../components/shell/StatusBar';
import { Wordmark } from '../components/shell/Wordmark';
import { InlineError } from '../components/states/InlineError';
import { OfflineBanner } from '../components/states/OfflineBanner';
import { Skeleton, SkeletonGroup } from '../components/states/Skeleton';
import { StateButton } from '../components/states/StateButton';
import { useToast } from '../components/states/ToastProvider';
import { countForProject } from '../lib/conflicts/conflict-view';
import { useCoarsePointer } from '../lib/device/useDeviceLayout';
import { useT } from '../lib/messages';
import type { ObjectValue } from '../lib/outbox/model-api';
import { DEFAULT_PLAN_SCALE, isPlanScale, savePlanScale } from '../lib/plan/plan-scale';
import type { MessageKey } from '../server/messages/catalog';
import type { AssistantSession } from './assistant/assistant-session';
import { createAssistantLoader, type AssistantLoader } from './assistant/assistant-loader';
import type { PreviewStore } from './assistant/preview-store';
import { createRoutedStore } from './model/routed-store';
import { newObjectId } from './tools/model-changes';
import { assistantShown } from './assistant/assistant-ui';
import {
  openEditorSession,
  type EditorSession,
  type OpenDeps,
  type OpenResult,
} from './editor-session';
import { hubResync } from './project-defaults';
import { createEditController, type EditController } from './edit/edit-controller';
import { InspectorMore, InspectorStack } from './edit/InspectorMore';
import type { EditMenuRequest, EditMenusProps } from '../lazy/edit-menu';
import { expandGroups } from './selection/groups';
import { EmptyPlanHint } from './EmptyPlanHint';
import type { BenchmarkRunnerProps } from '../lazy/benchmark-runner';
import { InspectorEmpty } from './inspector/InspectorEmpty';
import type { InspectorPanelProps } from '../lazy/inspector-panel';
import type { Change } from './model/patches';
import {
  createPlanController,
  type PlanCanvasHandle,
  type PlanController,
  type PlanStats,
} from './plan/controller';
import { openFloorId } from './plan/batches';
import { createFloorView, type FloorView } from './floors/floors';
import { FloorSwitcher } from './floors/FloorSwitcher';
import { createGlyphAtlas } from './plan/glyph-atlas-canvas';
import { PlanCanvas, PlanInputSurface } from './plan/PlanCanvas';
import { PlanTextFailedBanner } from './plan/PlanTextFailedBanner';
import { createR3fRoot, webglContextsCreated } from './plan/render-root';
import { ZoomStack } from './plan/ZoomStack';
import type { CheckpointOutcome } from './thumbnail/checkpoint';
import type { ConflictPanelProps } from '../lazy/conflict-panel';
import type { ConflictBannerProps } from './conflicts/ConflictBanner';
import { lazyModule, type LazyModule } from '../lib/lazy/lazy-module';
import { useConflictInputs } from './conflicts/use-conflicts';
import { SelectionLayer } from './selection/SelectionLayer';
import type { EditBarProps } from '../lazy/edit-bar';
import type { LockPartName, LockUi } from '../lazy/lock-ui';
import {
  createSelectionController,
  editorRail,
  shareReceiver,
  type SelectionController,
} from './selection/selection-controller';
import { SaveFailedBanner, SaveStateText } from './SaveStatus';
import {
  PhaseFailedBanner,
  PlanScaleFailedBanner,
  PlanStatusEnd,
  PlanStatusStart,
} from './status/PlanStatus';
import { createPhaseSetting, type PhaseSetting } from './status/phase-setting';
import { createLayerSetting, type LayerSetting } from './layers/layer-setting';
import { LeftPanel } from './layers/LeftPanel';
import { createModelDerived, type ModelDerived } from './derived/model-derived';
import { phaseViewOf, savePhaseView } from '../lib/plan/phase-view';
import { createScaleSetting, deviceSnapSettings, type ScaleSetting } from './status/view-settings';
import { createDrawingController, type DrawingController } from './tools/drawing-controller';
import { DrawingLayer, DrawingRail } from './tools/DrawingTools';
import styles from './ProjectEditor.module.css';

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
};

export type EditorTestHook = {
  objects(): Array<{ id: string } & ObjectValue>;
  edit(changes: Change[]): string[];
  checkpoint(): Promise<CheckpointOutcome>;
};

type PlanTestHook = {
  handle: PlanCanvasHandle;
  stats(): PlanStats & { contexts: number };
  // EZD-214: the phase view and the Phase eyes (EZD-218 drives setEye from Layers).
  phase: PhaseSetting;
};

type SelectionTestHook = {
  ids(): string[];
  hoveredId(): string | null;
};

type CanvasState =
  | { kind: 'loading' }
  | Exclude<OpenResult, { kind: 'ready' }>
  | {
      kind: 'ready';
      session: EditorSession;
      plan: PlanController;
      drawing: DrawingController;
      selection: SelectionController;
      edit: EditController;
      scale: ScaleSetting;
      phase: PhaseSetting;
      layers: LayerSetting;
      derived: ModelDerived;
      assistant: AssistantLoader | null;
      floors: FloorView;
    };

const PLAN_VIEWS: EditorView[] = ['plan'];

const noop = () => {};
const noSubscribe = () => noop;

export function ProjectEditor({
  projectId,
  devHooks,
  openDeps,
  onSession,
  conflictsOpen,
  benchmark,
}: ProjectEditorProps): ReactElement {
  const t = useT();
  // EZD-301 (S02 Entry): the Upload files dialog, loaded with the edit menus' lazy module.
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<CanvasState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const [listOpen, setListOpen] = useState(conflictsOpen === true);
  const [menu, setMenu] = useState<EditMenuRequest | null>(null);
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
    void openEditorSession(projectId, {
      resync: hubResync,
      ...openDepsRef.current,
    }).then((result) => {
      if (!live) {
        if (result.kind === 'ready') result.session.dispose();
        return;
      }
      if (result.kind === 'ready') {
        const loaded = result.session.model.project.planScale;
        const scale = createScaleSetting({
          scale: isPlanScale(loaded) ? loaded : DEFAULT_PLAN_SCALE,
          canEdit: result.session.model.viewer.canEdit,
          save: (s) => savePlanScale(projectId, s),
        });
        // EZD-214 (03 Q-0664): the View starts from the project's phase_default; a view-only switch saves nothing.
        const phase = createPhaseSetting({
          view: phaseViewOf(result.session.model.project.phaseDefault),
          canEdit: result.session.model.viewer.canEdit,
          save: (v) => savePhaseView(projectId, v),
        });
        // EZD-5605 D-Who gets which store: the canvas and the editing controllers use the routed store, which is
        // the model store except while an Assistant preview is adjusted.
        const routed = createRoutedStore(result.session.store);
        // The Assistant loader is made after the controllers, which read Adjust through it.
        let assistant: AssistantLoader | null = null;
        const layers = createLayerSetting(phase);
        const derived = createModelDerived(routed);
        const floors = createFloorView();
        const plan = createPlanController(
          { store: routed, scale: scale.get(), phase: layers, derived, floors },
          { createRoot: createR3fRoot, createAtlas: createGlyphAtlas },
        );
        const slots = shareReceiver(plan.handle.setPointerReceiver);
        const unsubscribeScale = scale.subscribe(() => plan.handle.setScale(scale.get()));
        const drawing = createDrawingController({
          handle: { ...plan.handle, setPointerReceiver: slots.drawing },
          store: routed,
          viewer: result.session.model.viewer,
          onMessage: (key) => messageRef.current(key),
          snapSettings: () => deviceSnapSettings.get(),
          phase,
          ipadDrawing: () => result.session.model.viewer.ipadDrawing ?? 'finger',
          floors,
        });
        const selection = createSelectionController({
          handle: plan.handle,
          store: routed,
          drawing,
          setReceiver: slots.selection,
          claim: drawing.claimSelectPointer,
          phase: layers.selectable,
          floors,
        });
        drawing.attachSelection(selection);
        const edit = createEditController({
          store: routed,
          selection,
          drawing,
          handle: plan.handle,
          canEdit: result.session.model.viewer.canEdit,
          newStatus: () => phase.newObjectStatus(),
          floors,
        });
        // EZD-5603a Decided "Editor wiring": one Assistant session per page load, editors only.
        const sync = result.session.sync;
        assistant =
          sync === null
            ? null
            : createAssistantLoader(
                {
                  projectId,
                  sync,
                  getFloorId: () =>
                    openFloorId(result.session.store.getState().objects, floors.getState().chosenId),
                  getSelectedIds: () => selection.getUi().ids,
                  getNewStatus: () => phase.newObjectStatus(),
                  // EZD-5604b D-Editor: the preview watches the open model store; nothing in it is saved.
                  preview: {
                    model: result.session.store,
                    newId: newObjectId,
                    adjust: {
                      routed,
                      selection,
                      drawing,
                      lockEpoch: result.session.model.lockEpoch,
                      onMessage: (key) => messageRef.current(key),
                    },
                  },
                },
                // EZD-5604b: the session loads with the panel's lazy module on the first press.
                () => assistantPanelModule.load(),
              );
        dispose = () => {
          assistant?.dispose();
          drawing.attachSelection(null);
          edit.dispose();
          selection.dispose();
          unsubscribeScale();
          scale.dispose();
          phase.dispose();
          drawing.dispose();
          plan.dispose();
          result.session.dispose();
          onSessionRef.current?.(null);
        };
        onSessionRef.current?.(result.session);
        setState({
          kind: 'ready',
          session: result.session,
          plan,
          drawing,
          selection,
          edit,
          scale,
          phase,
          layers,
          derived,
          assistant,
          floors,
        });
        return;
      }
      setState(result);
    });
    return () => {
      live = false;
      dispose?.();
    };
  }, [projectId, attempt]);

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
  const readPreview = () => assistant?.getPreview() ?? null;
  const readSession = () => assistant?.getSession() ?? null;
  const assistantSession = useSyncExternalStore(
    assistant ? assistant.subscribe : noSubscribe,
    readSession,
    readSession,
  );
  const preview = useSyncExternalStore(
    assistant ? assistant.subscribe : noSubscribe,
    readPreview,
    readPreview,
  );
  // Only `open` is read here, so typing in the panel does not render the whole editor again (11 Performance).
  const readAssistantOpen = () => assistant?.isOpen() ?? false;
  const assistantOpen = useSyncExternalStore(
    assistant ? assistant.subscribe : noSubscribe,
    readAssistantOpen,
    readAssistantOpen,
  );
  const sync = session?.sync ?? null;

  // EZD-5605 D-Wire: Adjust is made by the Assistant session, which tells its listeners when Adjust starts or ends.
  const readAdjusting = () => assistant?.getControls()?.adjust.getUi().adjusting ?? false;
  const adjusting = useSyncExternalStore(
    assistant ? assistant.subscribe : noSubscribe,
    readAdjusting,
    readAdjusting,
  );

  const conflicts = useConflictInputs(session, projectId, listOpen);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  // EZD-126: the lock UI for this session, made once its module is there (at once when it already is). Start
  // editing reopens through `retry`.
  const [lock, setLock] = useState<{ m: typeof import('../lazy/lock-ui'); ui: LockUi } | null>(null);
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

  // D-Editor: each time the list opens (and at start with `conflictsOpen`), the list is read again.
  useEffect(() => {
    if (listOpen && session !== null) void session.conflicts.refresh();
  }, [listOpen, session]);

  useEffect(() => {
    if (session === null || sync === null || plan === null || !devHooks) return;
    const store = session.store;
    const hook: EditorTestHook = {
      objects: () => [...store.getState().objects].map(([id, value]) => ({ id, ...value })),
      edit: (changes) => store.applyEdit(changes),
      checkpoint: async () => {
        await sync.flush();
        const { makeCheckpoint } = await import('./thumbnail/checkpoint');
        return makeCheckpoint({ projectId, capture: () => plan.captureThumbnail() });
      },
    };
    const w = window as unknown as { __ezdraftEditor?: EditorTestHook };
    w.__ezdraftEditor = hook;
    return () => {
      delete w.__ezdraftEditor;
    };
  }, [session, sync, plan, devHooks, projectId]);

  useEffect(() => {
    if (plan === null || phase === null || !devHooks) return;
    const hook: PlanTestHook = {
      handle: plan.handle,
      stats: () => ({ ...plan.stats(), contexts: webglContextsCreated() }),
      phase,
    };
    const w = window as unknown as { __ezdraftPlan?: PlanTestHook };
    w.__ezdraftPlan = hook;
    return () => {
      delete w.__ezdraftPlan;
    };
  }, [plan, phase, devHooks]);

  const menuCanEdit = session?.model.viewer.canEdit ?? false;
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

  useEffect(() => {
    if (selection === null || plan === null || !devHooks) return;
    const hook: SelectionTestHook = {
      ids: () => [...selection.getUi().ids],
      hoveredId: () => plan.handle.getHoveredId(),
    };
    const w = window as unknown as { __ezdraftSelection?: SelectionTestHook };
    w.__ezdraftSelection = hook;
    return () => {
      delete w.__ezdraftSelection;
    };
  }, [selection, plan, devHooks]);

  const workingCopy = t('office.editor.working_copy');
  const clientName = session?.model.project.clientName ?? null;
  const subtitle = useMemo(
    () => [clientName, workingCopy, sync ? <SaveStateText sync={sync} /> : null],
    [clientName, workingCopy, sync],
  );

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
          subtitle={subtitle}
          activeView="plan"
          views={PLAN_VIEWS}
          onViewChange={noop}
          presence={part('presence')}
          stopEditing={part('stop')}
          reviewPill={
            menuCanEdit ? (
              <StateButton
                data-testid="editor-upload-files"
                compact
                onClick={() => setUploading(true)}
              >
                {t('office.upload.editor_button')}
              </StateButton>
            ) : undefined
          }
        />
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
        {showPlan && coarse && selection !== null ? (
          <LazyEditBar selection={selection} edit={edit} clipboardOff={adjusting} />
        ) : null}
        {part('banner')}
        {sync !== null ? (
          <>
            <OfflineBanner message="office.editor.offline" />
            {/* D-Editor: outdated rows exist only while the problem is app_outdated; they say Reload. */}
            {conflicts.outdatedCount > 0 ? null : (part('save') ?? <SaveFailedBanner sync={sync} />)}
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
        {showPlan ? <PlanTextFailedBanner controller={plan} /> : null}
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
  const canEdit = session?.model.viewer.canEdit ?? false;
  const spec = editorRail({
    editor: state.kind,
    canEdit,
    canvasFailed,
    controllerEnabled: drawing?.getUi().enabled ?? false,
  });
  const shown = assistant !== null && assistantShown({ canEdit, view: 'plan' }) ? assistant : null;
  const rail =
    spec === null ? null : (
      <DrawingRail
        drawing={drawing}
        selection={selection}
        // EZD-5605 D-Tools off (Q-0641 row 56-4): during Adjust every rail tool but Select is off, Assistant too.
        rail={adjusting ? { ...spec, only: 'select' } : spec}
        assistant={shown !== null ? { open: assistantOpen, onToggle: shown.toggle } : null}
      />
    );
  const panel =
    session !== null && listOpen ? (
      <LazyConflictPanel
        session={session}
        projectId={projectId}
        inputs={conflicts.inputs}
        server={conflicts.server}
        plan={showPlan ? plan : null}
        onClose={() => setListOpen(false)}
      />
    ) : null;
  const canvas = showPlan ? (
    <>
      <PlanInputSurface controller={plan} />
      <ZoomStack handle={plan.handle} />
      {preview !== null ? <LazyPreviewLayer store={preview} handle={plan.handle} /> : null}
      {drawing !== null ? (
        <DrawingLayer
          controller={drawing}
          handle={plan.handle}
          canEdit={canEdit}
          onCancel={() => (selection !== null ? selection.selectTool() : drawing.selectTool(null))}
        />
      ) : null}
      {selection !== null ? <SelectionLayer selection={selection} edit={edit} /> : null}
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
      {stateArea}
      {panel}
      {part('canvas')}
    </>
  ) : (
    <>
      {stateArea}
      {panel}
      {part('canvas')}
    </>
  );
  // EZD-213b (vault/plans/EZD-213b.md D-Editor): the inspector aside for every viewer of a ready plan.
  const inspector =
    showPlan && session !== null && selection !== null ? (
      <InspectorStack>
        <LazyInspectorPanel
          store={session.store}
          selection={selection}
          canEdit={canEdit}
          drawing={drawing}
          newStatus={phase === null ? undefined : phase.newObjectStatus}
          floors={floors ?? undefined}
        />
        <InspectorMore
          selection={selection}
          canEdit={canEdit}
          onOpen={(at) => setMenu({ kind: 'more', at })}
        />
      </InspectorStack>
    ) : null;
  const leftPanel =
    showPlan && session !== null && selection !== null && layers !== null && plan !== null ? (
      <LeftPanel
        store={session.store}
        layers={layers}
        selection={selection}
        showObject={plan.handle.showObject}
        canEdit={canEdit}
        roomArea={derived?.roomAreaSqFt}
        floors={floors ?? undefined}
      />
    ) : null;
  const openAssistant = shown !== null && assistantOpen ? assistantSession : null;
  const backdrop = showPlan ? (
    <PlanCanvas key={canvasAttempt} controller={plan} onFailed={() => setCanvasFailed(true)} />
  ) : undefined;

  return (
    <DeviceLayout
      full={
        <EditorFrame
          header={
            <>
              {header}
              {uploading ? (
                <LazyUploadFiles projectId={projectId} onClose={() => setUploading(false)} />
              ) : null}
            </>
          }
          rail={rail}
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
                showPlan && scale && phase ? (
                  <>
                    {session !== null && floors !== null ? (
                      <FloorSwitcher store={session.store} floors={floors} canEdit={canEdit} />
                    ) : null}
                    <PlanStatusStart scale={scale} snap={deviceSnapSettings} phase={phase} />
                    {part('status')}
                  </>
                ) : undefined
              }
              end={showPlan ? <PlanStatusEnd handle={plan.handle} /> : undefined}
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

// EZD-126 (11 rule 7): the lock UI loads on the first pointer move or press, or the first edit (not on
// pointerover, which a browser fires when the page changes under a resting mouse).
const lockUiModule = lazyModule(() => import('../lazy/lock-ui'));

// EZD-233: one hook for the lazy parts below. The module loads while `wanted`; nothing shows for the moment it
// downloads, and a failed download is tried again the next time it is wanted.
function useLazy<T>(module: LazyModule<T>, wanted = true): T | undefined {
  const [mod, setMod] = useState(() => module.peek());
  useEffect(() => {
    if (mod || !wanted) return;
    let live = true;
    module.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [module, mod, wanted]);
  return mod;
}

// EZD-5604b (11 Budgets; EZD-120c B11): the Assistant preview layer comes with the panel's lazy module, shown while
// a preview is open.
function LazyPreviewLayer(props: { store: PreviewStore; handle: PlanCanvasHandle }) {
  const open = useSyncExternalStore(
    props.store.subscribe,
    () => props.store.getState().preview !== null,
    () => props.store.getState().preview !== null,
  );
  const mod = useLazy(assistantPanelModule, open);
  return mod ? <mod.PreviewLayer {...props} /> : null;
}

// EZD-214 (11 Budgets; EZD-120c B11): the inspector panel loads on the first press or key in the editor, or when
// something is selected; until then the empty inspector is drawn from the entry.
const inspectorModule = lazyModule(() => import('../lazy/inspector-panel'));

function LazyInspectorPanel(props: InspectorPanelProps) {
  const { selection } = props;
  const selected = useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().ids.length > 0,
    () => false,
  );
  // The first press or key fetches the module without a React commit (11 rule 4: a pan makes no commit).
  useEffect(() => {
    if (inspectorModule.peek() !== undefined) return;
    const on = () => {
      window.removeEventListener('pointerdown', on, true);
      window.removeEventListener('keydown', on, true);
      inspectorModule.load().catch(() => {});
    };
    window.addEventListener('pointerdown', on, true);
    window.addEventListener('keydown', on, true);
    return () => {
      window.removeEventListener('pointerdown', on, true);
      window.removeEventListener('keydown', on, true);
    };
  }, []);
  const mod = useLazy(inspectorModule, selected) ?? inspectorModule.peek();
  const coarse = useCoarsePointer();
  return mod ? <mod.InspectorPanel {...props} /> : <InspectorEmpty coarse={coarse} />;
}

// EZD-233 (11 Budgets): the tablet edit bar loads on touch screens only.
const editBarModule = lazyModule(() => import('../lazy/edit-bar'));

function LazyEditBar(props: EditBarProps) {
  const mod = useLazy(editBarModule);
  return mod ? <mod.EditBar {...props} /> : null;
}

// EZD-233: the menus load when one first opens and then stay, so the Save as group dialog outlives its menu.
const editMenuModule = lazyModule(() => import('../lazy/edit-menu'));

function LazyUploadFiles(props: { projectId: string; onClose: () => void }) {
  const mod = useLazy(editMenuModule);
  return mod ? <mod.UploadFilesDialog {...props} /> : null;
}

function LazyEditMenus(props: EditMenusProps) {
  const mod = useLazy(editMenuModule, props.request !== null);
  return mod ? <mod.EditMenus {...props} /> : null;
}

// EZD-227 Build (11 Budgets; vault/build/assumptions.md EZD-227): the assistant panel loads when first opened, as the
// conflict list does; nothing shows for the moment it downloads, and a failed download is tried again on next open.
const assistantPanelModule = lazyModule(() => import('../lazy/assistant-panel'));

function LazyAssistantPanel(props: { session: AssistantSession; preview: PreviewStore | null }) {
  const mod = useLazy(assistantPanelModule);
  return mod ? <mod.AssistantPanel {...props} /> : null;
}

// EZD-237: the benchmark runner loads only with `?benchmark=run` (the Benchmark card's frame).
const benchmarkRunnerModule = lazyModule(() => import('../lazy/benchmark-runner'));

function LazyBenchmarkRunner(props: BenchmarkRunnerProps) {
  const mod = useLazy(benchmarkRunnerModule);
  return mod ? <mod.BenchmarkRunner {...props} /> : null;
}

// EZD-126 (11 Budgets): the phone and no-access notices and the conflict banner load when shown; a ready desktop
// editor with every change saved shows none of them.
const noticesModule = lazyModule(() => import('../lazy/editor-notices'));

function LazyNotice({
  name,
  ...props
}: { name: 'NoAccess' | 'EditorPhoneNotice' | 'ConflictBanner' } & Partial<ConflictBannerProps>) {
  const mod = useLazy(noticesModule);
  const Notice = mod?.[name] as ((p: typeof props) => ReactNode) | undefined;
  return Notice ? <Notice {...props} /> : null;
}

// Shows nothing until the panel code is there; a failed download is tried again when the list is next opened.
function LazyConflictPanel(props: ConflictPanelProps) {
  const mod = useLazy(conflictPanelModule);
  return mod ? <mod.ConflictPanel {...props} /> : null;
}
