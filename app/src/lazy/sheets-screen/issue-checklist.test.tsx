// EZD-716 (AC-EZD-716-1 "An orphan 'Not on a wall' flag blocks Issue"; S13 Controls "Issue checklist row ... Green
// check, amber warning, red gate"; board S13Sheets inspector wording "Issue checklist", "No red / orphan flags",
// "0 open on 10 sheets", "Code check reviewed", "Review"; phase-07 EZD-716 "Title block complete" with "Owner and
// parcel imported" in its detail line): the Sheets inspector's checklist, read from the issue-checklist route.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { issueChecklist, type IssueFacts } from '../../lib/sheets/issue-checklist';
import { createSheetsScreen } from './sheets-screen-store';
import { SheetsInspector } from './SheetsInspector';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const PROJECT = '00000000-0000-4000-8000-000000000716';
const TEN = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0'];

const facts: IssueFacts = {
  sheets: TEN,
  titleBlockMissing: [],
  codeCheck: { state: 'run', at: '2026-11-26T15:41:00Z', open: 0, accepted: 1 },
  orphans: [{ objectId: '00000000-0000-4000-8000-0000000000d1', kind: 'not_on_wall' }],
  loadCalc: { state: 'done', edition: 'fbc9_nec2023', serviceAmps: 200, pass: true },
  engineerLettersMissing: 0,
  rendersAwaiting: 2,
};

// The route's answer: the facts it reads (all but the load calc) and the rows it works out from them.
const answer = (f: IssueFacts) => {
  const { loadCalc: _drop, ...rest } = f;
  void _drop;
  return { facts: { ...rest, edition: 'fbc9_nec2023' }, checklist: issueChecklist(f) };
};

function stubFetch(body: unknown, status = 200) {
  return vi.fn(async (url: string) =>
    url.endsWith('/code-check?checklist=1')
      ? new Response(JSON.stringify(body), { status })
      : new Response('{}', { status: 404 }),
  );
}

const text = (h: string, id: string) => textOf(elements(h, id)[0]?.inner ?? '');
const status = (h: string, id: string) => attr(elements(h, id)[0]?.attrs ?? '', 'data-status');

describe('EZD-716 issue checklist in the Sheets inspector', () => {
  it('AC-EZD-716-1: an orphan Not on a wall flag shows as a red gate and the checklist says issue is blocked', async () => {
    const f = stubFetch(answer(facts));
    const screen = createSheetsScreen(PROJECT, f);
    await screen.load();
    await screen.reloadChecklist();
    expect(f).toHaveBeenCalledWith(`/api/projects/${PROJECT}/code-check?checklist=1`, { cache: 'no-store' });
    const h = html(<SheetsInspector screen={screen} reviewing={false} onReview={() => {}} />);
    expect(text(h, 'issue-checklist')).toContain('Issue checklist');
    expect(status(h, 'issue-check-orphan_flags')).toBe('gate');
    expect(text(h, 'issue-check-orphan_flags')).toContain('No red / orphan flags');
    expect(text(h, 'issue-check-orphan_flags')).toContain('1 open on 10 sheets');
    expect(elements(h, 'issue-check-orphan_flags-open')).toHaveLength(1);
    expect(text(h, 'issue-checklist-block')).toBe('Red items block issue until they are fixed.');
  });

  it('every gate clear: green rows, amber warnings, and warnings do not block', async () => {
    const screen = createSheetsScreen(PROJECT, stubFetch(answer({ ...facts, orphans: [] })));
    await screen.reloadChecklist();
    const h = html(<SheetsInspector screen={screen} reviewing={false} onReview={() => {}} />);
    expect(status(h, 'issue-check-title_block')).toBe('pass');
    expect(text(h, 'issue-check-title_block')).toContain('Title block complete');
    expect(text(h, 'issue-check-title_block')).toContain('Owner and parcel imported');
    expect(status(h, 'issue-check-code_check')).toBe('pass');
    expect(text(h, 'issue-check-code_check')).toContain('Code check reviewed');
    expect(elements(h, 'issue-check-code_check-review')).toHaveLength(1);
    expect(text(h, 'issue-check-orphan_flags')).toContain('0 open on 10 sheets');
    expect(text(h, 'issue-check-load_calc')).toContain('E2.0 · NEC 2023 · 200 A service OK');
    expect(status(h, 'issue-check-renders')).toBe('warning');
    expect(text(h, 'issue-check-renders')).toContain('2 renders awaiting approval');
    expect(text(h, 'issue-checklist-block')).toBe('Warnings will not block issue.');
  });

  it('a failed read says so', async () => {
    const screen = createSheetsScreen(PROJECT, stubFetch({ error: {} }, 500));
    await screen.reloadChecklist();
    const h = html(<SheetsInspector screen={screen} reviewing={false} onReview={() => {}} />);
    expect(text(h, 'issue-checklist-load')).toBe('The checklist could not load.');
  });

  // phase-07 EZD-716 "Load calc complete only when the set contains E2.0": with the model shown, the row comes from
  // the live model's main panel; a model with no panel has no load calc, a red gate.
  it('the load calc row is worked out from the live model: no panel is a red gate', async () => {
    const screen = createSheetsScreen(PROJECT, stubFetch(answer({ ...facts, orphans: [], loadCalc: null })));
    screen.setModel({ getState: () => ({ objects: new Map() }), subscribe: () => () => {} });
    await screen.reloadChecklist();
    const h = html(<SheetsInspector screen={screen} reviewing={false} onReview={() => {}} />);
    expect(status(h, 'issue-check-load_calc')).toBe('gate');
    expect(text(h, 'issue-check-load_calc')).toContain('E2.0 · no load calc yet');
    expect(screen.get().checklist?.blocked).toBe(true);
  });
});
