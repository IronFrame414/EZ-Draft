import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVENTS, isRegisteredEvent } from './registry';

const WEBHOOK = [
  'plan_set.issued',
  'selection.approved',
  'revision.created',
  'change_order.sent',
  'takeoff.updated',
  'model.exported',
  'field_task.completed',
  'field.conflict_flagged',
  'client.commented',
  'customer.synced',
  'user.synced',
  'render_allowance.refilled',
];
const INTERNAL = [
  'lock.acquired',
  'lock.released',
  'lock.requested',
  'lock.auto_released',
  'lock.request_declined',
  'lock.conflict',
  'model.saved',
  'import.completed',
  'import.ready',
  'reference.version_uploaded',
  'render.completed',
  'render.failed',
  'render.approved',
  'render.client_ready',
  'render.rejected',
  'render.model_changed',
  'render.outdated',
  'render.hidden_from_client',
  'translation.created',
  'translation.approved',
  'field.measurement_submitted',
  'field.measurement_approved',
  'field.measurement_rejected',
  'field.measure_sent',
  'field_pack.issued',
  'share_link.expiring',
  'cleanup.due',
  'code_check.completed',
  'design_option.created',
  'design_option.updated',
  'version.sent',
  'version.snapshot_named',
  'version.reverted',
  'cleanup.deleted',
];
const LOG_ONLY = ['catalog_item.created', 'detail.placed'];

const kindOf = (n: string) => (EVENTS as Record<string, { kind: string }>)[n]?.kind;
const keys = () => Object.keys(EVENTS);
const keysOfKind = (k: string) => keys().filter((n) => kindOf(n) === k);

describe('EZD-022 event registry', () => {
  it('T1 registry holds every Hooks name @smoke', () => {
    expect(WEBHOOK).toHaveLength(12);
    expect(INTERNAL).toHaveLength(34);
    for (const n of WEBHOOK) expect(kindOf(n), n).toBe('webhook');
    for (const n of INTERNAL) expect(kindOf(n), n).toBe('internal');
    for (const n of LOG_ONLY) expect(kindOf(n), n).toBe('log_only');
    const listed = new Set([...WEBHOOK, ...INTERNAL, ...LOG_ONLY]);
    for (const n of keys().filter((k) => !listed.has(k))) expect(kindOf(n), n).toBe('log_only');
  });

  it('T2 name format @smoke', () => {
    for (const n of keys()) {
      expect(n).toMatch(/^[a-z][a-z_]*\.[a-z][a-z_]*$/);
      expect(n).not.toMatch(/[\\* A-Z]/);
    }
  });

  it('T3 kinds', () => {
    expect(new Set(keysOfKind('webhook'))).toEqual(new Set(WEBHOOK));
    expect(new Set(keysOfKind('internal'))).toEqual(new Set(INTERNAL));
    for (const n of LOG_ONLY) expect(keysOfKind('log_only')).toContain(n);
  });

  it('T10 isRegisteredEvent', () => {
    expect(isRegisteredEvent('lock.acquired')).toBe(true);
    expect(isRegisteredEvent('catalog_item.created')).toBe(true);
    for (const n of ['lock.*', '', 'toString', 'constructor', 'lock.request\\_declined']) {
      expect(isRegisteredEvent(n), n).toBe(false);
    }
  });

  it('T11 conventions recorded in docs/architecture.md', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const lines = readFileSync(path.join(root, 'docs/architecture.md'), 'utf8').split('\n');
    let fenced = false;
    const headings: Array<{ text: string; index: number }> = [];
    lines.forEach((l, index) => {
      if (l.startsWith('```')) fenced = !fenced;
      else if (!fenced && l.startsWith('## ')) headings.push({ text: l.trim(), index });
    });
    // (a) "### Events" sits inside "## Folder layout".
    const layout = headings.findIndex((h) => h.text === '## Folder layout');
    expect(layout).toBeGreaterThanOrEqual(0);
    const section = lines.slice(headings[layout].index, headings[layout + 1].index);
    expect(section).toContain('### Events');
    // (b) Machine checks row for EZD-022 names registry-usage.test.ts.
    const mc = headings.findIndex((h) => h.text === '## Machine checks');
    expect(mc).toBeGreaterThanOrEqual(0);
    const end = headings[mc + 1]?.index ?? lines.length;
    const rows = lines
      .slice(headings[mc].index, end)
      .filter((l) => l.trim().startsWith('|'))
      .map((l) =>
        l
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim()),
      );
    const row = rows.find((c) => c[c.length - 1] === 'EZD-022');
    expect(row, 'a Machine checks row whose last cell is EZD-022').toBeDefined();
    expect(row![row!.length - 2]).toContain('registry-usage.test.ts');
    // (c) the 13 required headings, in order.
    expect(headings.map((h) => h.text)).toEqual([
      '## Runtime',
      '## Named tools',
      '## Stack',
      '## Dependencies',
      '## Adding a dependency',
      '## Folder layout',
      '## Server-only data access and can()',
      '## Migrations',
      '## Errors and logging',
      '## Storage buckets and paths',
      '## Tests',
      '## Handoff',
      '## Machine checks',
    ]);
  });
});
