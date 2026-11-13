// EZD-109 W1, W2 (vault/plans/EZD-109.md section 4; Decided "SQL-writer drift check"): every event_log writer
// call in the migrations names a `transaction` event, and every `transaction` event has one. One row per
// change, never two (Q-0695 decisions 03 row 33: same-transaction events are not written again by the sink).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEventLogWrites } from '../../../test-utils/events/find-event-log-writes';
import { EVENT_LOG } from './event-log';

const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations');

describe('EZD-109 event_log SQL writers', () => {
  it('W1 the writer scanner reads SQL calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ezd109-'));
    try {
      const line1 =
        "perform private.write_event_log('user_permission.updated', 'membership', v_id, '{}', p_ip);";
      writeFileSync(
        join(dir, 'a.sql'),
        [
          line1,
          "-- perform private.write_event_log('x.commented', 'tenant', t, '{}', null);",
          'create function private.write_event_log(p_action text) returns void',
          'revoke all on function private.write_event_log_as(text, uuid) from public;',
          "/* private.write_event_log('y.block') */",
          "perform private.write_event_log_as(v_name, t, null, 'tenant', t, '{}', null);",
          "perform private.write_event_log_as( 'lock.auto_released', t, null, 'project', p, '{}', null);",
          "select 1; -- private.write_event_log('z.after_code')",
          'perform "private"."write_event_log"(\'q.quoted\', \'tenant\', t, \'{}\', null);',
          "perform PRIVATE.WRITE_EVENT_LOG('u.upper', 'tenant', t, '{}', null);",
          'perform private.write_event_log(',
          "  'n.next_line', 'tenant', t, '{}', null);",
          "perform private.write_event_log(E'e.escaped', 'tenant', t, '{}', null);",
        ].join('\n'),
      );
      writeFileSync(join(dir, 'b.txt'), line1);
      const found = findEventLogWrites(dir);
      expect(found.slice(0, 3)).toEqual([
        {
          file: 'a.sql',
          line: 1,
          fn: 'write_event_log',
          action: 'user_permission.updated',
          argument: "'user_permission.updated'",
        },
        { file: 'a.sql', line: 6, fn: 'write_event_log_as', action: null, argument: 'v_name' },
        {
          file: 'a.sql',
          line: 7,
          fn: 'write_event_log_as',
          action: 'lock.auto_released',
          argument: "'lock.auto_released'",
        },
      ]);
      const rest = found.slice(3);
      expect(rest.map((w) => [w.file, w.line, w.fn, w.action])).toEqual([
        ['a.sql', 9, 'unreadable', null],
        ['a.sql', 10, 'unreadable', null],
        ['a.sql', 11, 'unreadable', null],
        ['a.sql', 13, 'unreadable', null],
      ]);
      for (const w of rest) expect(w.argument.toLowerCase()).toMatch(/^write_event_log/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('W2 every SQL writer names a transaction event @smoke', () => {
    const writes = findEventLogWrites(MIGRATIONS);
    expect(writes.filter((w) => w.fn === 'unreadable')).toEqual([]);
    for (const w of writes) {
      if (w.action !== null) {
        const rule = (EVENT_LOG as Record<string, { mode: string } | undefined>)[w.action];
        expect(rule?.mode, `${w.file}:${w.line} ${w.action}`).toBe('transaction');
      } else {
        expect(w.argument, `${w.file}:${w.line}`).toBe('p_action');
        expect(w.file, `${w.file}:${w.line}`).toMatch(/_create_event_log_functions\.sql$/);
      }
    }
    const actions = new Set(writes.map((w) => w.action));
    for (const [name, rule] of Object.entries(EVENT_LOG)) {
      if (rule.mode === 'transaction') expect(actions.has(name), name).toBe(true);
    }
    expect([...actions]).toContain('user.joined');
    expect([...actions]).toContain('user_permission.updated');
  });
});
