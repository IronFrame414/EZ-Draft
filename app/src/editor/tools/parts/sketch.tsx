// EZD-223 (S03 Sketch): the sketch strokes path; overlay.ts writes the page's strokes and the stroke being drawn onto
// it. The Sketch tool has no typed bar (it has no typed tool, tool-defs.ts DRAWING_TOOLS).
import styles from '../DrawingTools.module.css';
import type { LayerPart, LayerPartProps } from './types';

function SketchStrokes({ targets }: LayerPartProps) {
  const { sketch } = targets;
  return (
    <path ref={sketch} className={styles.sketch} data-testid="sketch-strokes" display="none" />
  );
}

export const part: LayerPart = { id: 'sketch', order: 10, Svg: SketchStrokes };
