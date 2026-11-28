// EZD-1921 (AC-EZD-1921-1; editor plan 5.3, 5.4): docs/architecture.md has an "Editor features" section that states
// the registry rule for builders and planners, and names every registry folder the generator writes an index for,
// so the docs stay true as EZD-1914 to EZD-1917 add their folders to TARGETS.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT, INDEX_FILE, TARGETS } from '../../../tools/gen-registry.mjs';

const ROOT = path.join(APP_ROOT, '..');
const DOC = path.join(ROOT, 'docs', 'architecture.md');
const LESSONS = path.join(ROOT, 'vault', 'lessons', 'planner.md');
const REVALIDATION = path.join(ROOT, 'vault', 'plans', 'editor-revalidation-2026-11-28.md');

function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} /.test(l) && l.replace(/^#+ /, '').startsWith(heading));
  if (start < 0) return '';
  const level = lines[start]!.match(/^#+/)![0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+) /);
    return m !== null && m[1]!.length <= level;
  });
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

describe('EZD-1921 architecture.md Editor features', () => {
  const body = section(fs.readFileSync(DOC, 'utf8'), 'Editor features');

  it('has the section', () => {
    expect(body).not.toBe('');
  });

  it('states that a new mode, tool, inspector kind, left-panel section or ceiling drawer never edits ProjectEditor.tsx', () => {
    expect(body).toContain(
      'A new mode, tool, inspector kind, left-panel section or ceiling drawer adds a file in its registry folder and never edits `ProjectEditor.tsx`',
    );
  });

  it('states that planners never list generated index files in a footprint', () => {
    expect(body).toContain('Planners never list generated index files in a footprint');
  });

  it('names every folder the generator writes an index for, and the index file name', () => {
    expect(TARGETS.length).toBeGreaterThan(0);
    for (const t of TARGETS) expect(body).toContain(`app/${t.dir}/`);
    expect(body).toContain(INDEX_FILE);
    expect(body).toContain('app/tools/gen-registry.mjs');
  });

  it('names the five registry folders of editor plan 5.3', () => {
    for (const dir of [
      'app/src/editor/features/',
      'app/src/editor/ceiling/tools/',
      'app/src/editor/inspector/kinds/',
      'app/src/editor/layers/sections/',
      'app/src/editor/ceiling/draw/',
    ])
      expect(body).toContain(dir);
  });
});

// AC-EZD-1921-2: every unbuilt plan that names ProjectEditor.tsx, InspectorPanel.tsx, LeftPanel.tsx, DrawingTools.tsx
// or rcp.ts is re-validated against the new layout (the record in vault/plans), and vault/lessons/planner.md has the
// registry rule.
describe('EZD-1921 AC-EZD-1921-2 plan re-validation record and planner lesson', () => {
  it('vault/lessons/planner.md has the registry rule: no ProjectEditor.tsx and no index.generated.ts in an editor feature plan', () => {
    const text = fs.readFileSync(LESSONS, 'utf8');
    const start = text.indexOf('## L-073 ');
    expect(start).toBeGreaterThan(-1);
    const next = text.indexOf('\n## ', start + 1);
    const lesson = text.slice(start, next < 0 ? undefined : next);
    const rule = lesson.split('\n').find((l) => l.startsWith('Rule: ')) ?? '';
    expect(rule).toContain(
      'a plan for a new editor mode, tool, inspector kind, left-panel section or ceiling drawer adds one file in its registry folder',
    );
    expect(rule).toContain('never lists `ProjectEditor.tsx`');
    expect(rule).toContain('never lists a generated `index.generated.ts`');
    expect(rule).toContain('### Editor features (EZD-1921)');
  });

  it('the re-validation record has a row for each unbuilt plan that names the five files', () => {
    expect(fs.existsSync(REVALIDATION)).toBe(true);
    const text = fs.readFileSync(REVALIDATION, 'utf8');
    for (const f of ['ProjectEditor.tsx', 'InspectorPanel.tsx', 'LeftPanel.tsx', 'DrawingTools.tsx', 'rcp.ts'])
      expect(text).toContain(`\`${f}\``);
    const rows = text.split('\n').filter((l) => l.startsWith('| '));
    for (const id of ['EZD-1914', 'EZD-1915', 'EZD-1916', 'EZD-1917', 'EZD-1918']) {
      const row = rows.find((l) => l.startsWith(`| ${id} |`));
      expect(row, id).toBeDefined();
      // Plan, State, Finding, Action: each cell filled.
      const cells = row!.split('|').slice(1, -1).map((c) => c.trim());
      expect(cells).toHaveLength(4);
      for (const c of cells) expect(c).not.toBe('');
    }
  });
});
