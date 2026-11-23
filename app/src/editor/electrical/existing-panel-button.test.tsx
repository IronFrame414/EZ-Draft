// EZD-606 (S06 Controls "Existing panel (not in mockup) | Inspector, load calc header button; opens a dialog | ... |
// Edit model."; vault/build/assumptions.md EZD-606 "Where the Existing panel button sits": the Panel tab until the
// load calc header exists). Rendered in the real office catalog, English.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import { ElectricalPanel } from './ElectricalPanel';
import type { PanelPhotoReader } from './panel-read-client';
import { createReceiverSlot } from './receiver-slot';
import type { ToolBase } from './DeviceTools';
import { electricalObjects } from './test-fixture';

const reader: PanelPhotoReader = async () => ({ status: 'failed', reason: 'failed' });

function render(edit: 'none' | 'on' | 'paused', tab: 'panel' | 'circuits' = 'panel'): string {
  const store = createModelStore({ objects: electricalObjects() });
  const slot = createReceiverSlot<ToolBase>();
  slot.setState({
    base: {
      store,
      chosenFloor: () => null,
      newStatus: () => 'new',
      newId: () => '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f77',
      select: () => {},
      onMessage: () => {},
    },
  });
  const ui = { ids: [] as string[], selectMore: false };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ElectricalPanel
        store={store}
        selection={{ getUi: () => ui, subscribe: () => () => {}, select: () => {} }}
        showObject={() => true}
        initialTab={tab}
        edit={edit === 'none' ? undefined : { slot, paused: edit === 'paused', reader }}
      />
    </MessagesProvider>,
  );
}

describe('EZD-606 Existing panel button', () => {
  it('the Panel tab shows "Existing panel" with Edit model, disabled in view only, hidden without', () => {
    const [on] = elements(render('on'), 'electrical-existing-panel');
    expect(textOf(on!.inner)).toBe('Existing panel');
    expect(attr(on!.attrs, 'disabled')).toBeNull();
    const [paused] = elements(render('paused'), 'electrical-existing-panel');
    expect(attr(paused!.attrs, 'disabled')).not.toBeNull();
    expect(elements(render('none'), 'electrical-existing-panel')).toHaveLength(0);
  });

  it('is only on the Panel tab; the dialog is closed until the button is pressed', () => {
    expect(elements(render('on', 'circuits'), 'electrical-existing-panel')).toHaveLength(0);
    expect(elements(render('on'), 'existing-panel-dialog')).toHaveLength(0);
  });
});
