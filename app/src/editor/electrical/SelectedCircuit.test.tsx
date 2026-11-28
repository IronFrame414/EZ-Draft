// EZD-610 (S06 Controls "Selected circuit block ... Read only in view only. Fields editable with Edit model ...
// Voltage drop shows a warning above the threshold in settings."; AC-EZD-610-1, -2; vault/build/assumptions/
// EZD-610.md): the chosen circuit's block in the electrical left panel. Expected text from board S06Electrical
// ("Selected circuit A-14", "Run 58 ft", "V-drop @16A 3.1%", "V-drop 3.1% is over the 3% limit (Defaults). Use 10/2 or
// shorten the run.") and 09b (12 AWG copper, 58 ft, 16 A, 120 V = 3.1%). Rendered in the real office catalog, English.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../model/model-store';
import { applyEditTo, makeEdit, type Objects } from '../model/patches';
import { uid } from '../tools/test-utils/fixtures';
import { circuitView } from './circuit-view';
import { circuitEditChange, type CircuitEdit } from './circuits';
import { ElectricalPanel } from './ElectricalPanel';
import type { ToolBase } from './DeviceTools';
import { createReceiverSlot } from './receiver-slot';
import { electricalObjects } from './test-fixture';

const SMALL_APPL_2 = uid(202); // space 14 on Panel A, 20 A

function edited(edits: CircuitEdit[]): Map<string, ObjectValue> {
  let o: Objects = electricalObjects();
  for (const e of edits) {
    const c = circuitEditChange(o, SMALL_APPL_2, e)!;
    o = applyEditTo(o, makeEdit(o, [c]), 'forward');
  }
  return new Map(o);
}

const boardCircuit = () =>
  edited([
    { field: 'wire', size: '12' },
    { field: 'run', feet: 58 },
  ]);

function render(
  objects: Map<string, ObjectValue>,
  threshold: number | null,
  mode: 'view' | 'edit' | 'paused' = 'view',
): string {
  const store = createModelStore({ objects });
  const ui = { ids: [] as string[], selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, select: () => {} };
  const values = { voltage_drop_warning: threshold };
  const projectDefaults = { get: () => values as never, subscribe: () => () => {} };
  let edit;
  if (mode !== 'view') {
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
    edit = { slot, paused: mode === 'paused' };
  }
  circuitView.set({ circuit: SMALL_APPL_2 });
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ElectricalPanel
        store={store}
        selection={selection}
        showObject={() => true}
        projectDefaults={projectDefaults}
        edit={edit}
      />
    </MessagesProvider>,
  );
}

const one = (html: string, testId: string) => {
  const els = elements(html, testId);
  expect(els, testId).toHaveLength(1);
  return els[0]!;
};
const text = (html: string, testId: string) => textOf(one(html, testId).inner);

afterEach(() => circuitView.set({ circuit: null }));

describe('EZD-610 Selected circuit block', () => {
  it('AC-EZD-610-1: shows the circuit tag, run and V-drop @16A 3.1% (view only, read only)', () => {
    const html = render(boardCircuit(), 3);
    expect(elements(html, 'circuit-selected')).toHaveLength(1);
    expect(text(html, 'circuit-tag')).toBe('A-14');
    expect(text(html, 'circuit-run-text')).toBe('58 ft');
    expect(text(html, 'circuit-wire-text')).toBe('12 AWG · Copper');
    expect(text(html, 'circuit-vdrop-label')).toBe('V-drop @16A');
    expect(text(html, 'circuit-vdrop')).toBe('3.1%');
    // Read only in view only: no controls.
    expect(elements(html, 'circuit-fields')).toHaveLength(0);
    expect(elements(html, 'circuit-run')).toHaveLength(0);
  });

  it('AC-EZD-610-2: with a 3% threshold it warns, naming 10/2 (board)', () => {
    const html = render(boardCircuit(), 3);
    expect(attr(one(html, 'circuit-vdrop').attrs, 'data-warns')).toBe('true');
    expect(text(html, 'circuit-vdrop-warning')).toBe(
      'V-drop 3.1% is over the 3% limit (Defaults). Use 10/2 or shorten the run.',
    );
  });

  it('no warning at a 5% threshold; "Set in Defaults" while the threshold is Not set', () => {
    const over = render(boardCircuit(), 5);
    expect(elements(over, 'circuit-vdrop-warning')).toHaveLength(0);
    expect(attr(one(over, 'circuit-vdrop').attrs, 'data-warns')).toBe('false');
    const unset = render(boardCircuit(), null);
    expect(elements(unset, 'circuit-vdrop-warning')).toHaveLength(0);
    expect(text(unset, 'circuit-vdrop')).toBe('3.1%');
    expect(text(unset, 'circuit-vdrop-set')).toBe('Set in Defaults');
  });

  it('a blank run shows "—" and no warning', () => {
    const html = render(edited([{ field: 'wire', size: '12' }]), 3);
    expect(text(html, 'circuit-run-text')).toBe('—');
    expect(text(html, 'circuit-vdrop')).toBe('—');
    expect(elements(html, 'circuit-vdrop-warning')).toHaveLength(0);
  });

  it('with no 09b size enough the text is "Shorten the run."', () => {
    const html = render(
      edited([
        { field: 'wire', size: '12' },
        { field: 'run', feet: 400 },
      ]),
      3,
    );
    expect(text(html, 'circuit-vdrop-warning')).toMatch(/limit \(Defaults\)\. Shorten the run\.$/);
  });

  it('with Edit model: Breaker, Poles, Wire, Material and Run, disabled while paused', () => {
    const html = render(boardCircuit(), 3, 'edit');
    const fields = text(html, 'circuit-fields');
    for (const label of ['Breaker', 'Poles', 'Wire', 'Material', 'Run (ft)'])
      expect(fields).toContain(label);
    expect(attr(one(html, 'circuit-run').attrs, 'value')).toBe('58');
    expect(attr(one(html, 'circuit-run').attrs, 'disabled')).toBeNull();
    expect(text(html, 'circuit-vdrop')).toBe('3.1%');
    const paused = render(boardCircuit(), 3, 'paused');
    expect(attr(one(paused, 'circuit-run').attrs, 'disabled')).not.toBeNull();
    expect(attr(one(paused, 'circuit-material').attrs, 'disabled')).not.toBeNull();
  });
});
