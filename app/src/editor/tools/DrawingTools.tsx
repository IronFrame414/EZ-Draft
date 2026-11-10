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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { RailTool } from '../../components/shell/rail-types';
import { ToolRail } from '../../components/shell/ToolRail';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { PlanCanvasHandle } from '../plan/controller';
import type { SelectionController } from '../selection/selection-controller';
import { TypedEntryLayer } from '../typed-entry/TypedEntryLayer';
import type { DrawingController, DrawingUi } from './drawing-controller';
import { GapBoxes } from './GapBoxes';
import { createToolOverlay } from './overlay';
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
};

export function DrawingLayer({ controller, handle, canEdit }: DrawingLayerProps) {
  const t = useT();
  const ui = useSyncExternalStore(controller.subscribe, controller.getUi, controller.getUi);
  const bandRef = useRef<SVGPathElement>(null);
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
  const leftChipRef = useRef<HTMLButtonElement>(null);
  const rightChipRef = useRef<HTMLButtonElement>(null);
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
      rightChip === null
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
  }, [controller, handle, place]);

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

  const lastValues: Readonly<Record<string, number>> =
    ui.openingWidth !== null
      ? { width: ui.openingWidth }
      : ui.lastLength === null
        ? {}
        : { length: ui.lastLength };

  return (
    <div className={styles.layer} data-testid="drawing-layer">
      <svg className={styles.overlay} data-testid="tool-overlay" aria-hidden="true">
        <path ref={bandRef} className={styles.band} data-testid="tool-band" display="none" />
        <path ref={markerRef} className={styles.marker} data-testid="snap-marker" display="none" />
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
        pick={ui.pick}
        message={ui.gapMessage}
        onPick={(box) => controller.startPick(box.wallIds)}
        onKeep={(box) => controller.keep(box.wallIds)}
        boxRef={boxRef}
      />
      <div data-testid="opening-chips" className={styles.chips}>
        <div ref={leftSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          <button
            ref={leftChipRef}
            type="button"
            data-testid="opening-chip-left"
            className={`${styles.chip} ${touch.hitArea}`}
            onClick={() => setOpenAt((p) => ({ field: 0, seq: (p?.seq ?? 0) + 1 }))}
          />
        </div>
        <div ref={rightSlotRef} className={styles.chipSlot} style={{ display: 'none' }}>
          <button
            ref={rightChipRef}
            type="button"
            data-testid="opening-chip-right"
            className={`${styles.chip} ${touch.hitArea}`}
            onClick={() => setOpenAt((p) => ({ field: 1, seq: (p?.seq ?? 0) + 1 }))}
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
          tool={ui.tool ? DRAWING_TOOLS[ui.tool] : null}
          canEdit={ui.enabled}
          lastValues={lastValues}
          getCursor={handle.getCursor}
          onCommit={controller.typed}
          openAt={openAt}
        />
      ) : null}
    </div>
  );
}
