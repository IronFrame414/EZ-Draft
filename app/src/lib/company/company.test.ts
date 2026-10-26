// EZD-112 T1 and T11 (vault/plans/EZD-112.md section 4; AC-EZD-112-4).
// Expected values: Decided "Size limit" (5 MB = 5,000,000 bytes, `size > limit` is too large), "Type from
// name" (last extension, lower-cased), "`checkLogoFile` order" (type first, then size), "Draft restore"
// (what `recheckDraftLogo` returns for each check answer) and "Check route" (400 body `message_key`).
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkLogoFile, recheckDraftLogo, type CompanyDraft } from './company';

describe('EZD-112 logo file rules', () => {
  it('T1 checkLogoFile: type first, then size, limit 5,000,000 bytes', () => {
    const cases: [string, number, string | null][] = [
      ['a.png', 5_000_000, null],
      ['a.PNG', 5_000_001, 'logo_too_large'],
      ['a.png', 6_000_000, 'logo_too_large'],
      ['b.JPEG', 10, null],
      ['c.svg', 1, null],
      ['d.gif', 10, 'logo_wrong_type'],
      ['noext', 10, 'logo_wrong_type'],
      ['e.gif', 6_000_000, 'logo_wrong_type'],
    ];
    for (const [name, size, expected] of cases) {
      expect(checkLogoFile({ name, size }), `${name} ${size}`).toBe(expected);
    }
  });
});

describe('EZD-112 draft logo re-check', () => {
  const tenant = randomUUID();
  const path = `${tenant}/tenant/logo/${randomUUID()}.png`;
  const fields = {
    name: 'EZD-112 Draft',
    licenseNo: '',
    phone: '',
    email: '',
    website: '',
    address: '',
  };
  const setDraft: CompanyDraft = {
    fields,
    logo: { action: 'set', path },
    staged: { path, kind: 'png', fileName: 'logo.png', size: 100 },
  };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('T11 recheckDraftLogo: 400 keeps the saved logo, 500 reports the upload failure, 200 sets, remove asks nothing', async () => {
    // (a) the check route answers 400 invalid_input (the object never reached Storage)
    const check400 = vi.fn<(p: string) => Promise<Response>>(async () =>
      json({ error: { code: 'invalid_input', message_key: 'error.invalid_input' } }, 400),
    );
    expect(await recheckDraftLogo(setDraft, check400)).toEqual({
      logoChange: { action: 'keep' },
      staged: null,
      logoError: 'error.invalid_input',
    });
    expect(check400).toHaveBeenCalledTimes(1);
    expect(check400).toHaveBeenCalledWith(path);

    // (b) any other status
    const check500 = vi.fn<(p: string) => Promise<Response>>(async () =>
      json({ error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } }, 500),
    );
    expect(await recheckDraftLogo(setDraft, check500)).toEqual({
      logoChange: { action: 'keep' },
      staged: null,
      logoError: 'office.company.logo_upload_failed',
    });
    expect(check500).toHaveBeenCalledTimes(1);

    // (c) 200: the new signed url, the draft's file name and size
    const check200 = vi.fn(async (p: string) =>
      json({ logo: { path: p, url: 'u2', kind: 'png' } }, 200),
    );
    expect(await recheckDraftLogo(setDraft, check200)).toEqual({
      logoChange: { action: 'set', path },
      staged: { path, url: 'u2', kind: 'png', fileName: 'logo.png', size: 100 },
      logoError: null,
    });
    expect(check200).toHaveBeenCalledTimes(1);
    expect(check200).toHaveBeenCalledWith(path);

    // (d) remove and keep: unchanged, no request
    const never = vi.fn<(p: string) => Promise<Response>>(async () => json({}, 200));
    expect(
      await recheckDraftLogo({ fields, logo: { action: 'remove' }, staged: null }, never),
    ).toEqual({ logoChange: { action: 'remove' }, staged: null, logoError: null });
    expect(
      await recheckDraftLogo({ fields, logo: { action: 'keep' }, staged: null }, never),
    ).toEqual({ logoChange: { action: 'keep' }, staged: null, logoError: null });
    expect(never).not.toHaveBeenCalled();
  });
});
