// EZD-1910 (editor plan 5.3 "features plug in"): the shape of one editor feature. A feature is a file
// `features/<name>.tsx` exporting `feature: EditorFeature`; `index.generated.ts` lists every such file
// (app/tools/gen-registry.mjs). The page maps the slots from the list (EZD-1913a on), so a new feature touches no
// shared file. Nothing a feature file imports statically may come from app/src/lazy/ (EZD-120c B11): its slots load
// their lazy parts through shared/lazy-part.tsx.
import type { ReactNode } from 'react';
import type { ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import type { MessageKey } from '../../server/messages/catalog';
import type { EditorSession } from '../editor-session';
import type { FloorView } from '../floors/floors';
import type { InspectorPanelProps } from '../inspector/InspectorPanel';
import type { LeftPanelProps } from '../layers/LeftPanel';
import type { EditorControllers } from '../session/create-controllers';
import type { FeaturePage } from '../shared/feature-page';

/** EZD-1913b: what the plan's features read once the session is open and its controllers are made. */
export type FeatureReady = {
  readonly session: EditorSession;
  readonly controllers: EditorControllers;
  /** The company's key map (EZD-222). */
  readonly bindings: ShortcutBindings;
  /** A touch screen (coarse pointer). */
  readonly coarse: boolean;
  /** The viewer holds Edit model (paused, not hidden, while view only or a version shows). */
  readonly canEditModel: boolean;
  /** EZD-503: the project's Polycam GLB link the page signed; null without one. */
  readonly meshUrl: string | null;
  /** Shows a toast with the message. */
  readonly onMessage: (key: MessageKey) => void;
};

/** What a feature reads to decide whether it is on and what it draws. Later tickets add fields as features need them. */
export type EditorFeatureContext = {
  readonly projectId: string;
  /** EZD-1913a: the rail tool on now; null while none is or the editor is not ready. */
  readonly tool: string | null;
  /** The open session's model store; null while the editor is not ready. */
  readonly store: EditorSession['store'] | null;
  readonly floors: FloorView | undefined;
  /** May edit now: Edit model, holding the lock and the working copy shown (EZD-122, EZD-225). */
  readonly mayEdit: boolean;
  /** The open session's Defaults (read with shared/use-default.ts); null while not ready. */
  readonly defaults: EditorSession['defaults'] | null;
  /** The viewer holds Settings → Defaults (EZD-416 "Change in company settings"). */
  readonly canManageDefaults: boolean;
  /** EZD-1913b: what the plan's features share for the page's life (shared/feature-page.ts); made before the session. */
  readonly page?: FeaturePage;
  /** EZD-1913b: the open session and its controllers; absent while the editor is not ready. */
  readonly ready?: FeatureReady;
  /** EZD-1913b: what each feature's `usePage` returned this render, by feature id. */
  readonly own?: ReadonlyMap<string, unknown>;
};

/** EZD-1913b: the left panel props a feature fills (the Floor / Ceiling / Both segment, the ceiling and electrical sections). */
export type FeatureLeftPanelProps = Partial<
  Pick<LeftPanelProps, 'surface' | 'ceiling' | 'electrical'>
>;

/** EZD-1913b: the selection inspector props a feature fills. */
export type FeatureInspectorProps = Partial<
  Pick<InspectorPanelProps, 'fanClearance' | 'actMinShare' | 'surface' | 'framingDrawing'>
>;

type Slot = (ctx: EditorFeatureContext) => ReactNode;

export type EditorFeature = {
  /** Unique, the file's name. */
  readonly id: string;
  /** Lower first where two active features fill the same slot. */
  readonly order: number;
  readonly active: (ctx: EditorFeatureContext) => boolean;
  readonly leftPanel?: Slot;
  readonly inspector?: Slot;
  readonly overlay?: Slot;
  readonly statusStart?: Slot;
  readonly statusEnd?: Slot;
  readonly header?: Slot;
  /** Rail tool ids the feature adds. */
  readonly rail?: readonly string[];
  /** Key handler: true when the feature used the key. */
  readonly keys?: (event: KeyboardEvent, ctx: EditorFeatureContext) => boolean;
  /** Plan pointer receivers the feature registers, by tool id. */
  readonly receivers?: Readonly<Record<string, unknown>>;
  /** EZD-1913a: while on, the feature's screen covers the plan, so the plan's edit keys and zoom are off (EZD-404). */
  readonly coversPlan?: boolean;
  /** EZD-1913a: a class the rail's wrapper takes while the feature is on (EZD-1986). */
  readonly railClass?: string;
  /** EZD-1913a: run when the feature turns off (it was on in the last render and is not now). */
  readonly leave?: (ctx: EditorFeatureContext) => void;
  /**
   * EZD-1913b: run on every render for every listed feature, on or not, in list order (the list never changes, so the
   * hooks it calls keep their order); for the feature's effects and page state. What it returns is `ctx.own.get(id)`.
   */
  readonly usePage?: (ctx: EditorFeatureContext) => unknown;
  /** EZD-1913b: drawn over the plan under the plan's own layers (after the zoom stack, before the drawing layer). */
  readonly planLayer?: Slot;
  /** EZD-1913b: the last row of the canvas state column, on the plan (EZD-1979: below the edit bar and banners). */
  readonly stateRow?: Slot;
  /** EZD-1913b: status start items, each at its own order, for a feature with more than one. */
  readonly statusStartItems?: readonly { readonly order: number; readonly part: Slot }[];
  /** EZD-1913b: props the feature gives the left panel (Layers, Rooms, Versions). */
  readonly leftPanelProps?: (ctx: EditorFeatureContext) => FeatureLeftPanelProps;
  /** EZD-1913b: props the feature gives the selection inspector. */
  readonly inspectorProps?: (ctx: EditorFeatureContext) => FeatureInspectorProps;
  /** Installs the feature's dev hook; returns the removal. */
  readonly devHook?: (ctx: EditorFeatureContext) => () => void;
};
