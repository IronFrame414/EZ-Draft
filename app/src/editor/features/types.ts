// EZD-1910 (editor plan 5.3 "features plug in"): the shape of one editor feature. A feature is a file
// `features/<name>.tsx` exporting `feature: EditorFeature`; `index.generated.ts` lists every such file
// (app/tools/gen-registry.mjs). The page maps the slots from the list (EZD-1913a on), so a new feature touches no
// shared file. Nothing a feature file imports statically may come from app/src/lazy/ (EZD-120c B11): its slots load
// their lazy parts through shared/lazy-part.tsx.
import type { ReactNode } from 'react';

/** What a feature reads to decide whether it is on and what it draws. Later tickets add fields as features need them. */
export type EditorFeatureContext = {
  readonly projectId: string;
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
  /** Installs the feature's dev hook; returns the removal. */
  readonly devHook?: (ctx: EditorFeatureContext) => () => void;
};
