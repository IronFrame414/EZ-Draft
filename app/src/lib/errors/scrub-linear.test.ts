// EZD-142 T1-T3 (vault/plans/EZD-142.md Tests; D1, D2, D14, D15): scrubText keeps today's output and runs in
// linear time on a 262,144-byte input (the tunnel's MAX_BYTES).
import { describe, expect, it } from 'vitest';
import { scrubText } from './scrub';

const SIZE = 262_144;
const LIMIT_MS = 100;

// D14: one untimed warm-up call, then performance.now() around one call.
function timed(input: string): { out: string; ms: number } {
  scrubText('warm a@b.test http://x?y 123456');
  const t0 = performance.now();
  const out = scrubText(input);
  return { out, ms: performance.now() - t0 };
}

// Compared by length and a boolean, so a mismatch does not print two 262,144-character strings.
function expectLinear(input: string, expected: string): void {
  expect(input.length).toBe(SIZE);
  const { out, ms } = timed(input);
  expect(out.length).toBe(expected.length);
  expect(out === expected).toBe(true);
  expect(ms).toBeLessThan(LIMIT_MS);
}

// D15: today's scrub.ts:6-18, written out because EZD-142 Step 4 changes that file.
function legacyScrubText(s: string): string {
  return s
    .replace(/(https?:\/\/[^\s?#]*)[?#]\S*/g, '$1')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(
      /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
      '<uuid>',
    )
    .replace(/[A-Za-z0-9_-]{24,}/g, (run) =>
      /[A-Za-z]/.test(run) && /\d/.test(run) ? '<token>' : run,
    )
    .replace(/\b\d{6}\b/g, '<code>');
}

// D15: mulberry32, seeded 142.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  'a',
  'Z',
  '1',
  '9',
  '.',
  '-',
  '_',
  '%',
  '+',
  '@',
  '?',
  '#',
  ' ',
  '\n',
  ' ',
  '᠎',
  ' ',
  ':',
  '/',
  'http://',
  'https://',
  'http',
  's',
  '.co',
  '.io',
  'x@y.io',
  'a@b.c',
];

function seededStrings(): string[] {
  const rnd = mulberry32(142);
  const out: string[] = [];
  for (let i = 0; i < 5000; i++) {
    const count = Math.floor(rnd() * 13); // 0-12 pieces
    let s = '';
    for (let p = 0; p < count; p++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    out.push(s);
  }
  return out;
}

const FIXED = [
  '',
  'a@b.co',
  'x a@b.co.uk y',
  'a@b.co@c.de',
  'a@b.co.x@d.ef',
  'a@b.c',
  'a@b.co.123',
  '.@a.bc',
  '@a.bc',
  'a@.bc',
  'http://h/p?x',
  'https://h/p#x y',
  'http://ahttp://b?x',
  'https//x?y',
  'HTTP://h?x',
  'http://h/p ?x',
  'http://h?x z',
  'http://h?x᠎z',
  'User josh@x.test failed 3 times at https://ezdraft.ezcontractorbinder.com/c/AbCd?t=Zz9 code 482913',
];

describe('EZD-142 scrubText runs in linear time', () => {
  it('EZD-142 T1 done when: a 262,144-byte string with no @ scrubs in under 100 ms', () => {
    const input = 'a'.repeat(262_144);
    expectLinear(input, input);
  });

  it("EZD-142 T2 (a) 'a@' repeated", () => {
    const input = 'a@'.repeat(131072);
    expectLinear(input, input);
  });

  it("EZD-142 T2 (b) 'a@b.' repeated", () => {
    const input = 'a@b.'.repeat(65536);
    expectLinear(input, input);
  });

  it("EZD-142 T2 (c) 'http://' repeated", () => {
    const input = 'http://'.repeat(37449) + 'x';
    expectLinear(input, input);
  });

  it("EZD-142 T2 (d) '1' repeated", () => {
    const input = '1'.repeat(262144);
    expectLinear(input, input);
  });

  it('EZD-142 T2 (e) 23-letter runs between spaces', () => {
    const input = ('a'.repeat(23) + ' ').repeat(10922) + 'a'.repeat(16);
    expectLinear(input, input);
  });

  it("EZD-142 T2 (f) 'a@b.io ' repeated", () => {
    expectLinear('a@b.io '.repeat(37449) + 'x', '<email> '.repeat(37449) + 'x');
  });

  it("EZD-142 T2 (g) 'http://h.io/p?q=1 ' repeated", () => {
    expectLinear(
      'http://h.io/p?q=1 '.repeat(14563) + 'x'.repeat(10),
      'http://h.io/p '.repeat(14563) + 'x'.repeat(10),
    );
  });

  it('EZD-142 T3 same output as today', () => {
    const all = [...FIXED, ...seededStrings()];
    expect(all.length).toBe(FIXED.length + 5000);
    const mismatches: Array<{ s: string; got: string; want: string }> = [];
    for (const s of all) {
      expect(s.length).toBeLessThanOrEqual(600);
      const got = scrubText(s);
      const want = legacyScrubText(s);
      if (got !== want) mismatches.push({ s, got, want });
    }
    expect(mismatches).toEqual([]);
    expect(scrubText('a@b.co.x@d.ef')).toBe('<email><email>');
    expect(scrubText('a@b.co@c.de')).toBe('<email>@c.de');
    expect(scrubText('http://ahttp://b?x')).toBe('http://ahttp://b');
  });
});
