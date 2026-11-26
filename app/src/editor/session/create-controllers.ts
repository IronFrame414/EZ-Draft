// EZD-1912 (editor consolidation plan 5.2 job 1; AC-EZD-1912-1): builds the editor's controllers for one open
// session and disposes them, moved unchanged out of ProjectEditor. Build order: scale, phase, routed, layers, derived,
// floors, plan, drawing, selection, edit, Assistant loader, versions. Dispose order: versions, Assistant loader,
// drawing detaches selection, edit, selection, scale listener, scale, phase, drawing, plan. The caller disposes the
// session itself after `dispose`.
import { bindingsOf } from '../../lib/defaults/shortcut-keys';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { DEFAULT_PLAN_SCALE, isPlanScale, savePlanScale } from '../../lib/plan/plan-scale';
import { phaseViewOf, savePhaseView } from '../../lib/plan/phase-view';
import type { MessageKey } from '../../server/messages/catalog';
import {
  createAssistantLoader,
  type AssistantLoader,
  type AssistantSessionModule,
} from '../assistant/assistant-loader';
import type { SurfaceSetting } from '../ceiling/surface';
import { createModelDerived, type ModelDerived } from '../derived/model-derived';
import { createEditController, type EditController } from '../edit/edit-controller';
import type { EditorSession } from '../editor-session';
import { createFloorView, type FloorView } from '../floors/floors';
import { createLayerSetting, type LayerSetting } from '../layers/layer-setting';
import { createRoutedStore, type RoutedStore } from '../model/routed-store';
import { openFloorId } from '../plan/batches';
import { createPlanController, type PlanController } from '../plan/controller';
import { createGlyphAtlas } from '../plan/glyph-atlas-canvas';
import type { PlanPointerReceiver } from '../plan/input';
import { createPlanRoot } from '../plan/render-root';
import {
  createSelectionController,
  shareReceiver,
  type SelectionController,
} from '../selection/selection-controller';
import { createPhaseSetting, type PhaseSetting } from '../status/phase-setting';
import { createScaleSetting, deviceSnapSettings, type ScaleSetting } from '../status/view-settings';
import { ceilingAware, receiverRouter } from '../tools/beam-tool';
import type { DrawingController } from '../tools/drawing-controller';
import { createDrawingShell } from '../tools/drawing-shell';
import { newObjectId } from '../tools/model-changes';
import { createVersionView, type VersionView } from '../versions/version-view';

// EZD-423 (11 Budgets editor download size): the drawing engine behind the entry's drawing shell.
const drawingEngine = lazyModule(() => import('../../lazy/drawing-engine'));

export type EditorControllers = {
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
  routed: RoutedStore;
  versions: VersionView;
  // EZD-505: puts the Beam tool's receiver in front of the drawing and selection receivers.
  toolRoute: (r: PlanPointerReceiver | null) => void;
};

export type CreateControllersDeps = {
  projectId: string;
  session: EditorSession;
  // EZD-505: selection leaves ceiling items out on Floor.
  surface: SurfaceSetting;
  onMessage: (key: MessageKey) => void;
  // EZD-5604b: the Assistant session loads with the panel's lazy module on the first press.
  loadAssistant: () => Promise<AssistantSessionModule>;
};

export function createControllers({
  projectId,
  session,
  surface,
  onMessage,
  loadAssistant,
}: CreateControllersDeps): { controllers: EditorControllers; dispose: () => void } {
  const loaded = session.model.project.planScale;
  const scale = createScaleSetting({
    scale: isPlanScale(loaded) ? loaded : DEFAULT_PLAN_SCALE,
    canEdit: session.model.viewer.canEdit,
    save: (s) => savePlanScale(projectId, s),
  });
  // EZD-214 (03 Q-0664): the View starts from the project's phase_default; a view-only switch saves nothing.
  const phase = createPhaseSetting({
    view: phaseViewOf(session.model.project.phaseDefault),
    canEdit: session.model.viewer.canEdit,
    save: (v) => savePhaseView(projectId, v),
  });
  // EZD-5605 D-Who gets which store: the canvas and the editing controllers use the routed store, which is
  // the model store except while an Assistant preview is adjusted.
  const routed = createRoutedStore(session.store);
  const layers = createLayerSetting(phase);
  const derived = createModelDerived(routed);
  const floors = createFloorView();
  const plan = createPlanController(
    { store: routed, scale: scale.get(), phase: layers, derived, floors },
    { createRoot: createPlanRoot, createAtlas: createGlyphAtlas },
  );
  const router = receiverRouter(plan.handle.setPointerReceiver);
  const slots = shareReceiver(router.base);
  const unsubscribeScale = scale.subscribe(() => plan.handle.setScale(scale.get()));
  // EZD-222: the tools read the company key map on every key, so a resync applies at once.
  const shortcutKeys = () => bindingsOf(session.defaults.get()['keyboard_shortcuts']);
  // EZD-423: the drawing engine loads on the first input in the page or the first tool asked for.
  const drawing = createDrawingShell(
    {
      handle: { ...plan.handle, setPointerReceiver: slots.drawing },
      store: routed,
      viewer: session.model.viewer,
      onMessage,
      snapSettings: () => deviceSnapSettings.get(),
      phase,
      ipadDrawing: () => session.model.viewer.ipadDrawing ?? 'finger',
      floors,
      keys: shortcutKeys,
    },
    { load: () => drawingEngine.load(), inputs: window },
  );
  const selection = createSelectionController({
    handle: plan.handle,
    store: routed,
    drawing,
    setReceiver: slots.selection,
    claim: drawing.claimSelectPointer,
    phase: ceilingAware(layers.selectable, surface),
    floors,
    keys: shortcutKeys,
  });
  drawing.attachSelection(selection);
  const edit = createEditController({
    store: routed,
    selection,
    drawing,
    handle: plan.handle,
    canEdit: session.model.viewer.canEdit,
    newStatus: () => phase.newObjectStatus(),
    floors,
    keys: shortcutKeys,
  });
  // EZD-5603a Decided "Editor wiring": one Assistant session per page load, editors only. Made after the
  // controllers, which read Adjust through it.
  const sync = session.sync;
  const assistant: AssistantLoader | null =
    sync === null
      ? null
      : createAssistantLoader(
          {
            projectId,
            sync,
            getFloorId: () => openFloorId(session.store.getState().objects, floors.getState().chosenId),
            getSelectedIds: () => selection.getUi().ids,
            getNewStatus: () => phase.newObjectStatus(),
            // EZD-5604b D-Editor: the preview watches the open model store; nothing in it is saved.
            preview: {
              model: session.store,
              newId: newObjectId,
              adjust: {
                routed,
                selection,
                drawing,
                lockEpoch: session.model.lockEpoch,
                onMessage,
              },
            },
          },
          loadAssistant,
        );
  // EZD-122: a version open read-only points the routed store at its objects.
  const versions = createVersionView({
    projectId,
    routed,
    base: session.store,
    reset: () => {
      drawing.selectTool(null);
      selection.clear();
    },
  });
  const dispose = () => {
    versions.dispose();
    assistant?.dispose();
    drawing.attachSelection(null);
    edit.dispose();
    selection.dispose();
    unsubscribeScale();
    scale.dispose();
    phase.dispose();
    drawing.dispose();
    plan.dispose();
  };
  return {
    controllers: {
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
      routed,
      versions,
      toolRoute: router.tool,
    },
    dispose,
  };
}
