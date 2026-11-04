// EZD-290 T4 (vault/plans/EZD-290.md section 4; AC-EZD-290-1, -4). Expected values: build step 7 (a 200 from the
// check route sets the path the route returned, which differs from the draft's when the SVG was rewritten).
// Helpers as in company.test.ts.
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { recheckDraftLogo, type CompanyDraft } from './company';

describe('EZD-290 draft logo re-check', () => {
  const tenant = randomUUID();
  const p = `${tenant}/tenant/logo/${randomUUID()}.svg`;
  const n = `${tenant}/tenant/logo/${randomUUID()}.svg`;
  const fields = {
    name: 'EZD-290 Draft',
    licenseNo: '',
    phone: '',
    email: '',
    website: '',
    address: '',
  };
  const draft: CompanyDraft = {
    fields,
    logo: { action: 'set', path: p },
    staged: { path: p, kind: 'svg', fileName: 'logo.svg', size: 100 },
  };

  it('T4 recheckDraftLogo sets the path the check route returned, not the draft path', async () => {
    expect(n).not.toBe(p);
    const check = vi.fn(
      async () =>
        new Response(JSON.stringify({ logo: { path: n, url: 'u', kind: 'svg' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    expect(await recheckDraftLogo(draft, check)).toEqual({
      logoChange: { action: 'set', path: n },
      staged: { path: n, url: 'u', kind: 'svg', fileName: 'logo.svg', size: 100 },
      logoError: null,
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(p);
  });
});
