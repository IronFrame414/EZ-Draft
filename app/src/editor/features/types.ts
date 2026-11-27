// EZD-1910 (editor plan 5.3 "features plug in"): the shape of one editor feature. A feature is a file
// `features/<name>.tsx` exporting `feature: EditorFeature`; `index.generated.ts` lists every such file
// (app/tools/gen-registry.mjs). The page maps the slots from the list (EZD-1913a on), so a new feature touches no
// shared file. Nothing a feature file imports statically may come from app/src/lazy/ (EZD-120c B11): its slots load
// their lazy parts through shared/lazy-part.tsx.
import type { ReactNode } from 'react';
import type { EditorSession } from '../editor-session';
import type { FloorView } from '../floors/floors';

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
};

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
  /** Installs the feature's dev hook; returns the removal. */
  readonly devHook?: (ctx: EditorFeatureContext) => () => void;
};
