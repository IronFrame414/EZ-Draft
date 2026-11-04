// EZD-242 U1 (vault/plans/EZD-242.md sections 3, 4; AC-EZD-242-1, AC-EZD-242-3). Sources: Q-0360 (c)
// (vault/questions/QUESTIONS.md); ROW (vault/tickets/phases/phase-01.md line 114); C10 (docs/architecture.md
// Machine checks); TOKENS (app/src/styles/tokens.ts, entries from tokens.css lines 10 and 54).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../../styles/tokens';

function findApp(): string {
  let dir = process.cwd();
  for (;;) {
    try {
      readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8');
      return path.join(dir, 'app');
    } catch {
      const up = path.dirname(dir);
      if (up === dir) throw new Error('pnpm-workspace.yaml not found');
      dir = up;
    }
  }
}
const appDir = findApp();

const CSS_PATH = 'src/components/settings/company/offline-input.module.css';
const CUSTOMERS_CSS_PATH = 'src/components/settings/company/Customers.module.css';

const tokenValue = (name: string) => TOKENS.find((t) => t.name === name)?.value;

describe('EZD-242 offline input look', () => {
  it('EZD-242 U1 offline rule uses tokens only: one .offline:read-only rule with the two sunken-look declarations', () => {
    const raw = readFileSync(path.join(appDir, CSS_PATH), 'utf8');
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

    // No at-rule (no media query or nested block) in this file.
    expect(css).not.toContain('@');

    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      sel: m[1].trim(),
      decls: m[2]
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0),
    }));
    expect(rules.map((r) => r.sel)).toEqual(['.offline:read-only']);
    expect([...rules[0].decls].sort()).toEqual(
      ['background-color: var(--ez-surface-sunken)', 'color: var(--ez-slate-300)'].sort(),
    );

    // C10 for this file: no literal colour, only var(--ez-*) from tokens.css.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgba?|hsla?|oklch)\(/);

    // The tokens the rule uses hold the spec values (tokens.css lines 10 and 54).
    expect(tokenValue('--ez-surface-sunken')).toBe('#fbfbfc');
    expect(tokenValue('--ez-slate-300')).toBe('#9aa3af');
  });

  it('EZD-242 U2 customer dialog Save has the disabled look: Customers.module.css .saveButton:disabled sets opacity 0.45', () => {
    const raw = readFileSync(path.join(appDir, CUSTOMERS_CSS_PATH), 'utf8');
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      sel: m[1].trim(),
      decls: m[2]
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0),
    }));
    const saveDisabled = rules.find((r) => r.sel === '.saveButton:disabled');
    expect(saveDisabled).toBeDefined();
    expect(saveDisabled?.decls).toContain('opacity: 0.45');
  });
});
