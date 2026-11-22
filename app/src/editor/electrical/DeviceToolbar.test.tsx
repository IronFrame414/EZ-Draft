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
