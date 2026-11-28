// EZD-216 (S03 Text; Q-0682): the Text tool's in-place text box. EZD-1918 (11 rule 7; AC-EZD-1918-2 "the editor
// route's size does not grow"): its code comes with a lazy module fetched on the first press or key in the page, as
// the tool overlay is, so it is there before a Text or Dimension click opens the box.
import { useEffect } from 'react';
import { lazyModule } from '../../../lib/lazy/lazy-module';
import { lazyPart, preloadOnFirstInput } from '../../shared/lazy-part';
import type { LayerPart, LayerPartProps } from './types';

const textBoxModule = lazyModule(() => import('../text-box'));
const LazyTextBox = lazyPart(textBoxModule, 'CanvasTextBox');

function TextBoxPart({ ui, controller, handle }: LayerPartProps) {
  useEffect(
    () => (textBoxModule.peek() ? undefined : preloadOnFirstInput(window, textBoxModule)),
    [],
  );
  if (ui.textBox == null) return null;
  return (
    <LazyTextBox
      key={ui.textBox.seq}
      box={ui.textBox}
      handle={handle}
      onCommit={controller.commitText}
      onCancel={controller.cancelText}
    />
  );
}

export const part: LayerPart = { id: 'text', order: 30, Layer: TextBoxPart };
