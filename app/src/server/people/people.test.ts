// EZD-126 R2 (AC-EZD-126-5; L-061 every input bounded): `parsePeopleIds` takes a comma list of at most 20 distinct
// UUIDs, lower-cased, first order kept; anything else is null. 20 is PEOPLE_IDS_MAX; 740 = 20 x 37 characters.
import { describe, expect, it } from 'vitest';
import { PEOPLE_IDS_MAX, parsePeopleIds } from './people';

const U1 = '0b7c3a52-1d2e-4f00-8a11-0000000000a1';
const uuidN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('EZD-126 parsePeopleIds', () => {
  it('EZD-126 R2 accepts up to 20 distinct UUIDs and refuses everything else', () => {
    expect(PEOPLE_IDS_MAX).toBe(20);
    expect(parsePeopleIds(null)).toBeNull();
    expect(parsePeopleIds('')).toBeNull();
    expect(parsePeopleIds('x')).toBeNull();
    expect(parsePeopleIds(U1)).toEqual([U1]);
    expect(parsePeopleIds(`${U1},${U1}`)).toEqual([U1]);
    expect(parsePeopleIds(U1.toUpperCase())).toEqual([U1]);
    const twenty = Array.from({ length: 20 }, (_, i) => uuidN(i + 1));
    expect(parsePeopleIds(twenty.join(','))).toEqual(twenty);
    const twentyOne = Array.from({ length: 21 }, (_, i) => uuidN(i + 1));
    expect(parsePeopleIds(twentyOne.join(','))).toBeNull();
    expect(parsePeopleIds(','.repeat(741))).toBeNull();
    expect(parsePeopleIds(`${U1},`)).toBeNull();
  });
});
