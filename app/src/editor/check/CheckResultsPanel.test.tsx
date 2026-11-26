// EZD-612 (S06 Check "each warning with rule, NEC reference, device, and Go to"; phase-06 EZD-612 row: the three
// groups, the code and section, the link, the not-yet-verified tag and the closing line; AC-EZD-612-2 both warnings in
// one list; AC-EZD-612-3 the stored note shows and the open count drops). Static markup in the office messages; the
// clicks are in app/e2e/code-check.spec.ts. Wording: assumptions EZD-612.
import type { CheckResult } from '@ezdraft/geometry';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { CheckPill } from './CheckPill';
import { CheckResultsPanel, type CheckResultsPanelProps } from './CheckResultsPanel';
import type { CodeCheckRun } from './check-status';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
const r = (ruleId: string, objectId: string, over: Partial<CheckResult> = {}): CheckResult => ({
  ruleId,
  code: 'company',
  edition: 'fbc9_nec2023',
  section: null,
  url: null,
  type: 'automatic',
  status: 'fail',
  severity: 'warning',
  objectId,
  objectType: 'device',
  unverified: true,
  ...over,
});
const RUN: CodeCheckRun = {
  runId: 'run-1',
  edition: 'fbc9_nec2023',
  createdAt: '2026-11-25T15:41:00.000Z',
  results: [
    r('BC-001', 'toilet', {
      objectType: 'fixture',
      values: { fixture: 'toilet', measured: 14.5, required: 15 },
    }),
    r('FC-001', 'fan', { values: { against: 'wall', measured: 14, required: 18 } }),
    r('BC-004', 'shower', { status: 'cannot_check', need: 'Minimum shower area' }),
    r('R3-015', 'room', {
      code: 'FBC-R',
      section: 'R314.3',
      url: 'https://codes.iccsafe.org/',
      status: 'reminder',
      type: 'reminder',
      unverified: false,
    }),
  ],
  accepted: [],
};
const noop = () => {};
const props = (over: Partial<CheckResultsPanelProps> = {}): CheckResultsPanelProps => ({
  status: 'ready',
  run: RUN,
  changedSinceRun: false,
  canRun: true,
  canAccept: true,
  objectName: (id) =>
    ({ toilet: 'Toilet', fan: 'Ceiling fan', shower: 'Shower', room: 'Bath 2' })[id] ?? null,
  onGoTo: noop,
  onRun: noop,
  onAccept: async () => true,
  onClose: noop,
  ...over,
});
const items = (html: string, group: string) =>
  [
    ...(
      new RegExp(
        `data-testid="check-group-${group}"(.*?)(?=data-testid="check-group-|<p class="[^"]*closing)`,
      ).exec(html)?.[1] ?? ''
    ).matchAll(/data-rule-id="([A-Z0-9-]+)"/g),
  ].map((m) => m[1]);

describe('EZD-612 results list', () => {
  it('AC-EZD-612-2 the bath and fan clearance warnings are in the same Warnings list, each with Go to', () => {
    const html = render(<CheckResultsPanel {...props()} />);
    expect(items(html, 'warnings')).toEqual(['BC-001', 'FC-001']);
    expect(items(html, 'needs_value')).toEqual(['BC-004']);
    expect(items(html, 'checklist')).toEqual(['R3-015']);
    expect(html.match(/data-testid="check-go-to"/g)).toHaveLength(4);
    expect(html).toContain('Side clearance');
    expect(html).toContain('Fan blade clearance');
    expect(html).toContain('· Ceiling fan');
    expect(html).toContain('Company rule');
    expect(html).toContain('Edition: FBC 9th ed. · NEC 2023');
    expect(html).toMatch(/data-testid="check-open-count"[^>]*>2</);
  });

  it('shows the measure, the missing value, the code and section with its link, and the tag', () => {
    const html = render(<CheckResultsPanel {...props()} />);
    // 14 1/2" against 15", shown as the plan shows lengths (Q-0207: feet and inches).
    expect(html).toMatch(/1(&#x27;|') 2 1\/2(&quot;|") measured; 1(&#x27;|') 3(&quot;|") needed/);
    expect(html).toContain('Minimum shower area not set in Defaults');
    expect(html).toMatch(/<a[^>]*href="https:\/\/codes.iccsafe.org\/"[^>]*>FBC-R R314.3<\/a>/);
    expect(html.match(/data-testid="check-unverified"/g)).toHaveLength(3);
    expect(html).toContain(
      'Not checked by EZ Draft: structural and wind design, plumbing pipe sizing and venting, gas piping, mechanical duct sizing, energy envelope calculations and flood requirements.',
    );
  });

  it('Accept with note is offered on open warnings with Edit model only', () => {
    expect(
      render(<CheckResultsPanel {...props()} />).match(/data-testid="check-accept"/g),
    ).toHaveLength(2);
    expect(render(<CheckResultsPanel {...props({ canAccept: false })} />)).not.toContain(
      'data-testid="check-accept"',
    );
  });

  it('AC-EZD-612-3 an accepted warning shows its note and who accepted it, and leaves the open count', () => {
    const run: CodeCheckRun = {
      ...RUN,
      accepted: [
        {
          ruleId: 'FC-001',
          objectId: 'fan',
          edition: 'fbc9_nec2023',
          note: 'Low-profile fan; owner accepts.',
          by: 'u1',
          byName: 'Josh Bishop',
          at: '2026-11-25T16:00:00.000Z',
          objectSeq: 3,
        },
      ],
    };
    const html = render(<CheckResultsPanel {...props({ run })} />);
    expect(html).toMatch(/data-rule-id="FC-001"[^>]*data-accepted="true"/);
    expect(html).toContain('Low-profile fan; owner accepts.');
    expect(html).toContain('Accepted by Josh Bishop 11/25/2026');
    expect(html).toMatch(/data-testid="check-open-count"[^>]*>1</);
    expect(html.match(/data-testid="check-accept"/g)).toHaveLength(1);
  });

  it('the pill reads the last run, and Check not run after a change', () => {
    expect(render(<CheckPill run={RUN} changedSinceRun={false} onOpen={noop} />)).toMatch(
      /data-state="warnings".*Last check \d{1,2}:41 [AP]M · 2 warnings/,
    );
    expect(render(<CheckPill run={RUN} changedSinceRun onOpen={noop} />)).toMatch(
      /data-state="not_run".*Check not run/,
    );
    expect(
      render(<CheckPill run={{ ...RUN, results: [] }} changedSinceRun={false} onOpen={noop} />),
    ).toMatch(/data-state="pass".*No warnings/);
  });
});
