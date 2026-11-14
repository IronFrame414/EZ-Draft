// EZD-226 (S03 Fixtures "custom tile showers with curb, niche, bench, glass, pan slope and drain type"; AC-EZD-226-1,
// -2; vault/build/assumptions.md EZD-226). Expected values: the starting shower is 60" x 36" (5' 0" x 3' 0"), a 4"
// curb, 0 niches, a center drain and 1/4" per ft (P-045 default); an empty curb height is curbless.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { tileShowerChoice, type FixtureChoice } from '../../editor/tools/fixture-tool';
import { FixturesPanel } from './FixturesPanel';

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

describe('EZD-226 Fixtures panel tile shower', () => {
  it('lists Tile shower under Custom tile showers, pressed when chosen, with its fields', () => {
    const s = panel(tileShowerChoice());
    expect(s).toContain('Custom tile showers');
    expect(s).toContain('aria-pressed="true" data-testid="fixture-kind-tile_shower"');
    expect(s.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(s).toContain('data-testid="tile-shower-fields"');
    expect(s).toContain('value="5\' 0""');
    expect(s).toContain('value="3\' 0""');
    for (const label of [
      'Front faces',
      'Curb height',
      'Curb width',
      'Niches',
      'Drain',
      'Pan slope (per ft)',
    ])
      expect(s, label).toContain(label);
    expect(s).toContain('data-testid="shower-curb-height" value="4""');
    expect(s).toContain('data-testid="shower-pan-slope" value="1/4""');
    expect(s).toContain('>Center</option>');
    expect(s).toContain('>Linear</option>');
  });

  it('niche size shows with niches; bench and glass sizes show when turned on; a door shows its swing', () => {
    const start = tileShowerChoice() as Extract<FixtureChoice, { type: 'tile_shower' }>;
    const none = panel(start);
    expect(none).not.toContain('shower-niche-width');
    expect(none).not.toContain('shower-bench-width');
    expect(none).not.toContain('shower-glass-length');
    for (const label of [
      'Bench',
      'Glass',
      '>None</option>',
      '>Fixed panel</option>',
      '>Door</option>',
    ])
      expect(none, label).toContain(label);
    const all = panel({
      ...start,
      nicheCount: 1,
      bench: { width: 24, depth: 15, height: 18 },
      glass: { type: 'door', length: 30, swing: 'out' },
    });
    expect(all).toContain('data-testid="shower-niche-width" value="1\' 0""');
    expect(all).toContain('data-testid="shower-niche-height" value="2\' 0""');
    expect(all).toContain('data-testid="shower-niche-bottom" value="4\' 0""');
    expect(all).toContain('data-testid="shower-bench-width" value="2\' 0""');
    expect(all).toContain('data-testid="shower-bench-depth" value="1\' 3""');
    expect(all).toContain('data-testid="shower-bench-height" value="1\' 6""');
    expect(all).toContain('data-testid="shower-glass-length" value="2\' 6""');
    expect(all).toContain('data-testid="shower-glass-swing"');
    expect(all).toContain('>Out</option>');
    expect(panel({ ...start, glass: { type: 'fixed', length: 30, swing: 'out' } })).not.toContain(
      'shower-glass-swing',
    );
  });

  it('a curbless choice shows an empty curb height', () => {
    const s = panel({
      ...(tileShowerChoice() as Extract<FixtureChoice, { type: 'tile_shower' }>),
      curb: null,
    });
    expect(s).toContain('data-testid="shower-curb-height" value=""');
  });

  it('a fixture choice shows no tile shower fields', () => {
    expect(panel({ type: 'utility', kind: 'gas', volts: 120, amps: 20 })).not.toContain(
      'tile-shower-fields',
    );
  });
});
