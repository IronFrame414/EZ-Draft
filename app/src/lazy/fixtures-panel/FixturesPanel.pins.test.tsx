// EZD-220 (AC-EZD-220-1; 03f:16 the six existing-condition pins; Q-0704 05-screens "Pins draw in the Existing view only";
// wording in vault/build/assumptions.md EZD-220). Markup through renderToStaticMarkup (as FixturesPanel.test.tsx).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { pinChoice, type FixtureChoice } from '../../editor/tools/fixture-tool';
import { FixturesPanel } from './FixturesPanel';

const panel = (choice: FixtureChoice) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <FixturesPanel choice={choice} onChoose={() => {}} />
    </MessagesProvider>,
  );

describe('EZD-220 Fixtures panel pins', () => {
  it('lists the six pin kinds, the chosen one pressed, with the Existing view hint', () => {
    const s = panel(pinChoice('lead'));
    expect(s).toContain('Existing-condition pins');
    for (const [kind, name] of [
      ['damage_moisture', 'Damage / moisture'],
      ['protect', 'Protect'],
      ['lead', 'Lead'],
      ['plumbing', 'Plumbing'],
      ['gas', 'Gas'],
      ['water_heater', 'Water heater'],
    ])
      expect(s, kind).toContain(`data-testid="pin-kind-${kind}">${name}</button>`);
    expect(s).toContain('aria-pressed="true" data-testid="pin-kind-lead"');
    expect(s.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(s).toContain('Pins show in the Existing view only.');
  });
});
