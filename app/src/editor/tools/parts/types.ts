// EZD-1918 (editor plan 5.1, 5.3 "features plug in"; S03 Controls rail): the shape of one tool's part of the drawing
// layer. A part is a file `tools/parts/<name>.tsx` exporting `part`; `index.generated.ts` lists every such file
// (app/tools/gen-registry.mjs), so a tool's own overlay piece touches neither DrawingLayer.tsx nor a shared list.
// DrawingLayer draws each part's pieces in its three places, lower `order` first. Nothing a part imports statically
// may come from app/src/lazy/ (EZD-120c B11): a part loads its lazy code through a lazy module, as fixtures.tsx does.
// A part's lazy piece lives in `parts/pieces/` (not listed: the index lists only this folder's own files).
import type { ComponentType, RefObject } from 'react';
import type { PlanCanvasHandle } from '../../plan/controller';
import type { DrawingController, DrawingUi } from '../drawing-controller';
import type { DrawingToolId } from '../tool-defs';

/**
 * The refs of the elements a part draws that the tool overlay (overlay.ts) writes onto straight, never through React
 * state. The layer hands them to the overlay when it loads; one a part does not draw stays empty and the overlay
 * skips it.
 */
export type PartRefs = {
  /** EZD-223: the sketch strokes path, in the overlay SVG. */
  readonly sketch: RefObject<SVGPathElement | null>;
  /** EZD-231: the measure distance chip's slot and its text. */
  readonly measureSlot: RefObject<HTMLDivElement | null>;
  readonly measureChip: RefObject<HTMLSpanElement | null>;
};

/** What every part's pieces are given. */
export type LayerPartProps = {
  readonly ui: DrawingUi;
  readonly controller: DrawingController;
  readonly handle: PlanCanvasHandle;
  readonly targets: PartRefs;
};

export type LayerPart = {
  readonly id: string;
  /** Lower first, in each place (the order the pieces were drawn in before EZD-1918). */
  readonly order: number;
  /** Drawn first in the overlay SVG, under the shared paths (band, marker, handles, opening preview). */
  readonly Svg?: ComponentType<LayerPartProps>;
  /** Drawn last in the selection chips. */
  readonly Chips?: ComponentType<LayerPartProps>;
  /** Drawn in the layer after the chips, before the typed bar. */
  readonly Layer?: ComponentType<LayerPartProps>;
  /** The tools that show no typed bar at all, not even a chip or handle entry's (EZD-404). */
  readonly noTypedEntry?: readonly DrawingToolId[];
};
