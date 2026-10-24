// EZD-028 T11 spike stays isolated, T12 dependencies registered
// (vault/plans/EZD-028.md Tests table; Approach Steps 6, 8; EZD-000 C1, C4; CLAUDE.md rule 7).
import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const spikeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(spikeDir, '..', '..');

const SPIKE_PACKAGE = '@ezdraft/spike-ezd-028-pdf';
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.e2e',
  '.turbo',
]);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function namesSpike(text) {
  return text.includes('spikes/') || text.startsWith(SPIKE_PACKAGE);
}

function specifiers(source) {
  const out = [];
  const re =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\bexport\s+\*\s*from\s*)(['"`])([^'"`]+)\1/g;
  for (const m of source.matchAll(re)) out.push(m[2]);
  return out;
}

function dependencyRows() {
  const text = readFileSync(path.join(repoRoot, 'docs', 'architecture.md'), 'utf8');
  const start = text.indexOf('\n## Dependencies');
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('\n## ', start + 1);
  const section = text.slice(start, end === -1 ? undefined : end);
  const rows = new Map();
  for (const line of section.split('\n')) {
    const m = /^\| `([^`]+)` \| `([^`]+)` \| ([^|]+) \| [^|]* \| ([^|]+) \|\s*$/.exec(line);
    if (m) {
      rows.set(m[1], {
        version: m[2],
        usedIn: m[3].split(',').map((s) => s.trim()),
        addedBy: m[4].trim(),
      });
    }
  }
  return rows;
}

/** Versions of `dep` that the lockfile resolves for every `<pkg>@<version>` snapshot block. */
function lockfileDepVersions(pkg, version, dep) {
  const lines = readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8').split('\n');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const head = new RegExp(`^  '?${esc(pkg)}@${esc(version)}(?:\\(.*\\))?'?:\\s*$`);
  const depLine = new RegExp(`^ {6}'?${esc(dep)}'?: '?([^'\\s(]+)`);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!head.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && !/^ {0,2}\S/.test(lines[j]); j++) {
      const m = depLine.exec(lines[j]);
      if (m) found.push(m[1]);
    }
  }
  return found;
}

describe('EZD-028 spike isolation and dependencies', () => {
  test('T11 nothing in app/, packages/ or worker/ imports or depends on spikes/ or the spike package', () => {
    const offenders = [];
    for (const top of ['app', 'packages', 'worker']) {
      for (const file of walk(path.join(repoRoot, top), [])) {
        const rel = path.relative(repoRoot, file);
        if (path.basename(file) === 'package.json') {
          const pkg = JSON.parse(readFileSync(file, 'utf8'));
          for (const field of DEP_FIELDS) {
            for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
              if (namesSpike(name) || namesSpike(String(spec))) offenders.push(`${rel}: ${name}`);
            }
          }
        } else if (SOURCE_EXT.test(file)) {
          for (const spec of specifiers(readFileSync(file, 'utf8'))) {
            if (namesSpike(spec)) offenders.push(`${rel}: ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('T12 fontkit and pdf-lib rows added by EZD-028; pdfkit, pdfjs-dist, vitest list spikes; versions match', () => {
    const rows = dependencyRows();

    for (const name of ['fontkit', 'pdf-lib']) {
      const row = rows.get(name);
      expect(row, `row ${name}`).toBeDefined();
      expect(row.addedBy).toBe('EZD-028');
      expect(row.usedIn).toContain('spikes');
    }
    for (const name of ['pdfkit', 'pdfjs-dist', 'vitest']) {
      const row = rows.get(name);
      expect(row, `row ${name}`).toBeDefined();
      expect(row.addedBy).toBe('EZD-000');
      expect(row.usedIn).toContain('spikes');
    }

    // Step 6: dependencies pdfkit, fontkit; devDependencies vitest, pdf-lib, pdfjs-dist.
    const pkg = JSON.parse(readFileSync(path.join(spikeDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe(SPIKE_PACKAGE);
    for (const name of ['pdfkit', 'fontkit']) expect(pkg.dependencies ?? {}).toHaveProperty(name);
    for (const name of ['vitest', 'pdf-lib', 'pdfjs-dist']) {
      expect(pkg.devDependencies ?? {}).toHaveProperty(name);
    }
    for (const field of DEP_FIELDS) {
      for (const [name, version] of Object.entries(pkg[field] ?? {})) {
        expect(rows.get(name), `row ${name}`).toBeDefined();
        expect(version, `${name} version`).toBe(rows.get(name).version);
      }
    }

    const resolved = lockfileDepVersions('pdfkit', rows.get('pdfkit').version, 'fontkit');
    expect(resolved.length).toBeGreaterThan(0);
    for (const v of resolved) expect(v).toBe(rows.get('fontkit').version);
  });
});
