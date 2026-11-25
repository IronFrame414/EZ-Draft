// EZD-1314 (07 Hooks, Canonical names; AC-EZD-1314-1): the canonical event registry audit. Every name emitted
// in code (TypeScript emit calls and the event_log actions SQL functions write) is in the registry; every
// registry name has an emitter, a `later` mark naming a ticket in tickets.json, or a `notInV1` mark naming a
// decision; no name has both an emitter and a mark.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findEmittedEvents } from '../../../test-utils/events/find-emitted-events';
import { findEventLogWrites } from '../../../test-utils/events/find-event-log-writes';
import { EVENTS, isRegisteredEvent, type EventEntry } from './registry';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ROOTS = ['app/src', 'packages/*/src', 'worker/src'];
// The registry, its payload types and the emitter itself name every event without emitting it.
const SKIP = ['app/src/lib/events', 'app/src/server/events'];
// Files that call emit with a name held in a variable. The name is typed EventName, so typecheck keeps it
// registered; the literal it came from is read as a `name:` property. A new forwarder is added here on purpose.
const FORWARDERS = [
  'app/src/app/api/projects/[id]/objects/route.ts',
  'app/src/server/roles/role-route.ts',
  'app/src/server/submittal-profiles/route-helpers.ts',
  'app/src/server/users/member-route.ts',
];

function ticketIds(): Set<string> {
  const json = JSON.parse(readFileSync(path.join(ROOT, 'vault/tickets/tickets.json'), 'utf8')) as {
    tickets: Record<string, { id: string }> | Array<{ id: string }>;
  };
  return new Set(Object.values(json.tickets).map((t) => t.id));
}

function decisionIds(): Set<string> {
  const dir = path.join(ROOT, 'vault/spec/decisions');
  const ids = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/^\| (Q-\d{4}) \|/gm))
      ids.add(m[1]!);
  }
  return ids;
}

describe('EZD-1314 canonical event registry audit', () => {
  it('A1 the emitter scanner reads calls, name properties and forwarders', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd1314-'));
    try {
      const put = (rel: string, text: string) => {
        const p = path.join(dir, rel);
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, text);
      };
      put(
        'src/a.ts',
        [
          "emit('lock.acquired', p, c);",
          'await emitProfileEvent(',
          "  'submittal_profile.created',",
          '  p,',
          ');',
          "x.emit('dot.skipped');",
          "emit<'model.saved'>(`model.saved`, p, c);",
          'emit(e.name, p, c);',
          "const ev = { name: 'role.created', payload };",
          "const other = { name: 'error.company_name_required' };",
          'export async function emit<N extends EventName>(name: N) {}',
          "emitter('x.y'); emitFrame();",
          "emit('nope.never', p, c);",
        ].join('\n'),
      );
      put('src/a.test.ts', "emit('test.only', p, c);\n");
      put('src/lib/skipped.ts', "emit('cleanup.due', p, c);\n");
      put('node_modules/x/d.ts', "emit('dep.bad', p, c);\n");
      const found = findEmittedEvents(dir, ['.'], isRegisteredEvent, { skipPaths: ['src/lib'] });
      expect(found.emitted).toEqual([
        { file: 'src/a.ts', line: 1, name: 'lock.acquired', via: 'call' },
        { file: 'src/a.ts', line: 3, name: 'submittal_profile.created', via: 'call' },
        { file: 'src/a.ts', line: 7, name: 'model.saved', via: 'call' },
        { file: 'src/a.ts', line: 9, name: 'role.created', via: 'name_property' },
        { file: 'src/a.ts', line: 13, name: 'nope.never', via: 'call' },
      ]);
      expect(found.forwarders).toEqual([{ file: 'src/a.ts', line: 8, callee: 'emit' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('AC-EZD-1314-1 every emitted name is registered and every registry name has an emitter or a mark @smoke', () => {
    const ts = findEmittedEvents(ROOT, ROOTS, isRegisteredEvent, { skipPaths: SKIP });
    const sql = findEventLogWrites(path.join(ROOT, 'supabase/migrations'));

    // Forwarders are pinned; a new one fails here until it is added above.
    expect([...new Set(ts.forwarders.map((f) => f.file))].sort()).toEqual(FORWARDERS);
    // The scan reaches the known emitters (guards against a scan that silently reads nothing).
    expect(ts.emitted.map((e) => e.name)).toEqual(
      expect.arrayContaining(['model.saved', 'role.created']),
    );
    expect(sql.map((w) => w.action)).toEqual(
      expect.arrayContaining(['lock.acquired', 'project.deleted']),
    );

    // 1. Every name emitted in code is in the registry.
    const unregistered = [
      ...ts.emitted
        .filter((e) => !isRegisteredEvent(e.name))
        .map((e) => `${e.file}:${e.line} ${e.name}`),
      ...sql
        .filter((w) => w.action !== null && !isRegisteredEvent(w.action))
        .map((w) => `supabase/migrations/${w.file}:${w.line} ${w.action}`),
    ];
    expect(unregistered).toEqual([]);

    // 2. Every registry name has exactly one of: an emitter, a `later` ticket, a `notInV1` decision.
    const emitted = new Set<string>([
      ...ts.emitted.map((e) => e.name),
      ...sql.flatMap((w) => (w.action === null ? [] : [w.action])),
    ]);
    const tickets = ticketIds();
    const decisions = decisionIds();
    const problems: string[] = [];
    for (const [name, entry] of Object.entries(EVENTS as Record<string, EventEntry>)) {
      const has = emitted.has(name);
      if (has && entry.later !== undefined)
        problems.push(`${name}: emitted and marked later ${entry.later}`);
      if (has && entry.notInV1 !== undefined)
        problems.push(`${name}: emitted and marked notInV1 ${entry.notInV1}`);
      if (entry.later !== undefined && entry.notInV1 !== undefined)
        problems.push(`${name}: both later and notInV1`);
      if (!has && entry.later === undefined && entry.notInV1 === undefined)
        problems.push(`${name}: no emitter and no mark`);
      if (entry.later !== undefined && !tickets.has(entry.later)) {
        problems.push(
          `${name}: later ${entry.later} is not a ticket in vault/tickets/tickets.json`,
        );
      }
      if (entry.notInV1 !== undefined && !decisions.has(entry.notInV1)) {
        problems.push(
          `${name}: notInV1 ${entry.notInV1} is not a decision in vault/spec/decisions`,
        );
      }
    }
    expect(problems).toEqual([]);
  });
});
