// EZD-135b U6 (vault/plans/EZD-135b.md section 4; AC-EZD-135-2, AC-EZD-135-3; S15i System status and states
// boards). Expected values: the approved S15i wording (empty lines W3, W5, W7, W9; columns W7-W10, W38; backup
// labels W13-W19; drill W21, W22, W36); times and sizes by Decided "Times" and "Sizes" (UTC 15:04 is 3:04 PM;
// 7,340,032 bytes is 7.3 MB and 123,456,789 is 123.5 MB in decimal units); the pager shown only above 50 rows
// (Q-0664), range "{from}–{to} of {total}".
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../../lib/messages';
import type {
  BackupStatus,
  JobFailureRow,
  StatusPage,
  WebhookFailureRow,
} from '../../../lib/system-status/system-status';
import { catalogFor } from '../../../server/messages/catalog';
import { BackupsBody, DrillBody, JobFailuresBody, WebhookFailuresBody } from './StatusCards';

const html = (node: ReactNode) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {node}
    </MessagesProvider>,
  );

// The markup of the first element with the testid, from its open tag to its matching close tag (the unit
// project has no DOM).
function elementOf(markup: string, testId: string): string | null {
  const at = markup.indexOf(`data-testid="${testId}"`);
  if (at < 0) return null;
  const open = markup.lastIndexOf('<', at);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open))![1];
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = open + 1;
  let depth = 1;
  for (let m = re.exec(markup); m !== null; m = re.exec(markup)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return markup.slice(open, m.index + m[0].length);
  }
  return null;
}
const strip = (s: string) => s.replace(/<[^>]*>/g, '');
function textOf(markup: string, testId: string): string | null {
  const el = elementOf(markup, testId);
  return el === null ? null : strip(el);
}
function cells(markup: string, rowTestId: string): string[] {
  const row = elementOf(markup, rowTestId) ?? '';
  return Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), (m) => strip(m[1]));
}
function attrOf(markup: string, testId: string, attr: string): string | null {
  const el = elementOf(markup, testId);
  if (el === null) return null;
  const openTag = el.slice(0, el.indexOf('>') + 1);
  const m = new RegExp(`\\s${attr}(?:="([^"]*)")?[\\s>/]`).exec(openTag);
  return m === null ? null : (m[1] ?? '');
}

const page = <T,>(rows: T[], total: number, p = 1): StatusPage<T> => ({
  rows,
  total,
  page: p,
  pageSize: 50,
});
const JOB: JobFailureRow = {
  id: 'j1',
  kind: 'test',
  error: 'ezd135_probe_failed',
  attempts: 5,
  finishedAt: '2026-11-09T15:04:00Z',
};
const HOOK: WebhookFailureRow = {
  id: 'w1',
  title: 'project.updated: 500',
  ref: 'evt-1',
  occurrences: 3,
  lastSeenAt: '2026-11-09T15:04:00Z',
};
const NONE: BackupStatus = { files: null, dbDump: null, restoreDrill: null };
const FILLED: BackupStatus = {
  files: { finishedAt: '2026-11-09T07:30:00Z', bytesCopied: 7340032, location: null },
  dbDump: {
    finishedAt: '2026-11-08T08:10:00Z',
    bytesCopied: 123456789,
    location: 'db/20261108T080000Z',
  },
  restoreDrill: null,
};
const TZ = 'UTC';

describe('EZD-135b status cards', () => {
  it('U6 (a) empty', () => {
    const m =
      html(<JobFailuresBody data={page([], 0)} onPage={vi.fn()} timeZone={TZ} />) +
      html(<WebhookFailuresBody data={page([], 0)} onPage={vi.fn()} timeZone={TZ} />) +
      html(<BackupsBody data={NONE} timeZone={TZ} />) +
      html(<DrillBody data={NONE} timeZone={TZ} />);
    expect(textOf(m, 'system-status-jobs-empty')).toBe('No failed jobs in the last 30 days.');
    expect(textOf(m, 'system-status-webhooks-empty')).toBe('No failed webhook deliveries.');
    expect(textOf(m, 'system-status-backups-empty')).toBe('No off-site copy has finished yet.');
    expect(textOf(m, 'system-status-drill-empty')).toBe('No restore drill has run yet.');
    expect(m).not.toContain('<table');
    expect(m).not.toContain('-pager');
    expect(m).not.toContain('system-status-backup-files');
  });

  it('U6 (b) filled', () => {
    const jobs = html(<JobFailuresBody data={page([JOB], 1)} onPage={vi.fn()} timeZone={TZ} />);
    expect(cells(jobs, 'system-status-job-row')).toEqual([
      'Nov 9, 2026, 3:04 PM',
      'test',
      'ezd135_probe_failed',
      '5',
    ]);
    expect(jobs).toMatch(
      /<th[^>]*>Failed<\/th><th[^>]*>Kind<\/th><th[^>]*>Error<\/th><th[^>]*>Tries<\/th>/,
    );
    const hooks = html(
      <WebhookFailuresBody data={page([HOOK], 1)} onPage={vi.fn()} timeZone={TZ} />,
    );
    expect(cells(hooks, 'system-status-webhook-row')).toEqual([
      'Nov 9, 2026, 3:04 PM',
      'project.updated',
      '500',
    ]);
    expect(hooks).toMatch(/<th[^>]*>Failed<\/th><th[^>]*>Sent to<\/th><th[^>]*>Error<\/th>/);
    const b = html(<BackupsBody data={FILLED} timeZone={TZ} />);
    expect(textOf(b, 'system-status-backup-files')).toContain('Nightly file copyEvery night');
    expect(textOf(b, 'system-status-backup-files-finished')).toBe('Nov 9, 2026, 7:30 AM');
    expect(textOf(b, 'system-status-backup-files-size')).toBe('7.3 MB');
    expect(textOf(b, 'system-status-backup-files-location')).toBe('—');
    expect(textOf(b, 'system-status-backup-db-dump')).toContain('Weekly database dumpEvery Sunday');
    expect(textOf(b, 'system-status-backup-db-dump-finished')).toBe('Nov 8, 2026, 8:10 AM');
    expect(textOf(b, 'system-status-backup-db-dump-size')).toBe('123.5 MB');
    expect(textOf(b, 'system-status-backup-db-dump-location')).toBe('db/20261108T080000Z');
    expect(b).toMatch(/Finished[\s\S]*Size[\s\S]*Copied to/);
  });

  it('U6 (c) null codes show a dash', () => {
    const jobs = html(
      <JobFailuresBody data={page([{ ...JOB, error: null }], 1)} onPage={vi.fn()} timeZone={TZ} />,
    );
    expect(cells(jobs, 'system-status-job-row')[2]).toBe('—');
    const hooks = html(
      <WebhookFailuresBody
        data={page([{ ...HOOK, title: 'project.updated' }], 1)}
        onPage={vi.fn()}
        timeZone={TZ}
      />,
    );
    expect(cells(hooks, 'system-status-webhook-row')).toEqual([
      'Nov 9, 2026, 3:04 PM',
      'project.updated',
      '—',
    ]);
    const oneMissing = html(<BackupsBody data={{ ...FILLED, files: null }} timeZone={TZ} />);
    expect(textOf(oneMissing, 'system-status-backup-files-finished')).toBe('—');
    expect(textOf(oneMissing, 'system-status-backup-files-size')).toBe('—');
    expect(textOf(oneMissing, 'system-status-backup-db-dump-size')).toBe('123.5 MB');
  });

  it('U6 (d) drill succeeded', () => {
    const m = html(
      <DrillBody
        data={{
          ...NONE,
          restoreDrill: {
            finishedAt: '2026-11-01T12:00:00Z',
            bytesCopied: 0,
            location: 'db/20261025T080000Z',
            status: 'succeeded',
          },
        }}
        timeZone={TZ}
      />,
    );
    expect(textOf(m, 'system-status-drill-line')).toBe('RanNov 1, 2026, 12:00 PMPassed');
    expect(textOf(m, 'system-status-drill-passed')).toBe('Passed');
    expect(m).not.toContain('system-status-drill-failed');
  });

  it('U6 (e) drill failed', () => {
    const m = html(
      <DrillBody
        data={{
          ...NONE,
          restoreDrill: {
            finishedAt: '2026-11-01T12:00:00Z',
            bytesCopied: 0,
            location: null,
            status: 'failed',
          },
        }}
        timeZone={TZ}
      />,
    );
    expect(textOf(m, 'system-status-drill-line')).toBe('RanNov 1, 2026, 12:00 PMFailed');
    expect(textOf(m, 'system-status-drill-failed')).toBe('Failed');
    expect(m).not.toContain('system-status-drill-passed');
  });

  it('U6 (f) jobs pager at 51', () => {
    const rows = Array.from({ length: 50 }, (_, k) => ({ ...JOB, id: `j${k + 1}` }));
    const onPage = vi.fn();
    const m = html(<JobFailuresBody data={page(rows, 51)} onPage={onPage} timeZone={TZ} />);
    expect(textOf(m, 'system-status-jobs-range')).toBe('1–50 of 51');
    expect(attrOf(m, 'system-status-jobs-prev', 'disabled')).not.toBeNull();
    expect(attrOf(m, 'system-status-jobs-next', 'disabled')).toBeNull();
    expect(attrOf(m, 'system-status-jobs-prev', 'aria-label')).toBe('Previous page');
    expect(attrOf(m, 'system-status-jobs-next', 'aria-label')).toBe('Next page');
    expect(onPage).not.toHaveBeenCalled();
  });

  it('U6 (g) webhooks pager on the last page', () => {
    const m = html(
      <WebhookFailuresBody
        data={page([{ ...HOOK, id: 'w51' }], 51, 2)}
        onPage={vi.fn()}
        timeZone={TZ}
      />,
    );
    expect(textOf(m, 'system-status-webhooks-range')).toBe('51–51 of 51');
    expect(attrOf(m, 'system-status-webhooks-prev', 'disabled')).toBeNull();
    expect(attrOf(m, 'system-status-webhooks-next', 'disabled')).not.toBeNull();
  });

  it('U6 (h) no pager at 50', () => {
    const rows = Array.from({ length: 50 }, (_, k) => ({ ...JOB, id: `j${k + 1}` }));
    const m = html(<JobFailuresBody data={page(rows, 50)} onPage={vi.fn()} timeZone={TZ} />);
    expect(m.split('data-testid="system-status-job-row"').length - 1).toBe(50);
    expect(m).not.toContain('system-status-jobs-pager');
  });
});
