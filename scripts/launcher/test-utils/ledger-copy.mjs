// EZD-250 fixture: a temporary copy of vault/ with a fixed phase 1 state, the scripts/ledger/priority.test.mjs before() pattern.
// Every phase 1 ticket that is not done is blocked (a blocked row needs a note), no open question row, no ticket in flight,
// and the given synthetic phase 1 tickets (numbered above every real ticket) are added. The result never depends on where
// the live ledger stands.
import { cpSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { repo, mkTmp } from './harness.mjs';

// synthetic: [[id, status]]. phaseZeroDone: every phase 0 ticket that is not done (EZD-003 is blocked in the live ledger) is set done, so
// the lowest open phase is phase 1 and next_ticket.mjs reaches the phase 1 gate. Returns helpers over the copy; dir is its root (the parent of vault/).
export function makeLedgerCopy({ synthetic = [], phaseZeroDone = false } = {}) {
  const dir = mkTmp('ezd250-ledger-');
  const vault = path.join(dir, 'vault');
  const file = (rel) => path.join(vault, rel);
  cpSync(path.join(repo, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(repo, 'docs', 'architecture.md'), path.join(dir, 'docs', 'architecture.md'));
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/LAUNCHER_FIX.md']) if (existsSync(file(f))) rmSync(file(f));
  const tool = (name, args, env = {}) => spawnSync(process.execPath, [file(`tools/${name}`), ...args], { encoding: 'utf8', cwd: dir, env: { ...process.env, ...env } });
  const tickets = () => JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
  const setTickets = (data) => writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');
  const setStatus = (id, st) =>
    writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').replace(new RegExp(`^(\\| ${id} \\|[^|]*\\|[^|]*\\| )[a-z-]+( \\|)`, 'm'), `$1${st}$2`));

  const data = tickets();
  for (const t of data.tickets) delete t.priority;
  writeFileSync(
    file('questions/QUESTIONS.md'),
    readFileSync(file('questions/QUESTIONS.md'), 'utf8').replace(/^(\|\s*Q-\d{4}\s*\|[^|]*\|[^|]*\|[^|]*\|\s*)open(\s*\|)/gm, '$1answered-agent$2'),
  );
  const phase0 = new Set(data.tickets.filter((t) => t.phase === 0).map((t) => t.id));
  const phase1 = new Set(data.tickets.filter((t) => t.phase === 1).map((t) => t.id));
  const signedPhases = new Set(readFileSync(file('spec/SIGNOFF.md'), 'utf8').split(/\r?\n/).map((l) => l.match(/^\|\s*(\d+)\s*\|/)).filter(Boolean).map((m) => Number(m[1])));
  writeFileSync(
    file('tickets/STATUS.md'),
    readFileSync(file('tickets/STATUS.md'), 'utf8')
      .split('\n')
      .map((line) => {
        const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
        if (!m) return line;
        const c = m[2].split('|');
        const st = c[2].trim();
        if (phaseZeroDone && phase0.has(m[1]) && st !== 'done') c[2] = ' done ';
        else if (Number(c[0]) > 1 && signedPhases.has(Number(c[0])) && ['todo', 'planned', 'questions'].includes(st)) {
          // Later signed-off phases stay quiet (EZD-281 D3); unsigned phases are left alone.
          c[2] = ' blocked ';
          if (!c[7].trim()) c[7] = ' ezd-250 fixture ';
        }
        else if (phase1.has(m[1]) && st !== 'done') {
          c[2] = ' blocked ';
          if (!c[7].trim()) c[7] = ' ezd-250 test ';
        } else if (st === 'in-progress' || st === 'review') c[2] = ' ready ';
        return `| ${m[1]} |${c.join('|')}|`;
      })
      .join('\n'),
  );
  if (synthetic.length) {
    const model = data.tickets.find((t) => t.phase === 1);
    for (const [id] of synthetic) {
      data.tickets.push({ id, phase: 1, title: `EZD-250 test ${id}`, spec_files: model.spec_files, decisions: model.decisions, mockups: [], phase_file: 'tickets/phases/phase-01.md', depends_on: [], acs: [], architecture: [] });
    }
    setTickets(data);
    appendFileSync(file('tickets/STATUS.md'), synthetic.map(([id, st]) => `| ${id} | 1 | EZD-250 test ${id} | ${st} | ${st === 'ready' ? 'low' : ''} |  |  |  | Synthetic ticket of scripts/launcher/test-utils/ledger-copy.mjs. |\n`).join(''));
    appendFileSync(file('tickets/phases/phase-01.md'), '\n' + synthetic.map(([id]) => `| ${id} | EZD-250 test ${id} | The test passes. | — | — |\n`).join(''));
    const acs = tool('gen_acs.mjs', []);
    assert.equal(acs.status, 0, acs.stdout + acs.stderr);
  }
  const check = tool('next_ticket.mjs', ['--check']);
  assert.equal(check.status, 0, `fixture ledger check: ${check.stdout}${check.stderr}`);
  return { dir, vault, file, tool, setStatus };
}
