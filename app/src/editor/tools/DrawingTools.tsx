'use client';
// Drawing tools on the plan (EZD-210b; vault/plans/EZD-210b.md section 3 C14, C15, Decided "DrawingRail",
// "DrawingLayer", "Box place", "lastValues"; S03 Wall, Room rectangle, Controls; Q-0568; Q-0570; 11 rule 4).
// The rail reads the controller's ui; the layer holds the overlay SVG, the gap boxes and the typed dimension bar.
// Pointer moves and camera changes write the overlay and box positions straight onto the elements, never
// through React state.
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { ToolRail } from '../../components/shell/ToolRail';
import type { PlanCanvasHandle } from '../plan/controller';
import { TypedEntryLayer } from '../typed-entry/TypedEntryLayer';
import type { DrawingController, DrawingUi } from './drawing-controller';
import { GapBoxes } from './GapBoxes';
import { createToolOverlay } from './overlay';
import { DRAWING_RAIL_TOOLS, DRAWING_TOOLS, type DrawingToolId } from './tool-defs';
import styles from './DrawingTools.module.css';

const noSubscribe = () => () => {};

export type DrawingRailProps = { controller: DrawingController | null; disabled: boolean };

export function DrawingRail({ controller, disabled }: DrawingRailProps) {
  const ui = useSyncExternalStore<DrawingUi | null>(
    controller ? controller.subscribe : noSubscribe,
    () => controller?.getUi() ?? null,
    () => controller?.getUi() ?? null,
  );
  return (
    <ToolRail
      top={[...DRAWING_RAIL_TOOLS]}
      bottom={[]}
      activeId={ui?.tool ?? null}
      onSelect={(id) => controller?.selectTool(id as DrawingToolId)}
      disabled={disabled}
    />
  );
}

export type DrawingLayerProps = {
  controller: DrawingController;
  handle: PlanCanvasHandle;
  canEdit: boolean;
};

export function DrawingLayer({ controller, handle, canEdit }: DrawingLayerProps) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getUi, controller.getUi);
  const bandRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<SVGPathElement>(null);
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
    if (band === null || marker === null) return;
    const overlay = createToolOverlay({ band, marker }, handle.modelToScreen);
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

  useLayoutEffect(() => {
    boxesRef.current = ui.boxes;
    place();
  }, [ui.boxes, place]);

  useEffect(() => {
    if (!ui.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (controller.keyDown(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, ui.enabled]);

  const lastValues: Readonly<Record<string, number>> =
    ui.lastLength === null ? {} : { length: ui.lastLength };

  return (
    <div className={styles.layer} data-testid="drawing-layer">
      <svg className={styles.overlay} data-testid="tool-overlay" aria-hidden="true">
        <path ref={bandRef} className={styles.band} data-testid="tool-band" display="none" />
        <path ref={markerRef} className={styles.marker} data-testid="snap-marker" display="none" />
      </svg>
      <GapBoxes
        boxes={ui.boxes}
        pick={ui.pick}
        message={ui.gapMessage}
        onPick={(box) => controller.startPick(box.wallIds)}
        onKeep={(box) => controller.keep(box.wallIds)}
        boxRef={boxRef}
      />
      {canEdit ? (
        <TypedEntryLayer
          tool={ui.tool ? DRAWING_TOOLS[ui.tool] : null}
          canEdit={ui.enabled}
          lastValues={lastValues}
          getCursor={handle.getCursor}
          onCommit={controller.typed}
        />
      ) : null}
    </div>
  );
}
