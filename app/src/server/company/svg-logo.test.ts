// EZD-290 T1, T2 (vault/plans/EZD-290.md section 4; AC-EZD-290-1, -2, -4). Inputs U, W and F1-F3 and the
// outputs O1-O3 are the plan's fixtures; expected values: Decided D-parse, D-refuse, D-root, D-keep to D-serialize.
import { describe, expect, it } from 'vitest';
import { cleanSvg } from './svg-logo';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const S = (x: string) => `<svg ${NS}>${x}</svg>`;

const F1 = `<svg ${NS} width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" fill="#1f6feb"/></svg>`;
const O1 = F1;
const F2 =
  '<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="urn:i" xmlns:xlink="http://www.w3.org/1999/xlink" i:v="1" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><i:meta/><defs><path id="p" d="M0 0h9"/></defs><use xlink:href="#p" class="a"/><image xlink:href="https://e.x/a.png"/><a href="#p"><rect/></a></svg>\n';
const O2 =
  '<svg xmlns="http://www.w3.org/2000/svg" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><defs><path id="p" d="M0 0h9"/></defs><use href="#p" class="a"/><image/></svg>';
const F3 = S(
  `<style>@import url(https://e.x/x.css);</style><rect fill="url(https://e.x/p.svg#a)" style="fill:image-set(&quot;x.png&quot; 1x)"/><rect style="fill:\\75rl(x.png)" stroke="url( '#ok' )"/>`,
);
const O3 = S(`<rect/><rect stroke="url( '#ok' )"/>`);

const U: Record<string, string> = {
  a: `<svg ${NS} xmlns:svg="http://www.w3.org/2000/svg"><svg:script>x</svg:script></svg>`,
  b: S('<a href="&#106;avascript:x"/>'),
  c: S('<rect ONCLICK="x"/>'),
  d: `<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:foreignObject/></s:svg>`,
  e: `<svg ${NS} xmlns:x="urn:x"><rect x:onload="x"/></svg>`,
  f: S('<a href="&#x6A;ava&#9;script:x"/>'),
  g: S('<metadata><foreignObject/></metadata>'),
  h: S('<style>a{fill:url(javascript:x)}</style>'),
  i: `<!DOCTYPE svg [<!ENTITY x "y">]>` + S('&x;'),
  j: S('<title>&nbsp;</title>'),
  k: `<svg ${NS} width=10></svg>`,
  l: S('<g>'),
  m: `<svg ${NS}><g>`,
  n: S('<x:rect/>'),
  p: S('<rect width="1" width="2"/>'),
  q: S('<rect id="a<b"/>'),
  r: S('<title>&#0;</title>'),
  s: `<!ELEMENT svg ANY>` + S(''),
  t: S('<ŕect/>'),
  u: S('') + 'x',
  v: S('<a href="vbscript:x"/>'),
};
const W: Record<string, string> = {
  w: '<svg><rect/></svg>',
  x: `<html xmlns="http://www.w3.org/1999/xhtml">${S('')}</html>`,
};

describe('EZD-290 cleanSvg', () => {
  it('T1 refusals: each U is logo_svg_unsafe, each W is logo_wrong_type', () => {
    for (const [key, input] of Object.entries(U)) {
      expect(cleanSvg(input), `U ${key}`).toEqual({ ok: false, code: 'logo_svg_unsafe' });
    }
    for (const [key, input] of Object.entries(W)) {
      expect(cleanSvg(input), `W ${key}`).toEqual({ ok: false, code: 'logo_wrong_type' });
    }
  });

  it('T2 outputs: F1-F3 give O1-O3 and each output is a fixed point', () => {
    const cases: Array<[string, string, string]> = [
      ['F1', F1, O1],
      ['F2', F2, O2],
      ['F3', F3, O3],
    ];
    for (const [name, input, out] of cases) {
      expect(cleanSvg(input), name).toEqual({ ok: true, svg: out });
      expect(cleanSvg(out), `${name} again`).toEqual({ ok: true, svg: out });
    }
  });
});
