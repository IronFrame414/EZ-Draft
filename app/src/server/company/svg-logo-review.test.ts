// EZD-290 T7 (vault/plans/EZD-290.md section 4; AC-EZD-290-1). Fixtures J, F4-F6, O4-O6 and UX y, z are the
// plan's. Expected values: V-css (a url( found in the original value is checked, so a long non-ASCII run before
// it cannot hide it), D-parse e (two attributes with one expanded name refuse), D-serialize (fixed point).
import { describe, expect, it } from 'vitest';
import { cleanSvg } from './svg-logo';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const S = (x: string) => `<svg ${NS}>${x}</svg>`;
const J = 'font-family:' + 'İ'.repeat(21);
const E = ';fill:url(https://evil.example/#a)';
const F4 = S(`<rect style="${J}${E}"/>`);
const O4 = S('<rect/>');
const F5 = S(`<style>a{${J}${E}}</style>`);
const O5 = `<svg ${NS}/>`;
const F6 = S(`<rect fill="url(#a)" style="${J};fill:url(#a)"/>`);
const O6 = F6;
const L = 'http://www.w3.org/1999/xlink';
const UX: Record<string, string> = {
  y: `<svg ${NS} xmlns:a="${L}" xmlns:b="${L}"><use a:href="#x" b:href="#y"/></svg>`,
  z: `<svg ${NS} xmlns:a="http://www.w3.org/XML/1998/namespace"><text xml:space="preserve" a:space="default"/></svg>`,
};

describe('EZD-290 review fixes', () => {
  it('T7 a long non-ASCII run cannot hide a url( ; two attributes with one expanded name refuse', () => {
    const cases: Array<[string, string, string]> = [
      ['F4', F4, O4],
      ['F5', F5, O5],
      ['F6', F6, O6],
    ];
    for (const [name, input, out] of cases) {
      expect(cleanSvg(input), name).toEqual({ ok: true, svg: out });
      expect(cleanSvg(out), `${name} again`).toEqual({ ok: true, svg: out });
      expect(out, `${name} output`).not.toContain('evil.example');
    }
    for (const [key, input] of Object.entries(UX)) {
      expect(cleanSvg(input), `UX ${key}`).toEqual({ ok: false, code: 'logo_svg_unsafe' });
    }
  });
});
