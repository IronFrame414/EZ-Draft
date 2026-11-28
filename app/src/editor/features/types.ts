// EZD-1910 (editor plan 5.3 "features plug in"): the shape of one editor feature. A feature is a file
// `features/<name>.tsx` exporting `feature: EditorFeature`; `index.generated.ts` lists every such file
// (app/tools/gen-registry.mjs). The page maps the slots from the list (EZD-1913a on), so a new feature touches no
// shared file. Nothing a feature file imports statically may come from app/src/lazy/ (EZD-120c B11): its slots load
// their lazy parts through shared/lazy-part.tsx.
import type { ReactNode } from 'react';
import type { EditorHeaderProps } from '../../components/shell/EditorHeader';
import type { EditorView } from '../../components/shell/editor-views';
import type { ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import type { MessageKey } from '../../server/messages/catalog';
import type { EditorSession } from '../editor-session';
import type { FloorView } from '../floors/floors';
import type { InspectorPanelProps } from '../inspector/InspectorPanel';
import type { LeftPanelProps } from '../layers/LeftPanel';
import type { DevHookParts } from '../dev-hooks';
import type { DrawingRailProps } from '../tools/DrawingRail';
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

/**
 * EZD-1913c: the editor page's props that only features read (the page decides them; the routes check again):
 * - EZD-299 (Q-0511 a): `?conflicts=open` opens the conflict list at start;
 * - EZD-111: the viewer holds Send to client for this project;
 * - EZD-1991 (Q-0813; Settings > Title block "Open Sheets"): `?view=sheets` opens the editor on its Sheets screen.
 */
export type FeatureProps = {
  readonly conflictsOpen?: boolean;
  readonly canSend?: boolean;
  readonly initialView?: 'sheets';
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
  /** EZD-1913b: what each feature's `usePage` returned this render, by feature id (EZD-1913c: and its `useOwn`). */
  readonly own?: ReadonlyMap<string, unknown>;
  /** EZD-1913c: the page's props that features read. */
  readonly props?: FeatureProps;
  /** EZD-1913c: opens the editor again (Retry): a new session and store, so undo is cleared. Only sets state. */
  readonly reopen?: () => void;
  /** EZD-1913c: the header tab chosen last (Plan until another is pressed). */
  readonly chosenView?: EditorView;
  /** EZD-1913c: the view on screen: a feature's screen that shows (`screen.shows`), else Plan. */
  readonly shownView?: EditorView;
  /** EZD-1913c: the plan canvas is up and has not failed. */
  readonly planUp?: boolean;
  /** EZD-1913c (EZD-225): the rail shows its tools paused (Edit model without the right to edit now). */
  readonly toolsPaused?: boolean;
};

/** EZD-1913c: a feature whose screen covers the plan when its header tab is chosen (3D, Sheets). */
export type FeatureScreen = {
  /** The header tab. The tabs list Plan, then each feature's `view` in feature order. */
  readonly view: EditorView;
  /** The tab is listed (default: always). */
  readonly available?: (ctx: EditorFeatureContext) => boolean;
  /** The screen shows now (its tab chosen and its inputs there). */
  readonly shows: (ctx: EditorFeatureContext) => boolean;
  /** While it shows, the plan canvas stays mounted but is not shown (EZD-702a). */
  readonly hidesPlan?: boolean;
};

/** EZD-1913c: the header props a feature fills. */
export type FeatureHeaderProps = Partial<
  Pick<EditorHeaderProps, 'onProjectMenu' | 'presence' | 'stopEditing' | 'share'>
>;

/** EZD-1913c: the rail props a feature fills (the Assistant toggle, Help). */
export type FeatureRailProps = Partial<Pick<DrawingRailProps, 'assistant' | 'help'>>;

/** EZD-1913c: what a feature gives the dev and test hooks (dev-hooks.ts installs them; their names stay). */
export type FeatureDevParts = Partial<Pick<DevHookParts, 'scene3d' | 'show3d' | 'scene3dLoaded'>>;

/** EZD-1913c: one item of an ordered list (the state column, the canvas's end), at its own place. */
export type FeatureItem = { readonly order: number; readonly part: Slot };

/** EZD-1913b: the left panel props a feature fills (the Floor / Ceiling / Both segment, the ceiling and electrical sections). */
export type FeatureLeftPanelProps = Partial<
  Pick<LeftPanelProps, 'surface' | 'ceiling' | 'electrical' | 'tab' | 'onTab' | 'versions'>
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
  /**
   * EZD-1913c: run on every render for every listed feature, before every `usePage`, in list order; for the state the
   * editor's own decisions read (`pausesEdits`, `limitsTools`, `quietsSaveBanners`), so it may not read
   * `ctx.mayEdit` (worked out from it). What it returns is `ctx.own.get(id)` for the page hooks and the slots.
   */
  readonly useOwn?: (ctx: EditorFeatureContext) => unknown;
  /** EZD-1913c: while true, nothing may be edited now (`mayEdit` is false): a version shows, the edit lock was lost. */
  readonly pausesEdits?: (ctx: EditorFeatureContext) => boolean;
  /** EZD-1913c (EZD-5605 Adjust): while true, only Select is on the rail, no edit menu opens, the clipboard is off. */
  readonly limitsTools?: (ctx: EditorFeatureContext) => boolean;
  /** EZD-1913c (EZD-299 D-Editor): while true, the save-failed, scale-failed and phase-failed banners are not shown. */
  readonly quietsSaveBanners?: (ctx: EditorFeatureContext) => boolean;
  /** EZD-1913c: drawn in the save-failed banner's place, in its stead (the first active feature's). */
  readonly saveBanner?: Slot;
  /** EZD-1913c: the feature's screen (3D, Sheets) and, while it shows, its parts. */
  readonly screen?: FeatureScreen;
  readonly screenCanvas?: Slot;
  readonly screenLeftPanel?: Slot;
  readonly screenStatusStart?: Slot;
  readonly screenStatusEnd?: Slot;
  /** EZD-1913c: takes the inspector place on every screen (EZD-5603a: an open Assistant). */
  readonly inspectorTop?: Slot;
  /** EZD-1913c: takes the plan's inspector place before every mode's (EZD-122: the version inspector). */
  readonly inspectorOver?: Slot;
  /** EZD-1913c: the header subtitle's middle item, between the client name and the save state (the first one). */
  readonly headerSubtitle?: Slot;
  /** EZD-1913c: the end of the header's review pill group. */
  readonly headerEnd?: Slot;
  /** EZD-1913c: props the feature gives the header. */
  readonly headerProps?: (ctx: EditorFeatureContext) => FeatureHeaderProps;
  /** EZD-1913c: props the feature gives the rail. */
  readonly railProps?: (ctx: EditorFeatureContext) => FeatureRailProps;
  /** EZD-1913c: items of the canvas state column, each at its own order (STATE_ORDER). */
  readonly stateItems?: readonly FeatureItem[];
  /** EZD-1913c: items after the state column on every screen, each at its own order (CANVAS_END_ORDER). */
  readonly canvasItems?: readonly FeatureItem[];
  /** EZD-1913c: what the feature gives the dev hooks. */
  readonly devParts?: (ctx: EditorFeatureContext) => FeatureDevParts;
  /** Installs the feature's dev hook; returns the removal. */
  readonly devHook?: (ctx: EditorFeatureContext) => () => void;
};
