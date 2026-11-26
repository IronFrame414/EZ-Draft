// EZD-717 (AC-EZD-717-1; S13 Controls "Issue Rev n ... Result shows the PDF link with Copy link. Disabled while a gate
// is open. Hidden without Issue permit sets (Rev 0) or Issue revisions (Rev 1+)"; S13 States "Generating PDF:
// background job; Issue button shows progress until the PDF link appears"; board S13Sheets inspector "Issue Rev 1",
// "Copy link", "Revision log | Rev 0 | 09/29/26 | Permit set | Issued"): the Sheets inspector's Issue button and
// revision log, driven by the screen store against a stubbed API.
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

const PROJECT = '00000000-0000-4000-8000-000000000717';
const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const passing: IssueFacts = {
  sheets: NINE,
  titleBlockMissing: [],
  codeCheck: { state: 'run', at: '2026-09-29T14:00:00Z', open: 0, accepted: 0 },
  orphans: [],
  loadCalc: null,
  engineerLettersMissing: 0,
  rendersAwaiting: 0,
};
const checklistAnswer = (f: IssueFacts) => {
  const { loadCalc: _drop, ...rest } = f;
  void _drop;
  return { facts: { ...rest, edition: 'fbc9_nec2023' }, checklist: issueChecklist(f) };
};
const REV0 = {
  id: 'r0',
  revNo: 0,
  issuedAt: '2026-09-29T14:00:00Z',
  description: null,
  modelVersionId: '00000000-0000-4000-8000-0000000000a0',
  exportJobId: 'job-0',
};

type Api = {
  issue?: { revisions: unknown[]; nextRev: number; canIssue: boolean }[];
  post?: { status: number; body: unknown };
  pdf?: unknown[];
  checklist?: IssueFacts;
};

// Answers by URL; the issue GET and the PDF reads take their answers in order (the last one repeats).
function stubApi(api: Api) {
  const issue = [...(api.issue ?? [{ revisions: [], nextRev: 0, canIssue: true }])];
  const pdf = [...(api.pdf ?? [])];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/code-check?checklist=1')) return json(checklistAnswer(api.checklist ?? passing));
    if (url.endsWith('/sheet-sets')) return json({ sets: [] });
    if (url.endsWith('/issue') && init?.method === 'POST')
      return json(api.post?.body ?? {}, api.post?.status ?? 500);
    if (url.endsWith('/issue')) return json(issue.length > 1 ? issue.shift() : issue[0]);
    if (url.includes('/issue?rev=')) return json({ pdf: pdf.length > 1 ? pdf.shift() : pdf[0] });
    return new Response('{}', { status: 404 });
  });
}

const view = (screen: ReturnType<typeof createSheetsScreen>) =>
  html(<SheetsInspector screen={screen} reviewing={false} onReview={() => {}} />);
const text = (h: string, id: string) => textOf(elements(h, id)[0]?.inner ?? '');
const button = (h: string) => elements(h, 'issue-button')[0];
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('EZD-717 Issue button and revision log', () => {
  it('reads "Issue Rev 0" before any issue and is enabled once the checklist passes', async () => {
    const screen = createSheetsScreen(PROJECT, stubApi({}));
    await screen.load();
    await settle();
    const h = view(screen);
    expect(text(h, 'issue-button')).toBe('Issue Rev 0');
    expect(attr(button(h)!.attrs, 'disabled')).toBeNull();
    expect(text(h, 'revision-log')).toContain('No revisions issued yet.');
  });

  it('is disabled while a gate is open (an orphan flag)', async () => {
    const blocked = { ...passing, orphans: [{ objectId: '00000000-0000-4000-8000-0000000000d1', kind: 'not_on_wall' }] };
    const screen = createSheetsScreen(PROJECT, stubApi({ checklist: blocked as IssueFacts }));
    await screen.load();
    await settle();
    expect(attr(button(view(screen))!.attrs, 'disabled')).not.toBeNull();
  });

  it('is hidden without the permission the next revision needs', async () => {
    const screen = createSheetsScreen(
      PROJECT,
      stubApi({ issue: [{ revisions: [REV0], nextRev: 1, canIssue: false }] }),
    );
    await screen.load();
    await settle();
    const h = view(screen);
    expect(elements(h, 'issue-button')).toHaveLength(0);
    // The log still lists what was issued.
    expect(text(h, 'revision-0')).toBe('Rev 009/29/26Permit setIssued');
  });

  it('AC-EZD-717-1: issuing drains the outbox, shows progress, then the PDF link with Copy link, and offers Rev 1', async () => {
    const order: string[] = [];
    const fetchFn = stubApi({
      issue: [
        { revisions: [], nextRev: 0, canIssue: true },
        { revisions: [REV0], nextRev: 1, canIssue: true },
      ],
      post: { status: 201, body: { revNo: 0, jobId: 'job-0', modelVersionId: REV0.modelVersionId } },
      pdf: [
        { revNo: 0, status: 'running', progress: 40, file: null },
        { revNo: 0, status: 'done', progress: 100, file: { name: '336 Golfview Rd buildingplans Rev 0.pdf', url: 'x' } },
      ],
    });
    const waits: (() => void)[] = [];
    const screen = createSheetsScreen(PROJECT, fetchFn, {
      wait: () => new Promise<void>((r) => waits.push(r)),
      origin: () => 'https://ezdraft.example.test',
    });
    screen.setSync({
      flush: async () => {
        order.push('flush');
      },
      getState: () => ({ status: 'saved' }),
    });
    await screen.load();
    await settle();
    const issuing = screen.issue();
    // Wait for the first PDF read: the job is running at 40%.
    while (waits.length === 0) await settle();
    const during = view(screen);
    expect(text(during, 'issue-button')).toBe('Generating PDF · 40%');
    expect(attr(button(during)!.attrs, 'disabled')).not.toBeNull();
    expect(attr(elements(during, 'issue-progress')[0]!.attrs, 'value')).toBe('40');
    waits.shift()!();
    await issuing;
    await settle();

    const posts = fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(order).toEqual(['flush']);
    const done = view(screen);
    expect(text(done, 'issue-result')).toContain('Rev 0 issued');
    expect(text(done, 'issue-pdf-link')).toBe('336 Golfview Rd buildingplans Rev 0.pdf');
    expect(attr(elements(done, 'issue-pdf-link')[0]!.attrs, 'href')).toBe(
      `https://ezdraft.example.test/api/projects/${PROJECT}/issue?rev=0&download=1`,
    );
    expect(text(done, 'issue-copy-link')).toBe('Copy link');
    expect(text(done, 'issue-button')).toBe('Issue Rev 1');
    expect(text(done, 'revision-0')).toContain('Permit set');
  });

  it('does not issue while changes are still saving', async () => {
    const fetchFn = stubApi({});
    const screen = createSheetsScreen(PROJECT, fetchFn);
    screen.setSync({ flush: async () => {}, getState: () => ({ status: 'error' }) });
    await screen.load();
    await settle();
    await screen.issue();
    expect(fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(text(view(screen), 'issue-unsaved')).toBe('Changes are still saving. Issue again once they are saved.');
  });

  it('a gate the server found shows the blocked note', async () => {
    const screen = createSheetsScreen(
      PROJECT,
      stubApi({ post: { status: 409, body: { error: { code: 'issue_blocked' }, gates: ['code_check'] } } }),
    );
    await screen.load();
    await settle();
    await screen.issue();
    expect(text(view(screen), 'issue-blocked')).toBe('Red items block issue until they are fixed.');
    expect(screen.get().issue.run).toEqual({ kind: 'blocked', gates: ['code_check'] });
  });
});
