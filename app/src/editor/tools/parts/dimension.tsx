// EZD-216 (S03 Dimension; Q-0682; Q-0683 (a)): the Dimension tool's Linear / Angular bar in the typed bar's place.
// EZD-1918 (11 rule 7; AC-EZD-1918-2 "the editor route's size does not grow"): its code comes with a lazy module
// fetched on the first press or key in the page, as the tool overlay is, so it is there when the tool is picked.
import { useEffect } from 'react';
import { lazyModule } from '../../../lib/lazy/lazy-module';
import { lazyPart, preloadOnFirstInput } from '../../shared/lazy-part';
import type { LayerPart, LayerPartProps } from './types';

export const barModule = lazyModule(() => import('./pieces/dimension-mode-bar'));
const LazyBar = lazyPart(barModule, 'DimensionModeBar');

function DimensionPart(props: LayerPartProps) {
  useEffect(() => (barModule.peek() ? undefined : preloadOnFirstInput(window, barModule)), []);
  if (props.ui.dimensionMode == null || !props.ui.enabled) return null;
  return <LazyBar {...props} />;
}

export const part: LayerPart = { id: 'dimension', order: 20, Layer: DimensionPart };
