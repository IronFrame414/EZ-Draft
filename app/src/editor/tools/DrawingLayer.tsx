'use client';
// The drawing layer (EZD-1918, split from DrawingTools.tsx; editor plan 5.1): the overlay SVG, the gap boxes, the
// opening and selection chips and the typed dimension bar, with each tool's own pieces from tools/parts/ (sketch
// strokes, measure chip, door tooltip, dimension mode bar, text box, the Fixtures utilities card). Pointer moves and
// camera changes write the overlay and box positions straight onto the elements, never through React state.
// EZD-210b (vault/plans/EZD-210b.md section 3 C14, C15, Decided "DrawingLayer", "Box place", "lastValues"; S03 Wall,
// Room rectangle, Controls; Q-0568; Q-0570; 11 rule 4). EZD-208b: the keys are in `SelectionLayer`, so the layer keeps
// no key listener.
// EZD-211b Build step 9 (vault/plans/EZD-211b.md Decided "Layer"): the opening preview, dims, ticks, hinge dot and
// offset chips, and Space taps to the controller.
// EZD-212b (vault/plans/EZD-212b.md D10): the dashed Move preview path.
// EZD-212c (vault/plans/EZD-212c.md D18-D20): resize handles, wall chip leaders, selection and size chips, chips as
// text without Edit model, the typed bar for a handle drag or chip entry, and the tablet Cancel.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { RefObject } from 'react';
import { useCoarsePointer } from '../../lib/device/useDeviceLayout';
import touch from '../../styles/touch.module.css';
import type { PlanCanvasHandle } from '../plan/controller';
import { TypedEntryLayer } from '../typed-entry/TypedEntryLayer';
import type { DrawingController, DrawingFrame, DrawingUi } from './drawing-controller';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { GapBoxes } from './GapBoxes';
import { entryTool } from './entry-tool';
import { DRAWING_TOOLS, type DrawingToolId, type TypedDrawingToolId } from './tool-defs';
import { layerParts } from './parts/index.generated';
import type { LayerPartProps, PartRefs } from './parts/types';
import styles from './DrawingTools.module.css';

// EZD-225 (11 Budgets editor download size; 11 rule 7): the overlay code loads on the first pointer or key input in
// the page, as the lock UI does. It draws only once a tool, a selection or a measure is on, which needs that input;
// when it arrives it draws the current frame at once. No React state, so the first pan or box makes no commit.
const overlayModule = lazyModule(() => import('./overlay'));
const FIRST_INPUT = ['pointermove', 'pointerdown', 'keydown'] as const;

// EZD-1918: the tools with no typed bar at all (EZD-404).
const NO_TYPED_ENTRY: ReadonlySet<DrawingToolId> = new Set(
  layerParts.flatMap((p) => p.noTypedEntry ?? []),
);

// A tool with its own typed bar (wall, room rectangle, door, window, move); the others show only an entry's.
const isTyped = (tool: DrawingToolId): tool is TypedDrawingToolId =>
  Object.hasOwn(DRAWING_TOOLS, tool);

export type DrawingLayerProps = {
  controller: DrawingController;
  handle: PlanCanvasHandle;
  canEdit: boolean;
  onCancel: () => void;
};

// The measure chip's elements, when the measure part drew them (overlay.ts skips the chip otherwise).
function measureOf(slot: HTMLDivElement | null, button: HTMLSpanElement | null) {
  return slot === null || button === null ? undefined : { slot, button };
}

// One chip in its slot: text, or a button when it can be pressed (D19).
function ChipSlot({
  slotRef,
  chipRef,
  testId,
  onPress,
}: {
  slotRef: RefObject<HTMLDivElement | null>;
  chipRef: RefObject<HTMLElement | null>;
  testId: string;
  onPress?: () => void;
}) {
  return (
    <div ref={slotRef} className={styles.chipSlot} style={{ display: 'none' }}>
      {onPress === undefined ? (
        <span ref={chipRef} data-testid={testId} className={`${styles.chip} ${styles.chipText}`} />
      ) : (
        <button
          ref={chipRef as RefObject<HTMLButtonElement>}
          type="button"
          data-testid={testId}
          className={`${styles.chip} ${touch.hitArea}`}
          onClick={onPress}
        />
      )}
    </div>
  );
}

// D19: how the chips draw: text without Edit model, entry buttons under Select, the opening tools' own buttons.
function chipModeOf(ui: DrawingUi): 'text' | 'entry' | 'tool' {
  if (!ui.enabled) return 'text';
  if (ui.tool === null) return 'entry';
  if (ui.tool === 'door' || ui.tool === 'window') return 'tool';
  return 'text';
}

export function DrawingLayer({ controller, handle, canEdit, onCancel }: DrawingLayerProps) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getUi, controller.getUi);
  const coarse = useCoarsePointer();
  const chipMode = chipModeOf(ui);
  const bandRef = useRef<SVGPathElement>(null);
  const previewRef = useRef<SVGPathElement>(null);
  const sketchRef = useRef<SVGPathElement>(null);
  const measureSlotRef = useRef<HTMLDivElement>(null);
  const measureChipRef = useRef<HTMLSpanElement>(null);
  const markerRef = useRef<SVGPathElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const spanRef = useRef<SVGPathElement>(null);
  const leafRef = useRef<SVGPathElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const dimsRef = useRef<SVGPathElement>(null);
  const ticksRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const leftSlotRef = useRef<HTMLDivElement>(null);
  const rightSlotRef = useRef<HTMLDivElement>(null);
  const leftChipRef = useRef<HTMLElement>(null);
  const rightChipRef = useRef<HTMLElement>(null);
  const leadersRef = useRef<SVGPathElement>(null);
  const chipTicksRef = useRef<SVGPathElement>(null);
  const handle0Ref = useRef<SVGCircleElement>(null);
  const handle1Ref = useRef<SVGCircleElement>(null);
  const selLeftSlotRef = useRef<HTMLDivElement>(null);
  const selRightSlotRef = useRef<HTMLDivElement>(null);
  const selLeftChipRef = useRef<HTMLElement>(null);
  const selRightChipRef = useRef<HTMLElement>(null);
  const sizeSlotRef = useRef<HTMLDivElement>(null);
  const sizeChipRef = useRef<HTMLSpanElement>(null);
  const [openAt, setOpenAt] = useState<{ field: number; seq: number } | null>(null);
  const boxEls = useRef(new Map<string, HTMLDivElement>());
  const boxesRef = useRef(ui.boxes);

  const boxRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el === null) boxEls.current.delete(key);
    else boxEls.current.set(key, el);
  }, []);

  const place = useCallback(() => {
    for (const box of boxesRef.current) {
      const el = boxEls.current.get(box.wallIds.join(','));
      if (el === undefined) continue;
      const s = handle.modelToScreen(box.at);
      el.style.transform = `translate(${s.x + 12}px, ${s.y + 12}px)`;
    }
  }, [handle]);

  useEffect(() => {
    const band = bandRef.current;
    const marker = markerRef.current;
    const group = groupRef.current;
    const span = spanRef.current;
    const leaf = leafRef.current;
    const arc = arcRef.current;
    const dims = dimsRef.current;
    const ticks = ticksRef.current;
    const dot = dotRef.current;
    const leftSlot = leftSlotRef.current;
    const rightSlot = rightSlotRef.current;
    const leftChip = leftChipRef.current;
    const rightChip = rightChipRef.current;
    const preview = previewRef.current;
    const leaders = leadersRef.current;
    const chipTicks = chipTicksRef.current;
    const handle0 = handle0Ref.current;
    const handle1 = handle1Ref.current;
    const selLeftSlot = selLeftSlotRef.current;
    const selRightSlot = selRightSlotRef.current;
    const selLeftChip = selLeftChipRef.current;
    const selRightChip = selRightChipRef.current;
    const sizeSlot = sizeSlotRef.current;
    const sizeChip = sizeChipRef.current;
    if (
      band === null ||
      marker === null ||
      group === null ||
      span === null ||
      leaf === null ||
      arc === null ||
      dims === null ||
      ticks === null ||
      dot === null ||
      leftSlot === null ||
      rightSlot === null ||
      leftChip === null ||
      rightChip === null ||
      preview === null ||
      leaders === null ||
      chipTicks === null ||
      handle0 === null ||
      handle1 === null ||
      selLeftSlot === null ||
      selRightSlot === null ||
      selLeftChip === null ||
      selRightChip === null ||
      sizeSlot === null ||
      sizeChip === null
    )
      return;
    let live = true;
    let draw: ((frame: DrawingFrame | null) => void) | null = null;
    let offFrame = () => {};
    const offCamera = handle.onCameraChange(() => {
      draw?.(controller.getFrame());
      place();
    });
    const begin = (m: typeof import('./overlay')) => {
      if (!live) return;
      draw = m.createToolOverlay(
        {
          band,
          marker,
          opening: {
            group,
            span,
            leaf,
            arc,
            dims,
            ticks,
            dot,
            chips: [
              { slot: leftSlot, button: leftChip },
              { slot: rightSlot, button: rightChip },
            ],
          },
          preview,
          sketch: sketchRef.current ?? undefined,
          measure: measureOf(measureSlotRef.current, measureChipRef.current),
          selection: {
            handles: [handle0, handle1],
            leaders,
            ticks: chipTicks,
            chips: [
              { slot: selLeftSlot, button: selLeftChip },
              { slot: selRightSlot, button: selRightChip },
            ],
            size: { slot: sizeSlot, button: sizeChip },
          },
        },
        handle.modelToScreen,
      ).draw;
      draw(controller.getFrame());
      offFrame = controller.onFrame(draw);
    };
    const offInput = () => {
      for (const name of FIRST_INPUT) removeEventListener(name, start, true);
    };
    function start() {
      offInput();
      overlayModule.load().then(begin, () => {});
    }
    const loaded = overlayModule.peek();
    if (loaded) begin(loaded);
    else for (const name of FIRST_INPUT) addEventListener(name, start, true);
    return () => {
      live = false;
      offInput();
      offFrame();
      offCamera();
    };
    // D19: the chip elements change with the chip mode, so the refs are bound again.
  }, [controller, handle, place, chipMode]);

  useEffect(
    () =>
      handle.onSpaceTap(() => {
        controller.spaceTap();
      }),
    [controller, handle],
  );

  useLayoutEffect(() => {
    boxesRef.current = ui.boxes;
    place();
  }, [ui.boxes, place]);

  // D20: under Select the typed bar is the handle drag's or chip entry's; an Esc that closes its box ends the
  // entry (D14, S03:76; round 2).
  const entryTyped = useMemo(() => (ui.entry ? entryTool(ui.entry) : null), [ui.entry]);

  const lastValues: Readonly<Record<string, number>> =
    ui.tool === null
      ? {}
      : ui.openingWidth !== null
        ? { width: ui.openingWidth }
        : ui.lastLength === null
          ? {}
          : { length: ui.lastLength };

  // D19: an opening chip under Select starts the chip entry; with the door or window tool on it opens its field.
  const pressOpening = (side: 'left' | 'right', field: number) =>
    chipMode === 'entry'
      ? controller.startChipEntry(side)
      : setOpenAt((p) => ({ field, seq: (p?.seq ?? 0) + 1 }));

  // A part destructures its refs (react-hooks/refs).
  const targets: PartRefs = {
    sketch: sketchRef,
    measureSlot: measureSlotRef,
    measureChip: measureChipRef,
  };
  const partProps: LayerPartProps = { ui, controller, handle, targets };
  // Each place's parts, in order.
  const drawParts = (place: 'Svg' | 'Chips' | 'Layer') =>
    layerParts.map((p) => {
      const Piece = p[place];
      return Piece && <Piece key={p.id} {...partProps} />;
    });

  return (
    <div className={styles.layer} data-testid="drawing-layer">
      <svg className={styles.overlay} data-testid="tool-overlay" aria-hidden="true">
        {drawParts('Svg')}
        <path
          ref={previewRef}
          className={styles.preview}
          data-testid="move-preview"
          display="none"
        />
        <path ref={bandRef} className={styles.band} data-testid="tool-band" display="none" />
        <path ref={markerRef} className={styles.marker} data-testid="snap-marker" display="none" />
        <path
          ref={leadersRef}
          data-testid="chip-leaders"
          className={styles.leaders}
          display="none"
        />
        <path
          ref={chipTicksRef}
          data-testid="chip-ticks"
          className={styles.chipTicks}
          display="none"
        />
        <circle
          ref={handle0Ref}
          data-testid="resize-handle"
          data-index="0"
          r="5"
          className={styles.handle}
          display="none"
        />
        <circle
          ref={handle1Ref}
          data-testid="resize-handle"
          data-index="1"
          r="5"
          className={styles.handle}
          display="none"
        />
        <g ref={groupRef} data-testid="opening-preview" display="none">
          <path ref={spanRef} className={styles.span} data-part="span" display="none" />
          <path ref={leafRef} className={styles.leaf} data-part="leaf" display="none" />
          <path ref={arcRef} className={styles.arc} data-part="arc" display="none" />
        </g>
        <path ref={dimsRef} className={styles.dims} data-testid="opening-dims" display="none" />
        <path ref={ticksRef} className={styles.ticks} data-testid="opening-ticks" display="none" />
        <circle
          ref={dotRef}
          className={styles.dot}
          data-testid="door-hinge-dot"
          r="7"
          display="none"
        />
      </svg>
      <GapBoxes
        boxes={ui.boxes}
        onShow={(box) => controller.showGap(box.wallIds)}
        boxRef={boxRef}
      />
      <div data-testid="opening-chips" className={styles.chips}>
        <ChipSlot
          slotRef={leftSlotRef}
          chipRef={leftChipRef}
          testId="opening-chip-left"
          onPress={chipMode === 'text' ? undefined : () => pressOpening('left', 0)}
        />
        <ChipSlot
          slotRef={rightSlotRef}
          chipRef={rightChipRef}
          testId="opening-chip-right"
          onPress={chipMode === 'text' ? undefined : () => pressOpening('right', 1)}
        />
      </div>
      <div data-testid="selection-chips" className={styles.chips}>
        <ChipSlot
          slotRef={selLeftSlotRef}
          chipRef={selLeftChipRef}
          testId="selection-chip-left"
          onPress={chipMode === 'text' ? undefined : () => controller.startChipEntry('left')}
        />
        <ChipSlot
          slotRef={selRightSlotRef}
          chipRef={selRightChipRef}
          testId="selection-chip-right"
          onPress={chipMode === 'text' ? undefined : () => controller.startChipEntry('right')}
        />
        <ChipSlot slotRef={sizeSlotRef} chipRef={sizeChipRef} testId="size-chip" />
        {drawParts('Chips')}
      </div>
      {drawParts('Layer')}
      {/* EZD-404 (parts/cabinets.ts): the cabinet run screen has no typed bar of the plan. */}
      {canEdit && (ui.tool === null || !NO_TYPED_ENTRY.has(ui.tool)) ? (
        <TypedEntryLayer
          tool={ui.tool !== null && isTyped(ui.tool) ? DRAWING_TOOLS[ui.tool] : entryTyped}
          canEdit={ui.enabled}
          lastValues={lastValues}
          getCursor={handle.getCursor}
          onCommit={controller.typed}
          openAt={openAt}
          coarse={coarse}
          onCancel={() => {
            controller.cancelEntry();
            onCancel();
          }}
          openOnMount={ui.entry?.kind === 'chip'}
          onEscape={ui.tool === null ? controller.cancelEntry : undefined}
        />
      ) : null}
    </div>
  );
}
