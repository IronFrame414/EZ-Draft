// EZD-031 test T13 (vault/plans/EZD-031.md Tests): isolation, scripts and docs.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSTRUCTION_OPENING } from '../src/manifest';
import { REPO_DIR, SPIKE_DIR, readJson } from './helpers';

const spikeFile = (name: string) => path.join(SPIKE_DIR, name);

function dependencyRow(name: string): string[] {
  const text = fs.readFileSync(path.join(REPO_DIR, 'docs', 'architecture.md'), 'utf8');
  const line = text.split('\n').find((l) => l.startsWith(`| \`${name}\` |`));
  if (!line) throw new Error(`no Dependencies row for ${name}`);
  return line.split('|').slice(1, -1).map((c) => c.trim());
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.e2e', 'test-results', 'playwright-report', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|mts)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('EZD-031 isolation, scripts and docs', () => {
  it('T13 package scripts avoid the fan-out names', () => {
    const pkg = readJson(spikeFile('package.json'));
    for (const bad of ['test', 'lint', 'typecheck', 'build']) expect(Object.keys(pkg.scripts)).not.toContain(bad);
  });

  it('T13 tsx and vitest rows in docs/architecture.md', () => {
    const pkg = readJson(spikeFile('package.json'));
    const tsx = dependencyRow('tsx');
    expect(tsx[1]).toBe(`\`${pkg.devDependencies.tsx}\``);
    expect(tsx[2].split(',').map((s) => s.trim().replace(/`/g, ''))).toContain('spikes');
    expect(tsx[4]).toBe('EZD-031');
    expect(dependencyRow('vitest')[2].split(',').map((s) => s.trim().replace(/`/g, ''))).toContain('spikes');
  });

  it('T13 no app, packages or worker file imports the spike (C4)', () => {
    const pattern = /(?:from|import|require)\s*\(?\s*['"][^'"]*(?:spikes\/|@ezdraft\/spike-ezd-031-render)/;
    const hits: string[] = [];
    for (const top of ['app', 'packages', 'worker'])
      for (const f of sourceFiles(path.join(REPO_DIR, top))) if (pattern.test(fs.readFileSync(f, 'utf8'))) hits.push(f);
    expect(hits).toEqual([]);
  });

  it('T13 INSTRUCTION_OPENING is the Q-0083 (a) sentence', () => {
    expect(INSTRUCTION_OPENING).toBe(
      "Turn this 3D view into a photograph of the finished room. Keep the room's shape and every cabinet, fixture, door and window exactly where they are and at the same size.",
    );
  });

  it('T13 models.json and prices.json', () => {
    const models = readJson<Array<{ provider: string; model: string; label?: string }>>(spikeFile('models.json'));
    const prices = readJson(spikeFile('prices.json')).models as Record<string, any>;
    for (const provider of ['gemini', 'openai', 'bfl']) expect(models.some((m) => m.provider === provider)).toBe(true);
    for (const m of models) {
      const entry = prices[m.label ?? m.model] ?? prices[m.model];
      expect(entry, `price for ${m.model}`).toBeDefined();
      expect(entry.sourceUrl.startsWith('https:')).toBe(true);
      expect(entry.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const rate of [entry.inputPerMTok, entry.outputPerMTok, entry.perImage].filter((r) => r !== undefined))
        expect(rate === null || (typeof rate === 'number' && rate > 0)).toBe(true);
    }
  });

  it('T13 models.json and prices.json hold exactly the Step 2 entries', () => {
    expect(readJson(spikeFile('models.json'))).toEqual([
      { provider: 'gemini', model: 'gemini-3.1-flash-image' },
      { provider: 'openai', model: 'gpt-image-2' },
      { provider: 'bfl', model: 'flux-kontext-pro' },
    ]);
    const prices = readJson(spikeFile('prices.json')).models;
    expect(prices).toEqual({
      'gemini-3.1-flash-image': {
        provider: 'gemini',
        unit: 'per_token',
        inputPerMTok: 0.5,
        outputPerMTok: 60,
        sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
        retrieved: '2026-10-23',
      },
      'gpt-image-2': {
        provider: 'openai',
        unit: 'per_token',
        inputPerMTok: 8,
        outputPerMTok: 30,
        sourceUrl: 'https://developers.openai.com/api/docs/pricing',
        retrieved: '2026-10-23',
      },
      'flux-kontext-pro': {
        provider: 'bfl',
        unit: 'per_image',
        perImage: null,
        sourceUrl: 'https://bfl.ai/pricing',
        retrieved: '2026-10-23',
      },
    });
  });

  it('T13 .gitignore and .env.example', () => {
    expect(fs.readFileSync(spikeFile('.gitignore'), 'utf8').split('\n').map((l) => l.trim())).toContain('runs/');
    const lines = fs.readFileSync(spikeFile('.env.example'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const names = lines.filter((l) => !l.startsWith('#'));
    expect(names.sort()).toEqual(['BFL_API_KEY=', 'GEMINI_API_KEY=', 'OPENAI_API_KEY=']);
    expect(lines).toContain('# GEMINI_BASE_URL=');
    expect(lines).toContain('# BFL_BASE_URL=');
  });
});
