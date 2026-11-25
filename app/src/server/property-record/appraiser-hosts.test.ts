// EZD-711 (vault/build/assumptions.md EZD-711 "Which appraiser sites the server reads": Palm Beach County and Broward
// County only, over https; board S01bWizard "pbcpao.gov/Property/Details?parcelId=[PCN]"): the hosts the server reads.
import { describe, expect, it } from 'vitest';
import { appraiserUrl, isAppraiserUrl } from './appraiser-hosts';

describe('EZD-711 appraiser hosts', () => {
  it('reads the Palm Beach and Broward appraiser sites over https', () => {
    expect(isAppraiserUrl('https://pbcpao.gov/Property/Details?parcelId=00434421010000010')).toBe(true);
    expect(isAppraiserUrl('https://www.pbcpao.gov/Property/Details?parcelId=1')).toBe(true);
    expect(isAppraiserUrl('https://web.bcpa.net/BcpaClient/#/Record-Search')).toBe(true);
    expect(isAppraiserUrl('https://bcpa.net/RecInfo.asp?URL_Folio=1')).toBe(true);
  });

  it('reads a pasted link without a scheme (the board shows one) as https', () => {
    expect(appraiserUrl('pbcpao.gov/Property/Details?parcelId=1')?.toString()).toBe(
      'https://pbcpao.gov/Property/Details?parcelId=1',
    );
  });

  it('refuses any other host, http, a user name, another port and look-alike hosts', () => {
    expect(isAppraiserUrl('https://example.com/Property/Details')).toBe(false);
    expect(isAppraiserUrl('http://pbcpao.gov/Property/Details')).toBe(false);
    expect(isAppraiserUrl('https://user:pw@pbcpao.gov/')).toBe(false);
    expect(isAppraiserUrl('https://pbcpao.gov:8443/')).toBe(false);
    expect(isAppraiserUrl('https://pbcpao.gov.evil.com/')).toBe(false);
    expect(isAppraiserUrl('https://evilpbcpao.gov/')).toBe(false);
    expect(isAppraiserUrl('https://localhost/')).toBe(false);
    expect(isAppraiserUrl('https://127.0.0.1/')).toBe(false);
    expect(isAppraiserUrl('file:///etc/passwd')).toBe(false);
    expect(isAppraiserUrl('')).toBe(false);
    expect(isAppraiserUrl(`https://pbcpao.gov/${'a'.repeat(2100)}`)).toBe(false);
  });
});
