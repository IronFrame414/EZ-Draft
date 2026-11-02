// EZD-290 T3 (vault/plans/EZD-290.md section 4; AC-EZD-290-1, -4). Expected values: Decided D-pre (`cleanLogo`
// keeps PNG and JPG bytes, returns the UTF-8 of the clean SVG, refuses an output over LOGO_MAX_BYTES with
// `logo_too_large`; `inspectLogo` is `cleanLogo`'s code or null). Fixtures F1, F2, U a-d: section 4.
import { describe, expect, it } from 'vitest';
import { cleanLogo, inspectLogo } from './company';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const S = (x: string) => `<svg ${NS}>${x}</svg>`;
const enc = (s: string) => new TextEncoder().encode(s);

const F1 = `<svg ${NS} width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" fill="#1f6feb"/></svg>`;
const F2 =
  '<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="urn:i" xmlns:xlink="http://www.w3.org/1999/xlink" i:v="1" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><i:meta/><defs><path id="p" d="M0 0h9"/></defs><use xlink:href="#p" class="a"/><image xlink:href="https://e.x/a.png"/><a href="#p"><rect/></a></svg>\n';
const O2 =
  '<svg xmlns="http://www.w3.org/2000/svg" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><defs><path id="p" d="M0 0h9"/></defs><use href="#p" class="a"/><image/></svg>';
const PNG_100 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...new Array(92).fill(0),
]);
const UNSAFE = [
  `<svg ${NS} xmlns:svg="http://www.w3.org/2000/svg"><svg:script>x</svg:script></svg>`,
  S('<a href="&#106;avascript:x"/>'),
  S('<rect ONCLICK="x"/>'),
  `<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:foreignObject/></s:svg>`,
];

describe('EZD-290 cleanLogo', () => {
  it('T3 cleanLogo: plain logos unchanged, F2 rewritten, a clean copy over 5 MB refused, unsafe SVG refused', () => {
    expect(cleanLogo(enc(F1), 'svg')).toEqual({ ok: true, bytes: enc(F1) });
    expect(cleanLogo(PNG_100, 'png')).toEqual({ ok: true, bytes: PNG_100 });
    expect(cleanLogo(enc(F2), 'svg')).toEqual({ ok: true, bytes: enc(O2) });

    // 1,500,000 '>' in a title come out as 6,000,000 bytes of `&gt;`
    const big = enc(S('<title>' + '>'.repeat(1_500_000) + '</title>'));
    expect(cleanLogo(big, 'svg')).toEqual({ ok: false, code: 'logo_too_large' });

    UNSAFE.forEach((svg, i) => {
      expect(cleanLogo(enc(svg), 'svg'), `U ${'abcd'[i]}`).toEqual({
        ok: false,
        code: 'logo_svg_unsafe',
      });
      expect(inspectLogo(enc(svg), 'svg'), `inspectLogo U ${'abcd'[i]}`).toBe('logo_svg_unsafe');
    });
  });
});
