// EZD-113 T1 (vault/plans/EZD-113.md section 4; AC-EZD-113-2). Expected values: Decided "Input parsing"
// (Zod strictObject of four strings of at most 1,000 characters, trim, order empty name, empty email,
// invalid email, empty phone or address become null, patch = the edit object or { archived: boolean })
// and "List query" (q trimmed and capped at 1,000, archived 0/1, page ^[1-9][0-9]{0,5}$ else null);
// build step 8 (`checkCustomerDraft`, trimmed empty is a problem).
import { describe, expect, it } from 'vitest';
import { checkCustomerDraft } from '../../lib/customers/customers';
import { parseCustomerInput, parseCustomerPatch, parseListQuery } from './customers';

const ok = (value: unknown) => ({ ok: true, value });
const bad = (code: string) => ({ ok: false, code });
const valid = { name: 'Ann', email: 'a@x.io', phone: '', address: '' };

describe('EZD-113 customer input parsing', () => {
  it('T1 parseCustomerInput: trims, nulls empty phone and address, and refuses in the decided order', () => {
    expect(
      parseCustomerInput({ name: ' Ann ', email: ' A@x.io ', phone: ' ', address: '' }),
    ).toEqual(ok({ name: 'Ann', email: 'A@x.io', phone: null, address: null }));

    expect(parseCustomerInput({ ...valid, name: '  ' })).toEqual(bad('customer_name_required'));
    expect(parseCustomerInput({ ...valid, name: '', email: '' })).toEqual(
      bad('customer_name_required'),
    );
    expect(parseCustomerInput({ ...valid, email: '' })).toEqual(bad('customer_email_required'));
    expect(parseCustomerInput({ ...valid, email: 'x@' })).toEqual(bad('invalid_email'));

    expect(parseCustomerInput({ ...valid, fax: '1' })).toEqual(bad('invalid_input'));
    expect(parseCustomerInput({ name: 'Ann', email: 'a@x.io', address: '' })).toEqual(
      bad('invalid_input'),
    );
    expect(parseCustomerInput({ ...valid, name: 'n'.repeat(1001) })).toEqual(bad('invalid_input'));
  });

  it('T1 parseCustomerPatch: an archive flag, or the edit object, nothing else', () => {
    expect(parseCustomerPatch({ archived: true })).toEqual(ok({ kind: 'archive', archived: true }));
    expect(parseCustomerPatch({ archived: 'yes' })).toEqual(bad('invalid_input'));
    expect(parseCustomerPatch({ archived: true, name: 'x' })).toEqual(bad('invalid_input'));
  });

  it('T1 parseListQuery: defaults, trimmed search, archived flag, page and the three refusals', () => {
    expect(parseListQuery(new URLSearchParams(''))).toEqual({ q: '', archived: false, page: 1 });
    expect(parseListQuery(new URLSearchParams('q=%20ann%20&archived=1&page=2'))).toEqual({
      q: 'ann',
      archived: true,
      page: 2,
    });
    expect(parseListQuery(new URLSearchParams('page=0'))).toBeNull();
    expect(parseListQuery(new URLSearchParams('page=abc'))).toBeNull();
    expect(parseListQuery(new URLSearchParams('archived=2'))).toBeNull();
  });

  it('T1 checkCustomerDraft: an empty draft has a name problem and an email problem', () => {
    expect(checkCustomerDraft({ name: '', email: '', phone: '', address: '' })).toEqual({
      name: 'customer_name_required',
      email: 'customer_email_required',
    });
  });
});
