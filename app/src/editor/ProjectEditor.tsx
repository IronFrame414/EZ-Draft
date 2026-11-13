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
// EZD-223 (S03 Sketch; Q-0392): the drawing controller reads the viewer's iPad drawing setting from the load.
// EZD-233 (S03 Context menu; Inspector More; vault/build/assumptions.md EZD-233): for an editor, a right-click or long
// press on the plan with no drawing tool on opens the context menu (an object under it that is not selected is
// selected first, with its group); the inspector footer's More opens the More menu. Both load lazily.
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
import { EditorPhoneNotice } from '../components/phone/EditorPhoneNotice';
import { EditorFrame } from '../components/shell/EditorFrame';
import { EditorHeader } from '../components/shell/EditorHeader';
import type { EditorView } from '../components/shell/editor-views';
import { HeaderCard } from '../components/shell/HeaderCard';
import { StatusBar } from '../components/shell/StatusBar';
import { Wordmark } from '../components/shell/Wordmark';
import { InlineError } from '../components/states/InlineError';
import { NoAccess } from '../components/states/NoAccess';
import { OfflineBanner } from '../components/states/OfflineBanner';
import { Skeleton, SkeletonGroup } from '../components/states/Skeleton';
import { useToast } from '../components/states/ToastProvider';
import { countForProject } from '../lib/conflicts/conflict-view';
import { useCoarsePointer } from '../lib/device/useDeviceLayout';
import { useT } from '../lib/messages';
import type { ObjectValue } from '../lib/outbox/model-api';
import { DEFAULT_PLAN_SCALE, isPlanScale, savePlanScale } from '../lib/plan/plan-scale';
import type { MessageKey } from '../server/messages/catalog';
import { createAssistantSession, type AssistantSession } from './assistant/assistant-session';
import { assistantShown } from './assistant/assistant-ui';
import {
  openEditorSession,
  type EditorSession,
  type OpenDeps,
  type OpenResult,
} from './editor-session';
import { createEditController, type EditController } from './edit/edit-controller';
import { InspectorMore, InspectorStack } from './edit/InspectorMore';
import type { EditMenuRequest, EditMenusProps } from '../lazy/edit-menu';
import { expandGroups } from './selection/groups';
import { EmptyPlanHint } from './EmptyPlanHint';
import { InspectorPanel } from './inspector/InspectorPanel';
import type { Change } from './model/patches';
import {
  createPlanController,
  type PlanCanvasHandle,
  type PlanController,
  type PlanStats,
} from './plan/controller';
import { openFloorId } from './plan/batches';
import { createGlyphAtlas } from './plan/glyph-atlas-canvas';
import { PlanCanvas, PlanInputSurface } from './plan/PlanCanvas';
import { PlanTextFailedBanner } from './plan/PlanTextFailedBanner';
import { createR3fRoot, webglContextsCreated } from './plan/render-root';
import { ZoomStack } from './plan/ZoomStack';
import { ConflictBanner } from './conflicts/ConflictBanner';
import type { ConflictPanelProps } from '../lazy/conflict-panel';
import { lazyModule, type LazyModule } from '../lib/lazy/lazy-module';
import { useConflictInputs } from './conflicts/use-conflicts';
import { SelectionLayer } from './selection/SelectionLayer';
import type { EditBarProps } from '../lazy/edit-bar';
import {
  createSelectionController,
  editorRail,
  shareReceiver,
  type SelectionController,
} from './selection/selection-controller';
import { SaveFailedBanner, SaveStateText } from './SaveStatus';
import { PlanScaleFailedBanner, PlanStatusEnd, PlanStatusStart } from './status/PlanStatus';
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
};

export type EditorTestHook = {
  objects(): Array<{ id: string } & ObjectValue>;
  edit(changes: Change[]): string[];
};

type PlanTestHook = {
  handle: PlanCanvasHandle;
  stats(): PlanStats & { contexts: number };
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
      assistant: AssistantSession | null;
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
}: ProjectEditorProps): ReactElement {
  const t = useT();
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
    void openEditorSession(projectId, openDepsRef.current).then((result) => {
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
        const plan = createPlanController(
          { store: result.session.store, scale: scale.get() },
          { createRoot: createR3fRoot, createAtlas: createGlyphAtlas },
        );
        const slots = shareReceiver(plan.handle.setPointerReceiver);
        const unsubscribeScale = scale.subscribe(() => plan.handle.setScale(scale.get()));
        const drawing = createDrawingController({
          handle: { ...plan.handle, setPointerReceiver: slots.drawing },
          store: result.session.store,
          viewer: result.session.model.viewer,
          onMessage: (key) => messageRef.current(key),
          snapSettings: () => deviceSnapSettings.get(),
          ipadDrawing: () => result.session.model.viewer.ipadDrawing ?? 'finger',
        });
        const selection = createSelectionController({
          handle: plan.handle,
          store: result.session.store,
          drawing,
          setReceiver: slots.selection,
          claim: drawing.claimSelectPointer,
        });
        drawing.attachSelection(selection);
        const edit = createEditController({
          store: result.session.store,
          selection,
          drawing,
          handle: plan.handle,
          canEdit: result.session.model.viewer.canEdit,
        });
        // EZD-5603a Decided "Editor wiring": one Assistant session per page load, editors only.
        const sync = result.session.sync;
        const assistant =
          sync === null
            ? null
            : createAssistantSession({
                projectId,
                sync,
                getFloorId: () => openFloorId(result.session.store.getState().objects),
                getSelectedIds: () => selection.getUi().ids,
              });
        dispose = () => {
          assistant?.dispose();
          drawing.attachSelection(null);
          edit.dispose();
          selection.dispose();
          unsubscribeScale();
          scale.dispose();
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
          assistant,
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
  const assistant = state.kind === 'ready' ? state.assistant : null;
  // Only `open` is read here, so typing in the panel does not render the whole editor again (11 Performance).
  const readAssistantOpen = () => assistant?.getUi().open ?? false;
  const assistantOpen = useSyncExternalStore(
    assistant ? assistant.subscribe : noSubscribe,
    readAssistantOpen,
    readAssistantOpen,
  );
  const sync = session?.sync ?? null;
  const conflicts = useConflictInputs(session, projectId, listOpen);

  // D-Editor: each time the list opens (and at start with `conflictsOpen`), the list is read again.
  useEffect(() => {
    if (listOpen && session !== null) void session.conflicts.refresh();
  }, [listOpen, session]);

  useEffect(() => {
    if (session === null || sync === null || !devHooks) return;
    const store = session.store;
    const hook: EditorTestHook = {
      objects: () => [...store.getState().objects].map(([id, value]) => ({ id, ...value })),
      edit: (changes) => store.applyEdit(changes),
    };
    const w = window as unknown as { __ezdraftEditor?: EditorTestHook };
    w.__ezdraftEditor = hook;
    return () => {
      delete w.__ezdraftEditor;
    };
  }, [session, sync, devHooks]);

  useEffect(() => {
    if (plan === null || !devHooks) return;
    const hook: PlanTestHook = {
      handle: plan.handle,
      stats: () => ({ ...plan.stats(), contexts: webglContextsCreated() }),
    };
    const w = window as unknown as { __ezdraftPlan?: PlanTestHook };
    w.__ezdraftPlan = hook;
    return () => {
      delete w.__ezdraftPlan;
    };
  }, [plan, devHooks]);

  const menuCanEdit = session?.model.viewer.canEdit ?? false;
  useEffect(() => {
    if (plan === null || selection === null || drawing === null || session === null) return;
    if (!menuCanEdit) return;
    return plan.handle.onContextMenu((screen, client) => {
      if (drawing.getUi().tool !== null) return false;
      const hit = selection.pickAt(plan.handle.screenToModel(screen))[0];
      if (hit !== undefined) {
        const lower = hit.toLowerCase();
        if (!selection.getUi().ids.some((id) => id.toLowerCase() === lower))
          selection.select(expandGroups(session.store.getState().objects, [hit]));
      }
      setMenu({ kind: 'canvas', at: client });
      return true;
    });
  }, [plan, selection, drawing, session, menuCanEdit]);

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

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

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
        />
        {conflictCount > 0 ? (
          <ConflictBanner
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
    body = <NoAccess />;
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
          <LazyEditBar selection={selection} edit={edit} />
        ) : null}
        {sync !== null ? (
          <>
            <OfflineBanner message="office.editor.offline" />
            {/* D-Editor: outdated rows exist only while the problem is app_outdated; they say Reload. */}
            {conflicts.outdatedCount > 0 ? null : <SaveFailedBanner sync={sync} />}
            {conflicts.outdatedCount > 0 || scale === null ? null : (
              <PlanScaleFailedBanner scale={scale} sync={sync} />
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
        rail={spec}
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
      {drawing !== null ? (
        <DrawingLayer
          controller={drawing}
          handle={plan.handle}
          canEdit={canEdit}
          onCancel={() => (selection !== null ? selection.selectTool() : drawing.selectTool(null))}
        />
      ) : null}
      {selection !== null ? <SelectionLayer selection={selection} edit={edit} /> : null}
      {session !== null ? <EmptyPlanHint store={session.store} canEdit={canEdit} /> : null}
      {session !== null && edit !== null && selection !== null && canEdit ? (
        <LazyEditMenus
          request={menu}
          edit={edit}
          selection={selection}
          store={session.store}
          onClose={closeMenu}
          onMessage={(key) => messageRef.current(key)}
        />
      ) : null}
      {stateArea}
      {panel}
    </>
  ) : (
    <>
      {stateArea}
      {panel}
    </>
  );
  // EZD-213b (vault/plans/EZD-213b.md D-Editor): the inspector aside for every viewer of a ready plan.
  const inspector =
    showPlan && session !== null && selection !== null ? (
      <InspectorStack>
        <InspectorPanel
          store={session.store}
          selection={selection}
          canEdit={canEdit}
          drawing={drawing}
        />
        <InspectorMore
          selection={selection}
          canEdit={canEdit}
          onOpen={(at) => setMenu({ kind: 'more', at })}
        />
      </InspectorStack>
    ) : null;
  const openAssistant = shown !== null && assistantOpen ? shown : null;
  const backdrop = showPlan ? (
    <PlanCanvas key={canvasAttempt} controller={plan} onFailed={() => setCanvasFailed(true)} />
  ) : undefined;

  return (
    <DeviceLayout
      full={
        <EditorFrame
          header={header}
          rail={rail}
          canvas={canvas}
          inspector={
            openAssistant !== null ? (
              <LazyAssistantPanel session={openAssistant} />
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
                showPlan && scale ? (
                  <PlanStatusStart scale={scale} snap={deviceSnapSettings} />
                ) : undefined
              }
              end={showPlan ? <PlanStatusEnd handle={plan.handle} /> : undefined}
            />
          }
          backdrop={backdrop}
        />
      }
      phone={<EditorPhoneNotice />}
    />
  );
}

const conflictPanelModule = lazyModule(() => import('../lazy/conflict-panel'));

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

// EZD-233 (11 Budgets): the tablet edit bar loads on touch screens only.
const editBarModule = lazyModule(() => import('../lazy/edit-bar'));

function LazyEditBar(props: EditBarProps) {
  const mod = useLazy(editBarModule);
  return mod ? <mod.EditBar {...props} /> : null;
}

// EZD-233: the menus load when one first opens and then stay, so the Save as group dialog outlives its menu.
const editMenuModule = lazyModule(() => import('../lazy/edit-menu'));

function LazyEditMenus(props: EditMenusProps) {
  const mod = useLazy(editMenuModule, props.request !== null);
  return mod ? <mod.EditMenus {...props} /> : null;
}

// EZD-227 Build (11 Budgets; vault/build/assumptions.md EZD-227): the assistant panel loads when first opened, as the
// conflict list does; nothing shows for the moment it downloads, and a failed download is tried again on next open.
const assistantPanelModule = lazyModule(() => import('../lazy/assistant-panel'));

function LazyAssistantPanel(props: { session: AssistantSession }) {
  const mod = useLazy(assistantPanelModule);
  return mod ? <mod.AssistantPanel {...props} /> : null;
}

// Shows nothing until the panel code is there; a failed download is tried again when the list is next opened.
function LazyConflictPanel(props: ConflictPanelProps) {
  const mod = useLazy(conflictPanelModule);
  return mod ? <mod.ConflictPanel {...props} /> : null;
}
