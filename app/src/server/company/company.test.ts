// EZD-112 T2 and T3 (vault/plans/EZD-112.md section 4; AC-EZD-112-2, -3, -4, -5).
// Expected values: Decided "`inspectLogo`" (png and jpg signatures, SVG refusals, size limit), "Input
// parsing" (Zod strictObject, trim, empty name, email, 1,000-character guard, output shape) and "Logo path"
// (`<tenant_id>/tenant/logo/<uuid>.<kind>`); Q-0232 (SVG scripts refused); Q-0228.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspectLogo, logoKindOfPath, logoPathFor, parseCompanyInput } from './company';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (n: number) => Uint8Array.from([...PNG_SIG, ...new Array(n - 8).fill(0)]);
const PNG_100 = png(100);
const JPG_10 = Uint8Array.from([0xff, 0xd8, 0xff, ...new Array(7).fill(0)]);
const enc = (s: string) => new TextEncoder().encode(s);
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const TITLE = '<title>Turn on the light</title>';

describe('EZD-112 logo inspection', () => {
  it('T2 inspectLogo: signatures, size, and nine kinds of unsafe SVG', () => {
    expect(inspectLogo(PNG_100, 'png')).toBeNull();
    expect(inspectLogo(JPG_10, 'png')).toBe('logo_wrong_type');
    expect(inspectLogo(JPG_10, 'jpg')).toBeNull();
    expect(inspectLogo(png(5_000_001), 'png')).toBe('logo_too_large');
    expect(inspectLogo(new Uint8Array(0), 'png')).toBe('logo_wrong_type');

    // control: the word "on" in a title is not an event handler
    expect(inspectLogo(enc(`<svg ${NS}>${TITLE}</svg>`), 'svg')).toBeNull();

    const unsafe: [string, Uint8Array][] = [
      ['script', enc(`<svg ${NS}>${TITLE}<script>x</script></svg>`)],
      ['onload attribute', enc('<svg onload="x">')],
      ['slash before onload', enc('<svg/onload=x>')],
      ['onclick after a quote', enc('<svg x="1"onclick="x">')],
      ['foreignObject', enc(`<svg ${NS}><foreignObject></foreignObject></svg>`)],
      ['javascript url', enc(`<svg ${NS}><a href="javascript:x">a</a></svg>`)],
      ['entity declaration', enc(`<!ENTITY a "b"><svg ${NS}></svg>`)],
      [
        'UTF-16 byte order mark',
        Uint8Array.from([0xff, 0xfe, ...new TextEncoder().encode(`<svg ${NS}></svg>`)]),
      ],
      ['NUL byte', Uint8Array.from([...enc(`<svg ${NS}>`), 0x00, ...enc('</svg>')])],
    ];
    for (const [label, bytes] of unsafe) {
      expect(inspectLogo(bytes, 'svg'), label).toBe('logo_svg_unsafe');
    }

    expect(inspectLogo(enc('<html></html>'), 'svg')).toBe('logo_wrong_type');
  });
});

describe('EZD-112 company input and logo paths', () => {
  const contact = { phone: '', email: '', website: '', address: '' };
  const base = { name: 'Acme', licenseNo: '', contact, logo: { action: 'keep' } };

  it('T3 parseCompanyInput trims, drops empties and refuses bad shapes; logoPathFor and logoKindOfPath', () => {
    expect(
      parseCompanyInput({
        name: '  Acme Remodeling  ',
        licenseNo: '   ',
        contact: { phone: ' 555-0100 ', email: '', website: '  ', address: ' 1 Main St ' },
        logo: { action: 'keep' },
      }),
    ).toEqual({
      ok: true,
      value: {
        name: 'Acme Remodeling',
        licenseNo: null,
        contact: { phone: '555-0100', address: '1 Main St' },
        logo: { action: 'keep' },
      },
    });
    expect(parseCompanyInput({ ...base, name: '  ' })).toEqual({
      ok: false,
      code: 'company_name_required',
    });
    expect(parseCompanyInput({ ...base, contact: { ...contact, email: 'x@' } })).toEqual({
      ok: false,
      code: 'invalid_email',
    });
    expect(parseCompanyInput({ ...base, contact: { ...contact, email: '' } }).ok).toBe(true);
    expect(parseCompanyInput({ ...base, licenseNo: 'L'.repeat(1001) })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(parseCompanyInput({ ...base, fax: '1' })).toEqual({ ok: false, code: 'invalid_input' });
    expect(parseCompanyInput({ ...base, contact: { ...contact, fax: '1' } })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(parseCompanyInput({ name: 'Acme', licenseNo: '', contact })).toEqual({
      ok: false,
      code: 'invalid_input',
    });

    const t = randomUUID();
    const u = randomUUID();
    expect(logoPathFor(t, 'png', u)).toBe(`${t}/tenant/logo/${u}.png`);
    expect(logoPathFor(t, 'svg')).toMatch(
      new RegExp(
        `^${t}/tenant/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.svg$`,
      ),
    );
    expect(logoKindOfPath(t, `${t}/tenant/logo/${u}.png`)).toBe('png');
    expect(logoKindOfPath(t, `${randomUUID()}/tenant/logo/${u}.png`)).toBeNull();
    expect(logoKindOfPath(t, `${t}/tenant/logo/../${u}.png`)).toBeNull();
    expect(logoKindOfPath(t, `${t}/tenant/logo/${u}.gif`)).toBeNull();
  });
});
