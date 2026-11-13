// EZD-109 (vault/plans/EZD-109.md section 3 `EventLogWrite`; test W2): every event_log writer call in the
// migrations, so a `transaction` event cannot lose its SQL writer and a `sink` event cannot gain one (two rows
// for one change). Reads every *.sql file directly in `migrationsDir`, by name. Comments are blanked first.
// A mention it cannot read as `private.write_event_log[_as](<'literal'> | <identifier>, …` is reported as
// `unreadable`, so W2 fails closed. File-system errors are thrown unchanged.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type EventLogWrite = {
  file: string;
  line: number;
  fn: 'write_event_log' | 'write_event_log_as' | 'unreadable';
  action: string | null;
  argument: string;
};

// Blanks /* … */ blocks (newlines kept) and, on each line, everything from the first `--`.
function stripComments(text: string): string[] {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlocks.split('\n').map((l) => {
    const i = l.indexOf('--');
    return i === -1 ? l : l.slice(0, i);
  });
}

const NAME = /write_event_log/gi;
const DECLARATION = /function\s+("?private"?\.)?$/i;
const CALL = /^private\.(write_event_log(?:_as)?)\s*\(\s*(?:('[a-z0-9_.]+')|([a-z_][a-z0-9_]*))\s*[,)]/;

export function findEventLogWrites(migrationsDir: string): EventLogWrite[] {
  const files = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.sql'))
    .map((d) => d.name)
    .sort();
  const out: EventLogWrite[] = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(join(migrationsDir, file), 'utf8'));
    lines.forEach((text, i) => {
      for (const m of text.matchAll(NAME)) {
        const at = m.index;
        const before = text.slice(0, at);
        // The occurrence as written, from its schema prefix when there is one.
        const prefixed = /private\.$/.test(before) ? at - 'private.'.length : at;
        // `function private.` / `function "private".` lines declare, revoke, grant or comment on it.
        if (DECLARATION.test(before)) continue;
        const rest = text.slice(prefixed);
        const call = CALL.exec(rest);
        if (call && prefixed !== at) {
          const fn = call[1] as 'write_event_log' | 'write_event_log_as';
          if (call[2] !== undefined) {
            out.push({ file, line: i + 1, fn, action: call[2].slice(1, -1), argument: call[2] });
          } else {
            out.push({ file, line: i + 1, fn, action: null, argument: call[3] as string });
          }
          continue;
        }
        out.push({
          file,
          line: i + 1,
          fn: 'unreadable',
          action: null,
          argument: text.slice(at).trim().slice(0, 80),
        });
      }
    });
  }
  return out;
}
