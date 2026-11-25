// EZD-602 (S06 Controls "Device toolbar: Receptacle ... Attributes: circuit, GFCI/AFCI, type (duplex, 240V). | Edit
// model. Paused (55% opacity, disabled) in view only with note "Editing tools paused while view only"."; board
// S06Electrical toolbar "Receptacle", "Switch", "Light"; Q-0769 the items not on the board; wording EZD-602 in
// vault/build/assumptions.md). Rendered in the real office catalog, English.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { DeviceToolbar } from './DeviceToolbar';
import { createElectricalToolbar, type ElectricalToolbar } from './toolbar-state';

function render(toolbar: ElectricalToolbar, paused: boolean): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <DeviceToolbar toolbar={toolbar} paused={paused} />
    </MessagesProvider>,
  );
}

const ITEMS = ['receptacle', 'switch', 'light', 'low-voltage', 'detector', 'fan'];

describe('EZD-602 device toolbar', () => {
  it('shows Receptacle, Switch, Light, Low voltage, Smoke/CO and Fan, none pressed, no note', () => {
    const html = render(createElectricalToolbar(), false);
    const labels = ITEMS.map((i) => textOf(elements(html, `device-tool-${i}`)[0]!.inner));
    expect(labels).toEqual(['Receptacle', 'Switch', 'Light', 'Low voltage', 'Smoke/CO', 'Fan']);
    for (const i of ITEMS) {
      const el = elements(html, `device-tool-${i}`)[0]!;
      expect(attr(el.attrs, 'aria-pressed')).toBe('false');
      expect(attr(el.attrs, 'disabled')).toBeNull();
    }
    expect(elements(html, 'device-toolbar-paused')).toHaveLength(0);
  });

  it('view only: every item disabled and the note shows', () => {
    const t = createElectricalToolbar();
    t.press('receptacle');
    const html = render(t, true);
    for (const i of ITEMS) {
      const el = elements(html, `device-tool-${i}`)[0]!;
      expect(attr(el.attrs, 'disabled')).not.toBeNull();
      expect(attr(el.attrs, 'aria-pressed')).toBe('false');
    }
    expect(textOf(elements(html, 'device-toolbar-paused')[0]!.inner)).toBe(
      'Editing tools paused while view only',
    );
    expect(elements(html, 'device-toolbar-choices')).toHaveLength(0);
  });

  it('an armed receptacle offers Duplex or 240V and its GFCI/AFCI', () => {
    const t = createElectricalToolbar();
    t.press('receptacle');
    t.set({ protection: 'gfci' });
    const html = render(t, false);
    expect(attr(elements(html, 'device-tool-receptacle')[0]!.attrs, 'aria-pressed')).toBe('true');
    expect(textOf(elements(html, 'device-kind-receptacle_duplex')[0]!.inner)).toBe(
      'Duplex receptacle',
    );
    expect(textOf(elements(html, 'device-kind-receptacle_240v')[0]!.inner)).toBe('240V receptacle');
    expect(attr(elements(html, 'device-kind-receptacle_duplex')[0]!.attrs, 'aria-pressed')).toBe(
      'true',
    );
    expect(
      ['none', 'gfci', 'afci', 'dual'].map((p) =>
        textOf(elements(html, `device-protection-${p}`)[0]!.inner),
      ),
    ).toEqual(['None', 'GFCI', 'AFCI', 'GFCI + AFCI']);
    expect(attr(elements(html, 'device-protection-gfci')[0]!.attrs, 'aria-pressed')).toBe('true');
  });

  it('an armed switch offers single, 3-way and dimmer, with no GFCI/AFCI', () => {
    const t = createElectricalToolbar();
    t.press('switch');
    const html = render(t, false);
    expect(
      ['switch_single', 'switch_3way', 'switch_dimmer'].map((k) =>
        textOf(elements(html, `device-kind-${k}`)[0]!.inner),
      ),
    ).toEqual(['Switch', '3-way switch', 'Dimmer']);
    expect(elements(html, 'device-protection-gfci')).toHaveLength(0);
  });

  it('an armed light, with one kind, shows no choices', () => {
    const t = createElectricalToolbar();
    t.press('light');
    expect(elements(render(t, false), 'device-toolbar-choices')).toHaveLength(0);
  });
});

// EZD-604 (S06 Controls "Device toolbar: Circuit | Canvas toolbar | Assign circuit by clicking devices in turn."; board
// S06Electrical toolbar "Circuit" after the device items; vault/build/assumptions.md EZD-604 disabled until a circuit
// is chosen).
describe('EZD-604 Circuit tool', () => {
  it('shows Circuit, disabled until a circuit is chosen in the left panel', async () => {
    const { circuitView } = await import('./circuit-view');
    const html = render(createElectricalToolbar(), false);
    const el = elements(html, 'device-tool-circuit')[0]!;
    expect(textOf(el.inner)).toBe('Circuit');
    expect(attr(el.attrs, 'disabled')).not.toBeNull();
    circuitView.set({ circuit: '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f02' });
    try {
      const t = createElectricalToolbar();
      t.press('circuit');
      const on = elements(render(t, false), 'device-tool-circuit')[0]!;
      expect(attr(on.attrs, 'disabled')).toBeNull();
      expect(attr(on.attrs, 'aria-pressed')).toBe('true');
      // No device item is pressed and no kind row shows while Circuit is armed.
      expect(elements(render(t, false), 'device-toolbar-choices')).toHaveLength(0);
      expect(attr(elements(render(t, true), 'device-tool-circuit')[0]!.attrs, 'disabled')).not.toBeNull();
    } finally {
      circuitView.set({ circuit: null });
    }
  });
});

// EZD-605 (S06 Controls "Device toolbar: Switch leg | Canvas toolbar | Draw a switch leg from switch to fixtures
// (dashed). | Same."; board S06Electrical toolbar "Switch leg" before "Circuit").
describe('EZD-605 Switch leg item', () => {
  it('sits right before Circuit, unpressed; armed it is pressed and shows the hint', () => {
    const t = createElectricalToolbar();
    let html = render(t, false);
    const leg = elements(html, 'device-tool-switch-leg')[0]!;
    expect(textOf(leg.inner)).toBe('Switch leg');
    expect(attr(leg.attrs, 'aria-pressed')).toBe('false');
    expect(html.indexOf('device-tool-switch-leg')).toBeLessThan(html.indexOf('device-tool-circuit'));
    expect(html.indexOf('device-tool-fan')).toBeLessThan(html.indexOf('device-tool-switch-leg'));
    t.press('switch-leg');
    html = render(t, false);
    expect(attr(elements(html, 'device-tool-switch-leg')[0]!.attrs, 'aria-pressed')).toBe('true');
    expect(textOf(elements(html, 'device-toolbar-leg-hint')[0]!.inner)).toBe(
      'Click a switch, then the lights it controls',
    );
    expect(elements(html, 'device-toolbar-choices')).toHaveLength(0);
  });

  it('view only: disabled and unpressed', () => {
    const t = createElectricalToolbar();
    t.press('switch-leg');
    const leg = elements(render(t, true), 'device-tool-switch-leg')[0]!;
    expect(attr(leg.attrs, 'disabled')).not.toBeNull();
    expect(attr(leg.attrs, 'aria-pressed')).toBe('false');
  });
});
