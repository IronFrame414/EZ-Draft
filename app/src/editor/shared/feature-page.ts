// EZD-1913b (editor plan 5.3 "features plug in"): what the plan's features share for the life of one editor page,
// made once before the session opens (as ProjectEditor made them before Ceiling and Electrical moved into features/):
// - EZD-502 (S05 Entry points; AC-EZD-502-1): the plan's surface (Floor, Ceiling, Both). EZD-505: made before the
//   session so selection can leave ceiling items out on Floor; it outlives a reopen (Revert, Retry).
// - EZD-507: the kind each ceiling device tool places next.
// - EZD-602: where the electrical device toolbar puts its armed item's receiver.
// EZD-1913c: and what the editor's other features pass each other (each was ProjectEditor state before the move):
// - the header tab chosen (EZD-1001a, EZD-702a) and each press of a tab (a press of 3D after a failed load tries again);
// - EZD-121 (Q-0700 05): the newest sent version number from a send or a version.sent broadcast;
// - EZD-717: the newest Rev issued on the Sheets screen; EZD-719: a client send numbered Rev N;
// - EZD-301: an upload from the header (the PDF underlay reads the project's files again);
// - EZD-5604b: what createControllers takes from the page (the surface, the Assistant loader).
import type { EditorView } from '../../components/shell/editor-views';
import type { ToolBase } from '../electrical';
import { createReceiverSlot, type ReceiverSlot } from '../electrical/receiver-slot';
import { createSurfaceSetting, type SurfaceSetting } from '../ceiling/surface';
import type { CreateControllersDeps } from '../session/create-controllers';
import { createDeviceChoice, type DeviceChoice } from '../tools/ceiling-device-tool';
import { assistantPanelModule } from './assistant-module';
import { createListeners, createValueStore, type Listeners, type ValueStore } from './value-store';

export type FeaturePage = {
  readonly surface: SurfaceSetting;
  readonly deviceChoice: DeviceChoice;
  readonly deviceSlot: ReceiverSlot<ToolBase>;
  /** EZD-1913c: the header tab chosen. */
  readonly view: ValueStore<EditorView>;
  /** EZD-1913c: told of every tab press, before the chosen tab changes. */
  readonly viewPressed: Listeners<[EditorView]>;
  /** EZD-1913c: the newest sent version number this page heard of; null until one. */
  readonly sentNo: ValueStore<number | null>;
  /** EZD-1913c: the newest Rev this page saw issued; null until one. */
  readonly issuedNo: ValueStore<number | null>;
  /** EZD-1913c: a client send took this Rev. */
  readonly revSent: Listeners<[number]>;
  /** EZD-1913c: files were uploaded from the header. */
  readonly filesChanged: Listeners;
  /** EZD-1913c: what createControllers takes from the page. */
  readonly controllerDeps: Pick<CreateControllersDeps, 'surface' | 'loadAssistant'>;
};

export function createFeaturePage(initialView: EditorView = 'plan'): FeaturePage {
  const surface = createSurfaceSetting();
  return {
    surface,
    deviceChoice: createDeviceChoice(),
    deviceSlot: createReceiverSlot<ToolBase>(),
    view: createValueStore<EditorView>(initialView),
    viewPressed: createListeners<[EditorView]>(),
    sentNo: createValueStore<number | null>(null),
    issuedNo: createValueStore<number | null>(null),
    revSent: createListeners<[number]>(),
    filesChanged: createListeners(),
    controllerDeps: { surface, loadAssistant: () => assistantPanelModule.load() },
  };
}
