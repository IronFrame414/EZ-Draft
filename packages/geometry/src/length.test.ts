// EZD-201 T1-T16 (vault/plans/EZD-201.md section 4).
import { describe, test, expect } from 'vitest';
import {
  parseLength,
  formatLength,
  LENGTH_REFUSED_MESSAGE_KEY,
  MAX_WALL_LENGTH_IN,
  PLAN_DISPLAY_DENOMINATOR,
  DETAIL_DISPLAY_DENOMINATOR,
} from './length';
import type { LengthFieldKind, LengthRefusalReason } from './length';

const ok = (inches: number) => ({ ok: true, inches });
const no = (reason: LengthRefusalReason) => ({
  ok: false,
  reason,
  messageKey: 'office.length.refused',
});
const kinds: Array<LengthFieldKind> = ['wall_room', 'other'];

const T1_INPUTS = [
  '12\'6"',
  '150"',
  '150',
  "12.5'",
  '12\'-6"',
  "12' 6",
  '12\' 6"',
  '12\u20196\u201D',
];

describe('EZD-201 length parse and format', () => {
  test('T1 done when: the four formats and their variants store 150', () => {
    for (const t of T1_INPUTS) expect(parseLength(t, 'wall_room'), t).toEqual(ok(150));
  });

  test('T2 other accepted forms', () => {
    const cases: Array<[string, number]> = [
      ['12\' 6 1/2"', 150.5],
      ["10'", 120],
      ['6 1/2"', 6.5],
      ['6-1/2"', 6.5],
      ['6.5"', 6.5],
      ['12 1/2', 12.5],
      ['11\' 11 3/4"', 143.75],
      ['12\' 6 1/4"', 150.25],
      ['12\'-6-1/2"', 150.5],
      ['12\' 15"', 159],
      ['0150"', 150],
    ];
    for (const [t, v] of cases) expect(parseLength(t, 'wall_room'), t).toEqual(ok(v));
  });

  test('T3 marks and spaces', () => {
    expect(parseLength('12\u2018 6\u201C', 'other')).toEqual(ok(150));
    expect(parseLength('  150"  ', 'other')).toEqual(ok(150));
    expect(parseLength('12\u2033', 'other')).toEqual(no('format'));
  });

  test('T4 same values in other fields', () => {
    for (const t of T1_INPUTS) expect(parseLength(t, 'other'), t).toEqual(ok(150));
  });

  test('T5 rounding to 1/16', () => {
    const cases: Array<[string, number]> = [
      ["12.33'", 147.9375],
      ['10\' 3 5/16"', 123.3125],
      ['150.03"', 150],
      ['150.03125"', 150.0625],
      ['6 1/3"', 6.3125],
    ];
    for (const [t, v] of cases) expect(parseLength(t, 'wall_room'), t).toEqual(ok(v));
  });

  test('T6 12 6 refused everywhere', () => {
    for (const k of kinds) {
      for (const t of ['12 6', '12 6"'])
        expect(parseLength(t, k), `${k} ${t}`).toEqual(no('format'));
    }
  });

  test('T7 wall and room limits', () => {
    for (const t of ['0"', '0', '0 1/64"'])
      expect(parseLength(t, 'wall_room'), t).toEqual(no('not_positive'));
    expect(parseLength('-5"', 'wall_room')).toEqual(no('format'));
    for (const t of ['200\' 0 1/16"', '200\' 0 1/32"'])
      expect(parseLength(t, 'wall_room'), t).toEqual(no('over_max'));
    for (const t of ["200'", '200\' 0 1/64"'])
      expect(parseLength(t, 'wall_room'), t).toEqual(ok(2400));
  });

  test('T8 other fields take 0', () => {
    expect(parseLength('0"', 'other')).toEqual(ok(0));
    expect(parseLength('0 1/64"', 'other')).toEqual(ok(0));
    expect(parseLength('200\' 0 1/16"', 'other')).toEqual(ok(2400.0625));
    expect(parseLength('-5"', 'other')).toEqual(no('format'));
  });

  test('T9 malformed text', () => {
    const bad = [
      '',
      '   ',
      '.5"',
      '5."',
      "12,5'",
      '+5"',
      '150 "',
      "12 '",
      '12.5\' 3"',
      "12'6'",
      '1 / 2"',
      '12\' - 6"',
      '6 - 1/2"',
      '6 3/2"',
      '6 1/0"',
      '10-6',
      'abc',
      '1'.repeat(33),
    ];
    for (const k of kinds) {
      for (const t of bad)
        expect(parseLength(t, k), `${k} ${JSON.stringify(t)}`).toEqual(no('format'));
    }
  });

  test('T10 length cap boundary', () => {
    const t = '0'.repeat(29) + '150';
    expect(t.length).toBe(32);
    expect(parseLength(t, 'other')).toEqual(ok(150));
  });

  test('T11 fraction with no whole number', () => {
    expect(parseLength('1/2"', 'other')).toEqual(ok(0.5));
    expect(parseLength('3/4"', 'other')).toEqual(ok(0.75));
    expect(parseLength('12\' 1/2"', 'other')).toEqual(ok(144.5));
    expect(parseLength('3/2"', 'other')).toEqual(no('format'));
    expect(parseLength('1/0"', 'other')).toEqual(no('format'));
  });

  test('T12 one refusal message', () => {
    expect(LENGTH_REFUSED_MESSAGE_KEY).toBe('office.length.refused');
    const a = parseLength('12 6', 'other');
    const b = parseLength('0"', 'wall_room');
    const c = parseLength("201'", 'wall_room');
    for (const r of [a, b, c]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.messageKey).toBe('office.length.refused');
    }
    expect(a).toEqual(no('format'));
    expect(b).toEqual(no('not_positive'));
    expect(c).toEqual(no('over_max'));
  });

  test('T13 plan display (1/2")', () => {
    const cases: Array<[number, string]> = [
      [150, '12\' 6"'],
      [150.5, '12\' 6 1/2"'],
      [120, '10\' 0"'],
      [6.5, '6 1/2"'],
      [147.9375, '12\' 4"'],
      [143.75, '12\' 0"'],
      [150.25, '12\' 6 1/2"'],
      [2400, '200\' 0"'],
      [12.5, '1\' 0 1/2"'],
      [123.3125, '10\' 3 1/2"'],
      [150.0625, '12\' 6"'],
      [0, '0"'],
      [0.5, '1/2"'],
      [11.75, '1\' 0"'],
    ];
    for (const [x, s] of cases) expect(formatLength(x, 2), String(x)).toBe(s);
  });

  test('T14 detail display (1/16")', () => {
    const cases: Array<[number, string]> = [
      [123.3125, '10\' 3 5/16"'],
      [150.0625, '12\' 6 1/16"'],
      [150, '12\' 6"'],
      [0, '0"'],
      [147.9375, '12\' 3 15/16"'],
      [150.5, '12\' 6 1/2"'],
      [0.625, '5/8"'],
      [150.03, '12\' 6"'],
      [150.03125, '12\' 6 1/16"'],
    ];
    for (const [x, s] of cases) expect(formatLength(x, 16), String(x)).toBe(s);
  });

  test('T15 bad display input', () => {
    expect(() => formatLength(-1, 2)).toThrow(RangeError);
    expect(() => formatLength(NaN, 16)).toThrow(RangeError);
    expect(() => formatLength(Infinity, 2)).toThrow(RangeError);
    expect(() => formatLength(1, 3 as never)).toThrow(RangeError);
  });

  test('T16 round trip and exports', async () => {
    const bad: Array<number> = [];
    for (let n = 0; n <= 38400; n++) {
      const r = parseLength(formatLength(n / 16, 16), 'other');
      if (!r.ok || r.inches !== n / 16) bad.push(n);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    const geometry = await import('./index');
    expect(typeof geometry.parseLength).toBe('function');
    expect(typeof geometry.formatLength).toBe('function');
    expect(geometry.MAX_WALL_LENGTH_IN).toBe(2400);
    expect(geometry.PLAN_DISPLAY_DENOMINATOR).toBe(2);
    expect(geometry.DETAIL_DISPLAY_DENOMINATOR).toBe(16);
    expect(MAX_WALL_LENGTH_IN).toBe(2400);
    expect(PLAN_DISPLAY_DENOMINATOR).toBe(2);
    expect(DETAIL_DISPLAY_DENOMINATOR).toBe(16);
  }, 20000);
});

// EZD-211a G8 (vault/plans/EZD-211a.md sections 1 step 1, 4). Sources: Q-0630 09 row 14; 03g (1/64 rounds to 0).
describe('EZD-211a positive length kind', () => {
  test('EZD-211a G8 positive length kind', () => {
    expect(parseLength('0', 'positive')).toEqual(no('not_positive'));
    expect(parseLength('1/64"', 'positive')).toEqual(no('not_positive'));
    expect(parseLength('1/16"', 'positive')).toEqual(ok(0.0625));
    expect(parseLength("300'", 'positive')).toEqual(ok(3600));
    expect(parseLength('abc', 'positive')).toEqual(no('format'));
  });
});
