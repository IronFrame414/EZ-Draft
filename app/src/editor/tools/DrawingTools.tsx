'use client';
// Drawing tools on the plan (EZD-210b; vault/plans/EZD-210b.md section 3 C14, C15, Decided "DrawingRail",
// "DrawingLayer", "Box place", "lastValues"; S03 Wall, Room rectangle, Controls; Q-0568; Q-0570; 11 rule 4).
// The rail reads the controller's ui; the layer holds the overlay SVG, the gap boxes and the typed dimension bar.
// Pointer moves and camera changes write the overlay and box positions straight onto the elements, never
// through React state.
// EZD-208b Build step 6 (vault/plans/EZD-208b.md section 3 C4; DB1, DB2): the rail takes `editorRail`'s tools with
// Select first and on by default; the keys moved to `SelectionLayer`, so the layer keeps no key listener.
// EZD-211b Build step 9 (vault/plans/EZD-211b.md Decided "Layer"): the opening preview, dims, ticks, hinge dot and
// offset chips, the door tooltip, and Space taps to the controller.
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
import type { RailTool } from '../../components/shell/rail-types';
import { ToolRail } from '../../components/shell/ToolRail';
import { useCoarsePointer } from '../../lib/device/useDeviceLayout';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { PlanCanvasHandle } from '../plan/controller';
import type { SelectionController } from '../selection/selection-controller';
import { TypedEntryLayer } from '../typed-entry/TypedEntryLayer';
import type { DrawingController, DrawingUi } from './drawing-controller';
import { GapBoxes } from './GapBoxes';
import { createToolOverlay } from './overlay';
import { entryTool } from './selection-edit';
import { DRAWING_TOOLS, type DrawingToolId } from './tool-defs';
import styles from './DrawingTools.module.css';

const noSubscribe = () => () => {};

export type DrawingRailProps = {
  drawing: DrawingController | null;
  selection: SelectionController | null;
  rail: { tools: readonly RailTool[]; disabled: boolean };
};

export function DrawingRail({ drawing, selection, rail }: DrawingRailProps) {
  const ui = useSyncExternalStore<DrawingUi | null>(
    drawing ? drawing.subscribe : noSubscribe,
    () => drawing?.getUi() ?? null,
    () => drawing?.getUi() ?? null,
  );
  return (
    <ToolRail
      top={[...rail.tools]}
      bottom={[]}
      activeId={ui?.tool ?? 'select'}
      onSelect={(id) => {
        if (id === 'select') selection?.selectTool();
        else drawing?.selectTool(id as DrawingToolId);
      }}
      disabled={rail.disabled}
    />
  );
}

export type DrawingLayerProps = {
  controller: DrawingController;
  handle: PlanCanvasHandle;
  canEdit: boolean;
  onCancel: () => void;
};

// D19: how the chips draw: text without Edit model, entry buttons under Select, the opening tools' own buttons.
function chipModeOf(ui: DrawingUi): 'text' | 'entry' | 'tool' {
  if (!ui.enabled) return 'text';
  if (ui.tool === null) return 'entry';
  if (ui.tool === 'door' || ui.tool === 'window') return 'tool';
  return 'text';
}

export function DrawingLayer({ controller, handle, canEdit, onCancel }: DrawingLayerProps) {
  const t = useT();
  const ui = useSyncExternalStore(controller.subscribe, controller.getUi, controller.getUi);
  const coarse = useCoarsePointer();
  const chipMode = chipModeOf(ui);
  const bandRef = useRef<SVGPathElement>(null);
  const previewRef = useRef<SVGPathElement>(null);
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
    const overlay = createToolOverlay(
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
    );
    const draw = overlay.draw;
    draw(controller.getFrame());
    const offFrame = controller.onFrame(draw);
    const offCamera = handle.onCameraChange(() => {
      draw(controller.getFrame());
      place();
    });
    return () => {
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

  // The tooltip sits at the cursor + 12 px, read when the door target changes.
  const tooltipAt = useMemo(
    () => (ui.doorTarget === null ? null : handle.getCursor()),
    [ui.doorTarget, handle],
  );

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

  return (
    <div className={styles.layer} data-testid="drawing-layer">
      <svg className={styles.overlay} data-testid="tool-overlay" aria-hidden="true">
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
        <div ref={leftSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          {chipMode === 'text' ? (
            <span
              ref={leftChipRef}
              data-testid="opening-chip-left"
              className={`${styles.chip} ${styles.chipText}`}
            />
          ) : (
            <button
              ref={leftChipRef as RefObject<HTMLButtonElement>}
              type="button"
              data-testid="opening-chip-left"
              className={`${styles.chip} ${touch.hitArea}`}
              onClick={() =>
                chipMode === 'entry'
                  ? controller.startChipEntry('left')
                  : setOpenAt((p) => ({ field: 0, seq: (p?.seq ?? 0) + 1 }))
              }
            />
          )}
        </div>
        <div ref={rightSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          {chipMode === 'text' ? (
            <span
              ref={rightChipRef}
              data-testid="opening-chip-right"
              className={`${styles.chip} ${styles.chipText}`}
            />
          ) : (
            <button
              ref={rightChipRef as RefObject<HTMLButtonElement>}
              type="button"
              data-testid="opening-chip-right"
              className={`${styles.chip} ${touch.hitArea}`}
              onClick={() =>
                chipMode === 'entry'
                  ? controller.startChipEntry('right')
                  : setOpenAt((p) => ({ field: 1, seq: (p?.seq ?? 0) + 1 }))
              }
            />
          )}
        </div>
      </div>
      <div data-testid="selection-chips" className={styles.chips}>
        <div ref={selLeftSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          {chipMode === 'text' ? (
            <span
              ref={selLeftChipRef}
              data-testid="selection-chip-left"
              className={`${styles.chip} ${styles.chipText}`}
            />
          ) : (
            <button
              ref={selLeftChipRef as RefObject<HTMLButtonElement>}
              type="button"
              data-testid="selection-chip-left"
              className={`${styles.chip} ${touch.hitArea}`}
              onClick={() => controller.startChipEntry('left')}
            />
          )}
        </div>
        <div ref={selRightSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          {chipMode === 'text' ? (
            <span
              ref={selRightChipRef}
              data-testid="selection-chip-right"
              className={`${styles.chip} ${styles.chipText}`}
            />
          ) : (
            <button
              ref={selRightChipRef as RefObject<HTMLButtonElement>}
              type="button"
              data-testid="selection-chip-right"
              className={`${styles.chip} ${touch.hitArea}`}
              onClick={() => controller.startChipEntry('right')}
            />
          )}
        </div>
        <div ref={sizeSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          <span
            ref={sizeChipRef}
            data-testid="size-chip"
            className={`${styles.chip} ${styles.chipText}`}
          />
        </div>
      </div>
      {ui.doorTarget !== null ? (
        <div
          role="tooltip"
          data-testid="door-tooltip"
          className={styles.tooltip}
          style={tooltipAt === null ? undefined : { left: tooltipAt.x + 12, top: tooltipAt.y + 12 }}
        >
          {t(
            ui.doorTarget === 'arc'
              ? 'office.tools.opening.door_tip_swing'
              : 'office.tools.opening.door_tip_hand',
          )}
        </div>
      ) : null}
      {canEdit ? (
        <TypedEntryLayer
          tool={ui.tool ? DRAWING_TOOLS[ui.tool] : entryTyped}
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
