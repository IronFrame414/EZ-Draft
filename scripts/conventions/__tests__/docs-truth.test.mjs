// EZD-160 (vault/plans/EZD-160.md sections 3 and 4): docs/architecture.md, docs/runbook.md and the
// EZD-033 migration comment say only what is true. Each test reads the files fresh; a section is the
// text from its heading line to the next heading of the same or higher level.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const readDoc = (rel) => readFileSync(path.join(root, rel), 'utf8');
const arch = () => readDoc('docs/architecture.md');
const runbook = () => readDoc('docs/runbook.md');
const MIGRATION = 'supabase/migrations/20261020101101_create_unconfirmed_password_guard.sql';

const splitLines = (text) => text.split(/\r?\n/).map((l) => l.trimEnd());

// Throws when the heading is missing, so a renamed heading fails the test instead of passing on "".
function sectionText(doc, heading) {
  const lines = splitLines(doc);
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6}) /);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// The one line that starts with the given prefix; throws when there is none.
function lineStarting(text, prefix) {
  const found = splitLines(text).filter((l) => l.startsWith(prefix));
  if (found.length === 0) throw new Error(`no line starts with: ${prefix}`);
  return found[0];
}

describe('EZD-160 docs say only what is true', () => {
  it('EZD-160 T1 retired-column rule said once', () => {
    const s = sectionText(arch(), '### Release safety (EZD-023a)');
    assert.equal(s.split('covers its columns').length - 1, 1);
    assert.ok(s.includes('A retired table, view or materialized view covers its columns.'));
  });

  it('EZD-160 T2 no unsourced TypeScript date', () => {
    const s = sectionText(arch(), '## Dependencies');
    assert.equal(s.includes('shipped on 2026-10-18'), false);
    assert.ok(
      s.includes(
        "7.0.2 (the registry's `latest` on 2026-10-24, R-024) has a new compiler",
      ),
    );
  });

  it('EZD-160 T3 money rule names the cost-removal test', () => {
    const s = sectionText(arch(), '## Server-only data access and can()');
    const money = lineStarting(s, '- Money (03 rule 2; R26 R2):');
    assert.ok(
      money.endsWith(
        'The cost-removal acceptance test is built by EZD-133 (phase 3), and every ticket that adds a money field extends it (03 rule 2).',
      ),
    );
    assert.equal(money.includes('Client-link routes never touch money tables'), false);
  });

  it('EZD-160 T4 client-link rule complete', () => {
    const s = sectionText(arch(), '## Server-only data access and can()');
    const clientLink =
      '- Client link (03 rule 11; R26 R14): client pages are served only by server routes that resolve the token to its sent package and return an explicit list of fields with no money tables; files are private and served through short-lived signed links; only a hash of the token is stored; the comment and verify endpoints are rate-limited; the signer check stays as R24 #32, with five attempts per hour.';
    assert.ok(splitLines(s).includes(clientLink));
  });

  it('EZD-160 T5 Vercel source has a URL', () => {
    const s = sectionText(arch(), '### Password sign-in (EZD-033)');
    const vi = lineStarting(s, '  - (vi)');
    assert.ok(vi.includes('https://vercel.com/docs/headers/request-headers'));
    assert.equal(vi.includes('(Vercel request headers documentation;'), false);
  });

  it('EZD-160 T6 writer claims match the spike', () => {
    const s = sectionText(arch(), '### DXF (EZD-029)');
    assert.equal(s.includes('it has BLOCK and INSERT'), false);
    const after =
      'Recorded only (`spikes/EZD-029-dxf/src/write-room.mjs`): every written entity carries a handle (group 5); a LINE written with a colour carries group 62, and one written with a line weight carries no group 370. Not written or read back, only seen in the package\'s API: `addBlock` and `addInsert`, `addLinearDim`, `addPaperSpace` and 82 predefined hatch patterns besides SOLID; EZD-913 and EZD-911 prove what they use.';
    assert.ok(s.includes(after));
  });

  it('EZD-160 T7 runbook names the SDK settings to leave unset', () => {
    const s = sectionText(runbook(), '## AI providers (EZD-021)');
    const step8 =
      '8. **Names to leave unset.** Never add these names in Vercel, for Production or Preview: `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_LOG`, `ANTHROPIC_OPEN_TELEMETRY`, `ANTHROPIC_OPEN_TELEMETRY_PROPAGATION`, `ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE` and `ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES`. The Claude library EZ Draft uses reads them each time it calls Claude: the first adds its headers to every Claude request, the second makes the library write its own log lines, and the others change its tracing. EZ Draft passes the key and the address itself, so `ANTHROPIC_API_KEY` is the only `ANTHROPIC_` name to set.';
    assert.ok(s.includes(step8));
    const names = [
      'ANTHROPIC_CUSTOM_HEADERS',
      'ANTHROPIC_LOG',
      'ANTHROPIC_OPEN_TELEMETRY',
      'ANTHROPIC_OPEN_TELEMETRY_PROPAGATION',
      'ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE',
      'ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES',
    ];
    for (const name of names) assert.ok(s.includes(`\`${name}\``), `missing name ${name}`);
  });

  it('EZD-160 T8 guard migration comment matches the stack', () => {
    const text = readDoc(MIGRATION);
    const lines = splitLines(text);
    assert.equal(text.includes('the pinned Auth stores null for a user without a password'), false);
    assert.ok(
      lines.includes(
        '-- null. The pinned Auth reads null as "no password"; the stack itself stores a bcrypt hash even for a',
      ),
    );
    assert.ok(
      lines.includes(
        '-- code-only user, so the guard writes the one value null for every unconfirmed row.',
      ),
    );
    assert.ok(text.includes('new.encrypted_password := null;'));
    assert.ok(text.includes('before insert or update on auth.users'));
  });
});
