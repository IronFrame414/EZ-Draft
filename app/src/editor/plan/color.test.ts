// EZD-207a U1 (vault/plans/EZD-207a.md section 4; Decided "Colour maths", computed 2026-11-06; AC-EZD-207-9).
import { describe, expect, test } from 'vitest';
import { parseCssColor, tokenRgb } from './color';

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 0.001;

describe('EZD-207a colours', () => {
  test('EZD-207a U1 parseCssColor reads hex and oklch to sRGB 0..1 and tokenRgb throws on an unknown token', () => {
    const hex = parseCssColor('#7a828e');
    expect(hex).not.toBeNull();
    expect(hex!.r).toBeCloseTo(0x7a / 255, 9);
    expect(hex!.g).toBeCloseTo(0x82 / 255, 9);
    expect(hex!.b).toBeCloseTo(0x8e / 255, 9);

    const short = parseCssColor('#FFF');
    expect(short).not.toBeNull();
    expect(short!.r).toBeCloseTo(1, 9);
    expect(short!.g).toBeCloseTo(1, 9);
    expect(short!.b).toBeCloseTo(1, 9);

    const cobalt = parseCssColor('oklch(0.55 0.17 262)');
    expect(cobalt).not.toBeNull();
    expect(near(cobalt!.r, 0.2122)).toBe(true);
    expect(near(cobalt!.g, 0.4211)).toBe(true);
    expect(near(cobalt!.b, 0.8278)).toBe(true);

    const red = parseCssColor('oklch(0.6 0.19 28)');
    expect(red).not.toBeNull();
    expect(near(red!.r, 0.8567)).toBe(true);
    expect(near(red!.g, 0.2621)).toBe(true);
    expect(near(red!.b, 0.2234)).toBe(true);

    expect(parseCssColor('rgb(1,2,3)')).toBeNull();
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('#12345')).toBeNull();

    expect(() => tokenRgb('--ez-nope')).toThrow('unknown colour token --ez-nope');
  });
});
