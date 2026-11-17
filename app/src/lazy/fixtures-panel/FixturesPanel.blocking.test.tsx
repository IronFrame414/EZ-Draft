// EZD-227 (AC-EZD-227-3; Q-0704 "Grab-bar blocking height and length are required and positive and have no default";
// 09q Blocking row 3; vault/build/assumptions.md EZD-227 wording): the panel lists Grab-bar blocking under Blocking,
// and its Length and Height to centre boxes start empty.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { blockingChoice, fixtureChoice } from '../../editor/tools/fixture-tool';
import { FixturesPanel } from './FixturesPanel';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );

describe('EZD-227 Fixtures panel grab-bar blocking', () => {
  it('lists Grab-bar blocking, pressed when chosen, with empty Length and Height to centre', () => {
    const s = html(<FixturesPanel choice={blockingChoice()} onChoose={() => {}} />);
    expect(s).toContain('Grab-bar blocking');
    expect(s).toContain('aria-pressed="true" data-testid="fixture-kind-blocking"');
    expect(s.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(s).toContain('Height to centre');
    expect(s).toMatch(/data-testid="blocking-length" value=""/);
    expect(s).toMatch(/data-testid="blocking-height" value=""/);
  });

  it('shows no blocking fields while a fixture is chosen', () => {
    const s = html(<FixturesPanel choice={fixtureChoice('toilet')} onChoose={() => {}} />);
    expect(s).toContain('aria-pressed="false" data-testid="fixture-kind-blocking"');
    expect(s).not.toContain('data-testid="blocking-length"');
  });
});
