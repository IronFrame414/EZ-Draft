// EZD-1914 (S05 Controls; editor plan 5.2 job 3, 5.3 "ceiling/tools/"): the shape of one ceiling tool's click
// receiver. A tool is a file `ceiling/tools/<name>.ts` exporting `tool` (made with `defineCeilingTool`);
// `index.generated.ts` lists every such file (app/tools/gen-registry.mjs), so a new ceiling tool touches no shared
// file. Each tool places through a lazy module (11 Budgets): nothing here or in a tool file imports the placement
// code statically. A click before the module arrives loads it and is placed once it has (EZD-222).
import type { LazyModule } from '../../../lib/lazy/lazy-module';
import type { ToolBase } from '../../electrical';
import type { ModelStore } from '../../model/model-store';
import type { PlanPointerReceiver } from '../../plan/input';
import type { DeviceChoice } from '../../tools/ceiling-device-tool';
import type { CeilingToolId, SurfaceSetting } from '../surface';

/** What every ceiling tool is given while the tools are wired (features/ceiling.tsx). */
export type CeilingToolWiring = {
  /** What every ceiling tool places through (EZD-510: held once): the routed store, the floor, status, ids. */
  readonly base: Omit<ToolBase, 'store'> & { readonly store: ModelStore };
  readonly surface: Pick<SurfaceSetting, 'get' | 'subscribe'>;
  /** EZD-507: the kind each device tool places next. */
  readonly deviceChoice: DeviceChoice;
  /** EZD-511: the Defaults "ACT minimum border" as a share of the tile, read at the click. */
  readonly actMinShare: () => number;
};

type ModuleHandle<M> = Pick<LazyModule<M>, 'peek' | 'load'>;

export type CeilingTool<M = unknown> = {
  /** Lower first (the order ProjectEditor wired them in before EZD-1914). */
  readonly order: number;
  /** The rail or panel tool ids this file's receiver serves. */
  readonly tools: readonly CeilingToolId[];
  /** The lazy module the placement code comes with. */
  readonly module: ModuleHandle<M>;
  /**
   * The receiver is made once the module is in and kept for the wiring (a tool drawn over several clicks: zones,
   * outlines, framing lines); otherwise it is made for each event (Beam, the devices), as before EZD-1914.
   */
  readonly keep?: boolean;
  readonly make: (mod: M, tool: CeilingToolId, wiring: CeilingToolWiring) => PlanPointerReceiver;
};

/** One tool's registration, typed by its module. */
export function defineCeilingTool<M>(tool: CeilingTool<M>): CeilingTool {
  return tool as unknown as CeilingTool;
}

/**
 * One tool's receiver over its lazy module: placed at once when the module is in; before that a click loads it and
 * is placed once it has (other events are dropped). `live` is false once the wiring is taken down.
 */
export function lazyReceiver<M>(
  module: ModuleHandle<M>,
  make: (mod: M) => PlanPointerReceiver,
  keep: boolean,
  live: () => boolean,
): PlanPointerReceiver {
  let kept: PlanPointerReceiver | null = null;
  const receiverOf = (mod: M) => {
    if (!keep) return make(mod);
    kept ??= make(mod);
    return kept;
  };
  return (e) => {
    const mod = module.peek();
    if (mod) return receiverOf(mod)(e);
    if (e.kind !== 'click') return;
    module.load().then(
      (m) => {
        if (live()) receiverOf(m)(e);
      },
      () => {},
    );
  };
}

/** Every listed tool's receiver, by tool id. */
export function ceilingReceivers(
  tools: readonly CeilingTool[],
  wiring: CeilingToolWiring,
  live: () => boolean,
): Partial<Record<CeilingToolId, PlanPointerReceiver>> {
  const out: Partial<Record<CeilingToolId, PlanPointerReceiver>> = {};
  for (const t of tools)
    for (const id of t.tools)
      out[id] = lazyReceiver(t.module, (mod) => t.make(mod, id, wiring), t.keep === true, live);
  return out;
}
