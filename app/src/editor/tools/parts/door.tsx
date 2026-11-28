// EZD-211b Build step 9 (vault/plans/EZD-211b.md Decided "Layer"): the Door tool's tooltip over the swing arc or the
// hinge dot. EZD-1918 (11 rule 7; AC-EZD-1918-2 "the editor route's size does not grow"): its code comes with a lazy
// module fetched on the first press or key in the page, as the tool overlay is, so it is there when the tool is picked.
import { useEffect } from 'react';
import { lazyModule } from '../../../lib/lazy/lazy-module';
import { lazyPart, preloadOnFirstInput } from '../../shared/lazy-part';
import type { LayerPart, LayerPartProps } from './types';

export const tooltipModule = lazyModule(() => import('./pieces/door-tooltip'));
const LazyTooltip = lazyPart(tooltipModule, 'DoorTooltip');

function DoorPart(props: LayerPartProps) {
  useEffect(
    () => (tooltipModule.peek() ? undefined : preloadOnFirstInput(window, tooltipModule)),
    [],
  );
  if (props.ui.doorTarget === null) return null;
  return <LazyTooltip {...props} />;
}

export const part: LayerPart = { id: 'door', order: 10, Layer: DoorPart };
