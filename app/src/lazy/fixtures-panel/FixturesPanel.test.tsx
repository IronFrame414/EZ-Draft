// EZD-234 (AC-EZD-234-1, -2; Q-0704 05-screens "lists the fixtures and appliances in the fixture kind list. It has no
// Saved section"; S03 Validation). Markup through renderToStaticMarkup (L-020: the wrapper is MessagesProvider).
// Expected values: the 14 kinds of Q-0704 03-data-model, the four utility kinds, and lengths in the plan's
// feet-and-inches form (14" is 1' 2").
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { fixtureChoice, utilityChoice, type FixtureChoice } from '../../editor/tools/fixture-tool';
import { FixturesPanel, UtilitiesToMove } from './FixturesPanel';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const panel = (choice: FixtureChoice) =>
  html(<FixturesPanel choice={choice} onChoose={() => {}} />);

describe('EZD-234 Fixtures panel', () => {
  it('lists the 14 fixture kinds and 4 utility kinds, the chosen one pressed, and the Saved section EZD-233 adds', () => {
    const s = panel(fixtureChoice('toilet'));
    const names = [
      'Toilet',
      'Lavatory',
      'Tub',
      'Shower (prefab)',
      'Sink',
      'Cooktop',
      'Range',
      'Hood',
      'Refrigerator',
      'Dishwasher',
      'Disposal',
      'Washer',
      'Dryer',
      'Water heater',
      'Electric',
      'Gas',
      'Water',
      'Drain',
    ];
    for (const n of names) expect(s, n).toContain(`>${n}</button>`);
    expect(s.match(/<button/g)).toHaveLength(20); // EZD-227: plus Grab-bar blocking. EZD-226: plus the Tile shower button
    // EZD-233 (Q-0704 "EZD-233 adds that"; R26): the Saved section, still loading in static markup.
    expect(s).toContain('data-testid="saved-groups-section"');
    expect(s).toContain('aria-pressed="true" data-testid="fixture-kind-toilet"');
    expect(s.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('a fixture shows its width, depth and front direction; electric shows volts and amps', () => {
    const range = panel(fixtureChoice('range'));
    expect(range).toContain('Width');
    expect(range).toContain('value="2\' 6""');
    expect(range).toContain('Depth');
    expect(range).toContain('value="2\' 2""');
    expect(range).toContain('Front faces');
    expect(range).not.toContain('Volts');
    const electric = panel(utilityChoice('electric'));
    expect(electric).toContain('Volts');
    expect(electric).toContain('Amps');
    expect(electric).not.toContain('Width');
    const gas = panel(utilityChoice('gas'));
    expect(gas).not.toContain('Volts');
    expect(gas).not.toContain('Width');
  });

  it('the utilities-to-move card lists each point with its kind and distance', () => {
    const s = html(
      <UtilitiesToMove
        moved={[
          {
            fixtureId: 'f',
            utilities: [
              { pointId: 'a', kind: 'electric', distance: 14 },
              { pointId: 'b', kind: 'gas', distance: 3 },
            ],
          },
        ]}
        onClose={() => {}}
      />,
    );
    expect(s).toContain('Utilities to move');
    expect(s).toContain('Electric: 1\' 2" from the new position');
    expect(s).toContain('Gas: 3" from the new position');
    expect(s).toContain('>Close</button>');
  });
});
