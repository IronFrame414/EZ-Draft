// EZD-423 (11 Budgets "editor before its lazy parts 500 KB"; 11 rule 7; vault/build/assumptions.md EZD-423): the
// drawing controller the editor entry holds. The drawing engine (`createDrawingController` and every tool's code)
// loads as the drawing-engine lazy module on the first pointer or key input in the page, as the overlay and the lock
// UI do, or when a tool, drag or entry is asked for first. Until it is there the shell answers as the engine does:
// Select is the tool and the gap boxes show; a tool asked for (rail or key) is on at once in the ui, so the rail and
// the typed bar show it, while the plan's presses and every call for the engine are held and handed to it, in order,
// when it loads. After that every call goes straight to the engine, and the ui object stays the same while the
// engine's ui has the same values, so a load during a pan makes no React commit.
import type { Objects } from '../model/patches';
import { chosenFloor } from '../floors/floors';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type {
  DrawingController,
  DrawingDeps,
  DrawingFrame,
  DrawingUi,
  SelectionLink,
  ToolKeyEvent,
} from './drawing-controller';
import { isTypingTarget } from '../typed-entry/typed-entry';
import { gapBoxes } from './gap';
import { toolForKey } from './rail-mode';
import type { DrawingToolId } from './tool-defs';

export type DrawingEngine = { createDrawingController(deps: DrawingDeps): DrawingController };

// The page events that start the engine's load (the same as the overlay's, DrawingTools.tsx).
export const FIRST_INPUT = ['pointermove', 'pointerdown', 'keydown'] as const;

export type ShellOptions = {
  load: () => Promise<DrawingEngine>;
  // The target whose first input starts the load; null starts it only on a call that needs the engine.
  inputs?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
};

const sameBoxes = (a: DrawingUi['boxes'], b: DrawingUi['boxes']) =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

const sameUi = (a: DrawingUi, b: DrawingUi) =>
  a.enabled === b.enabled &&
  a.tool === b.tool &&
  a.pick === b.pick &&
  a.gapMessage === b.gapMessage &&
  a.lastLength === b.lastLength &&
  a.doorTarget === b.doorTarget &&
  a.openingWidth === b.openingWidth &&
  a.entry === b.entry &&
  a.fixtureChoice === b.fixtureChoice &&
  a.utilities === b.utilities &&
  sameBoxes(a.boxes, b.boxes);

// A copy of a key event's fields: a DOM KeyboardEvent keeps them on its prototype, so a spread would lose them.
const copyKey = (e: ToolKeyEvent): ToolKeyEvent => ({
  key: e.key,
  ctrlKey: e.ctrlKey,
  metaKey: e.metaKey,
  altKey: e.altKey,
  shiftKey: e.shiftKey,
  defaultPrevented: e.defaultPrevented,
  target: e.target,
});

export function createDrawingShell(deps: DrawingDeps, opts: ShellOptions): DrawingController {
  const { handle, store, viewer } = deps;
  const floorOf = (o: Objects) => openFloorId(o, chosenFloor(deps.floors));
  // The engine's own rule (drawing-controller.ts "Enabled"): set once, when the controller is made.
  const enabled = viewer.canEdit && floorOf(store.getState().objects) !== null;
  let paused = false;
  const canEdit = () => enabled && !paused;
  let disposed = false;
  let engine: DrawingController | null = null;
  let loading = false;
  let link: SelectionLink | null = null;
  // Calls held for the engine, in order with the plan presses that came while a tool was on before it loaded.
  const pending: Array<(e: DrawingController) => void> = [];
  let holding = false;
  let engineReceiver: PlanPointerReceiver | null = null;

  const uiListeners = new Set<() => void>();
  const frameListeners = new Set<(frame: DrawingFrame | null) => void>();
  let offEngine: Array<() => void> = [];

  const boxesOf = (objects: Objects) => {
    const level = floorOf(objects);
    return level === null ? [] : gapBoxes(objects, level, { canEdit: canEdit(), drawingWallIds: [] });
  };

  // The ui given out: the shell's own before the engine loads, then the engine's whenever its values change.
  let ui: DrawingUi = {
    enabled,
    tool: null,
    pick: null,
    boxes: boxesOf(store.getState().objects),
    gapMessage: null,
    lastLength: null,
    doorTarget: null,
    openingWidth: null,
    entry: null,
    fixtureChoice: null,
    utilities: null,
  };

  const notify = () => {
    for (const l of [...uiListeners]) l();
  };

  // Reads the engine's ui; true when it differs from the one given out.
  const follow = (): boolean => {
    if (engine === null) return false;
    const next = engine.getUi();
    if (next === ui || sameUi(next, ui)) return false;
    ui = next;
    return true;
  };

  const setUi = (patch: Partial<DrawingUi>) => {
    const next = { ...ui, ...patch };
    if (sameUi(next, ui)) return;
    ui = next;
    notify();
  };

  let objects = store.getState().objects;
  const refreshBoxes = () => {
    if (disposed || engine !== null) return;
    const boxes = boxesOf(store.getState().objects);
    if (!sameBoxes(boxes, ui.boxes)) setUi({ boxes });
  };
  const offStore = store.subscribe((state) => {
    if (state.objects === objects) return;
    objects = state.objects;
    refreshBoxes();
  });
  const offFloors = deps.floors === undefined ? () => {} : deps.floors.subscribe(refreshBoxes);

  // A held press goes to whatever receiver the engine has set by then, after the calls made before it.
  const holdReceiver: PlanPointerReceiver = (event: PlanPointerEvent) => {
    pending.push(() => engineReceiver?.(event));
  };
  const stopHolding = () => {
    if (!holding) return;
    holding = false;
    handle.setPointerReceiver(null);
  };

  const offInput = () => {
    for (const name of FIRST_INPUT) opts.inputs?.removeEventListener(name, start, true);
  };

  function begin(mod: DrawingEngine): void {
    if (disposed || engine !== null) return;
    offStore();
    offFloors();
    const e = mod.createDrawingController({
      ...deps,
      handle: {
        ...handle,
        setPointerReceiver: (r) => {
          engineReceiver = r;
          handle.setPointerReceiver(r);
        },
      },
    });
    engine = e;
    if (!enabled) e.pause();
    if (link !== null) e.attachSelection(link);
    if (paused) e.pause();
    for (const call of pending.splice(0)) call(e);
    if (holding) {
      // The engine's receiver replaced the shell's when its tool came on; with no tool on, presses go back to the
      // selection.
      holding = false;
      if (engineReceiver === null) handle.setPointerReceiver(null);
    }
    offEngine = [
      e.subscribe(() => {
        if (follow()) notify();
      }),
      e.onFrame((f) => frameListeners.forEach((l) => l(f))),
    ];
    if (follow()) notify();
    const f = e.getFrame();
    if (f !== null) frameListeners.forEach((l) => l(f));
  }

  function start(): void {
    offInput();
    if (disposed || engine !== null || loading) return;
    loading = true;
    opts.load().then(
      (mod) => {
        loading = false;
        begin(mod);
      },
      () => {
        // A failed load is tried again on the next call or input (lazyModule clears it).
        loading = false;
        if (!disposed) for (const name of FIRST_INPUT) opts.inputs?.addEventListener(name, start, true);
      },
    );
  }

  for (const name of FIRST_INPUT) opts.inputs?.addEventListener(name, start, true);

  // A call the engine must answer: straight through once loaded, else held and the load started.
  const later = (call: (e: DrawingController) => void): void => {
    if (disposed) return;
    if (engine !== null) {
      call(engine);
      return;
    }
    pending.push(call);
    start();
  };

  // A tool asked for before the engine loads, by the engine's rules ("selectTool(id)", "Rail mode"): it shows at once
  // and the plan's presses are held for it, as the engine takes them once a tool is on.
  const ask = (id: DrawingToolId | null) => {
    if (!(canEdit() || id === null || id === 'measure' || id === 'cabinets')) return;
    setUi({ tool: id });
    if (id === null) stopHolding();
    const wantsPresses = id !== null && (canEdit() || id === 'measure');
    if (wantsPresses && !holding) {
      holding = true;
      handle.setPointerReceiver(holdReceiver);
    }
  };

  return {
    getUi: () => {
      follow();
      return ui;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      uiListeners.add(listener);
      return () => void uiListeners.delete(listener);
    },
    getFrame: () => engine?.getFrame() ?? null,
    onFrame(listener) {
      if (disposed) return () => {};
      frameListeners.add(listener);
      return () => void frameListeners.delete(listener);
    },
    selectTool(id) {
      if (disposed) return;
      if (engine !== null) return engine.selectTool(id);
      if (id === null && ui.tool === null) return;
      ask(id);
      later((e) => e.selectTool(id));
    },
    typed: (values) => later((e) => e.typed(values)),
    keyDown(event) {
      if (disposed) return false;
      if (engine !== null) return engine.keyDown(event);
      const tool = toolForKey(event, canEdit());
      const plain = !event.defaultPrevented && !isTypingTarget(event.target);
      // With a tool on, Esc and Enter are the tool's (the engine reads them when it loads).
      const toolKey =
        plain && ui.tool !== null && (event.key === 'Escape' || event.key === 'Enter');
      if (tool === null && !toolKey) return false;
      const copy = copyKey(event);
      if (tool !== null) ask(tool);
      later((e) => e.keyDown(copy));
      return true;
    },
    startPick: (ids) => later((e) => e.startPick(ids)),
    keep: (ids) => later((e) => e.keep(ids)),
    showGap(ids) {
      if (disposed) return;
      if (engine !== null) return engine.showGap(ids);
      const last = ids[ids.length - 1];
      if (last !== undefined) link?.select([last]);
    },
    spaceTap() {
      if (engine !== null) return engine.spaceTap();
      later((e) => e.spaceTap());
      return false;
    },
    attachSelection(next) {
      link = next;
      if (engine !== null) engine.attachSelection(next);
    },
    // Before the engine loads nothing is claimed: a press under Select goes to the selection.
    claimSelectPointer(event) {
      if (engine !== null) return engine.claimSelectPointer(event);
      start();
      return false;
    },
    startDrag: (ids, press) => later((e) => e.startDrag(ids, press)),
    dragPointer: (event) => later((e) => e.dragPointer(event)),
    startChipEntry: (side) => later((e) => e.startChipEntry(side)),
    cancelEntry() {
      if (engine !== null) engine.cancelEntry();
    },
    setFixtureChoice: (choice) => later((e) => e.setFixtureChoice(choice)),
    dismissUtilities() {
      if (engine !== null) engine.dismissUtilities();
    },
    pause() {
      if (disposed) return;
      if (engine !== null) return engine.pause();
      if (paused || !enabled) return;
      paused = true;
      // As the engine: Measure and Cabinets stay on, any other tool ends; editing ends. The held calls still reach
      // the engine, which starts paused, so none of them edits.
      const tool = ui.tool === 'measure' || ui.tool === 'cabinets' ? ui.tool : null;
      setUi({ enabled: false, tool, boxes: boxesOf(store.getState().objects) });
      if (tool !== 'measure') stopHolding();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offInput();
      offStore();
      offFloors();
      offEngine.forEach((off) => off());
      pending.length = 0;
      engine?.dispose();
      if (engine === null) handle.setPointerReceiver(null);
      uiListeners.clear();
      frameListeners.clear();
    },
  };
}
