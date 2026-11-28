// EZD-2000 (AC-EZD-2000-1 (2); Q-0814 "heavy libraries (full zod, three, realtime, image encoder, PDF) stay out of
// first loads"): the contents rows count full zod, Supabase realtime, the image encoder and PDF code found in a
// page's first-load bundle as `heavy`, which every entry's ENTRY_RULES forbids; three stays allowed on the editor
// only (its existing ENTRY_RULES allowance). zod/mini is the small form and is not counted.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRY_RULES,
  FIRST_LOAD_ALLOWANCES,
  FIRST_LOAD_PACKAGES,
  HEAVY_PACKAGES,
} from '../../../eslint-rules/boundaries.mjs';
import { applyAllowances, classify } from '../js-contents.mjs';
import { normalizeSource } from '../sourcemap.mjs';

const nm = (p) => normalizeSource(`turbopack:///[project]/node_modules/.pnpm/x@1/node_modules/${p}`);

describe('EZD-2000 heavy libraries out of first loads', () => {
  test('EZD-2000 full zod, realtime, the image encoder and PDF code are heavy', () => {
    const cases = [
      ['zod/v4/classic/schemas.js', 'pkg:zod/v4/classic/'],
      ['zod/v3/types.js', 'pkg:zod/v3/'],
      ['@supabase/realtime-js/dist/module/RealtimeClient.js', 'pkg:@supabase/realtime-js'],
      ['@jsquash/webp/encode.js', 'pkg:@jsquash/webp'],
      ['pdfkit/js/pdfkit.es.js', 'pkg:pdfkit'],
      ['pdfjs-dist/build/pdf.mjs', 'pkg:pdfjs-dist'],
    ];
    for (const [file, key] of cases) {
      assert.deepEqual(classify(nm(file)), { category: 'heavy', key }, file);
    }
  });

  test('EZD-2000 zod/mini and the zod core it uses are not counted', () => {
    assert.equal(classify(nm('zod/v4/mini/schemas.js')), null);
    assert.equal(classify(nm('zod/v4/core/core.js')), null);
  });

  test('EZD-2000 every entry forbids heavy; only the editor allows three', () => {
    for (const [entry, rules] of Object.entries(ENTRY_RULES)) {
      assert.ok(rules.includes('heavy'), entry);
      assert.equal(rules.includes('three'), entry !== 'editor', entry);
    }
    assert.equal(classify(nm('three/build/three.module.js'))?.category, 'three');
  });

  test('EZD-2000 the first-load list is not a lint import ban', () => {
    // Server code imports zod everywhere; the lint rule reads HEAVY_PACKAGES only (eslint.config.mjs).
    const names = HEAVY_PACKAGES.flatMap((p) => p.match);
    for (const p of FIRST_LOAD_PACKAGES) for (const n of p.match) assert.ok(!names.includes(n), n);
  });

  test('EZD-2000 an allowance lets only its own key through, naming the reason', () => {
    const found = [
      { category: 'heavy', key: 'pkg:@supabase/realtime-js', bytes: 10 },
      { category: 'heavy', key: 'pkg:zod/v4/classic/', bytes: 20 },
    ];
    const allow = [{ key: 'pkg:@supabase/realtime-js', reason: 'loaded after the page is usable' }];
    const { forbidden, allowed } = applyAllowances(found, allow);
    assert.deepEqual(forbidden, [found[1]]);
    assert.deepEqual(allowed, [{ ...found[0], reason: 'loaded after the page is usable' }]);
    // Present or absent, an allowance never makes a finding of its own.
    assert.deepEqual(applyAllowances([], allow), { forbidden: [], allowed: [] });
    assert.deepEqual(applyAllowances(found).forbidden, found);
  });

  test('EZD-2000 every allowance names a page, a package and its reason', async () => {
    const { default: cfg } = await import('../perf.config.mjs');
    const lists = [
      ...Object.entries(FIRST_LOAD_ALLOWANCES).map(([page, list]) => [page, list]),
      ...cfg.measurements.filter((m) => m.allow !== undefined).map((m) => [m.id, m.allow]),
    ];
    assert.ok(lists.length > 0);
    for (const [where, list] of lists) {
      assert.ok(where.startsWith('/') || where.startsWith('entry-contents:'), where);
      for (const a of list) {
        assert.ok(a.key.startsWith('pkg:'), `${where} ${a.key}`);
        assert.ok(typeof a.reason === 'string' && a.reason.trim().length > 20, where);
      }
    }
    // Only realtime on Projects today (EZD-1997 loads it after the page is usable).
    assert.deepEqual(Object.keys(FIRST_LOAD_ALLOWANCES), ['/']);
    assert.deepEqual(FIRST_LOAD_ALLOWANCES['/'].map((a) => a.key), ['pkg:@supabase/realtime-js']);
  });
});
