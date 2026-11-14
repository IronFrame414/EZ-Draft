// EZD-421 (Q-0753 (a); AC-EZD-421-1): every session route under app/api whose catch reports a failure and
// answers 500 first asks the shared ended-session rule (server/auth/ended-session.ts), so an ended session
// answers 401 with no report. Static walk over the route files and the two shared write runners. Outside the
// class by name: /api/health and /api/monitoring (no session) and /api/jobs/sweep (cron secret, no session).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../..');
const NO_SESSION = ['health', 'monitoring', path.join('jobs', 'sweep')].map((d) => path.join(here, d));
const SHARED_RUNNERS = ['server/roles/role-route.ts', 'server/users/member-route.ts'].map((f) =>
  path.join(src, f),
);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return routeFiles(p);
    return d.name === 'route.ts' ? [p] : [];
  });
}

// A report of the caught error: reportRouteFailure(x, ...) or reportError(x, ...) with x a bare identifier.
const REPORT = /^(\s*)await (?:reportRouteFailure|reportError)\((\w+), /;

// The lines of `text` that report a caught error without the guard right above them.
function unguardedReports(text: string): number[] {
  const lines = text.split('\n');
  const bad: number[] = [];
  lines.forEach((line, i) => {
    const m = REPORT.exec(line);
    if (!m) return;
    const v = m[2];
    const ok =
      lines[i - 2]?.trim() === `const ended = await endedSessionResponse(${v});` &&
      lines[i - 1]?.trim() === 'if (ended) return ended;';
    if (!ok) bad.push(i + 1);
  });
  return bad;
}

describe('EZD-421 route walker: the ended-session rule comes before every route report', () => {
  it('W1 a report without the guard is found; the guarded form passes', () => {
    const unguarded = [
      '  } catch (e) {',
      '    await reportRouteFailure(e, ROUTE);',
      "    return fail(500, 'db_unavailable');",
    ].join('\n');
    expect(unguardedReports(unguarded)).toEqual([2]);
    const guarded = [
      '  } catch (e) {',
      '    const ended = await endedSessionResponse(e);',
      '    if (ended) return ended;',
      '    await reportRouteFailure(e, ROUTE);',
      "    return fail(500, 'db_unavailable');",
    ].join('\n');
    expect(unguardedReports(guarded)).toEqual([]);
    const otherVar = [
      '    const ended = await endedSessionResponse(e);',
      '    if (ended) return ended;',
      "    await reportError(err, { source: 'function', location: 'api.x' });",
    ].join('\n');
    expect(unguardedReports(otherVar)).toEqual([3]);
  });

  it('W2 every session route file and shared write runner guards each report of a caught error', () => {
    const files = [
      ...routeFiles(here).filter((f) => !NO_SESSION.some((d) => f.startsWith(d + path.sep))),
      ...SHARED_RUNNERS,
    ];
    expect(files.length).toBeGreaterThan(30);
    const found: string[] = [];
    let reports = 0;
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      reports += text.split('\n').filter((l) => REPORT.test(l)).length;
      for (const line of unguardedReports(text)) found.push(`${path.relative(src, f)}:${line}`);
    }
    expect(reports).toBeGreaterThan(40);
    expect(found).toEqual([]);
  });

  it('W3 every session route file that answers db_unavailable uses the rule', () => {
    const missing = routeFiles(here)
      .filter((f) => !NO_SESSION.some((d) => f.startsWith(d + path.sep)))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        return /db_unavailable|dbUnavailable|runRoleWrite|runMemberWrite/.test(text) &&
          !/endedSessionResponse|runRoleWrite|runMemberWrite/.test(text);
      })
      .map((f) => path.relative(src, f));
    expect(missing).toEqual([]);
  });
});
