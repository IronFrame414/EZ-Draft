// EZD-715 AC-EZD-715-2 (08 Exports "File name": address + description, e.g. "336 Golfview Rd buildingplans"; the
// version stays in the file name by default, Round 25; a profile can switch to same-name-as-original; S15c default
// template "{address} {description}" "with the version kept in the name"). Expected names are the spec's example with
// the board S15c's " Rev n.pdf" ending and, for one PDF per sheet, vault/build/assumptions/EZD-723.md's
// "336 Golfview Rd buildingplans A1.0 Rev 0.pdf".
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN_PROFILE, exportFiles, revisionToken, SET_DESCRIPTION } from './file-name';

const sheets = [
  { number: 'A1.0', discipline: 'Architectural' },
  { number: 'A2.0', discipline: 'Architectural' },
  { number: 'E1.0', discipline: 'Electrical' },
];
const values = {
  address: '336 Golfview Rd',
  description: SET_DESCRIPTION.permit,
  rev: revisionToken(0),
  date: '2026-11-26',
};

describe('EZD-715 export file names', () => {
  it('AC-EZD-715-2 the default name starts with address + description and keeps the version', () => {
    const files = exportFiles(null, sheets, values);
    expect(files).toHaveLength(1);
    const [f] = files;
    expect(f!.name.startsWith('336 Golfview Rd buildingplans')).toBe(true);
    expect(f!.name).toBe('336 Golfview Rd buildingplans Rev 0.pdf');
    expect(f!.sheets).toEqual(['A1.0', 'A2.0', 'E1.0']);
  });

  it('AC-EZD-715-2 the company default profile names the same way, with a later revision', () => {
    const [f] = exportFiles(DEFAULT_PLAN_PROFILE, sheets, { ...values, rev: revisionToken(2) });
    expect(f!.name).toBe('336 Golfview Rd buildingplans Rev 2.pdf');
  });

  it('one PDF per sheet from the same run: each named with its sheet before the version', () => {
    const files = exportFiles(null, sheets, values, 'sheet');
    expect(files.map((f) => f.name)).toEqual([
      '336 Golfview Rd buildingplans A1.0 Rev 0.pdf',
      '336 Golfview Rd buildingplans A2.0 Rev 0.pdf',
      '336 Golfview Rd buildingplans E1.0 Rev 0.pdf',
    ]);
    expect(files.map((f) => f.sheets)).toEqual([['A1.0'], ['A2.0'], ['E1.0']]);
  });

  it('a profile set to same-name-as-original leaves the version out', () => {
    const [f] = exportFiles({ ...DEFAULT_PLAN_PROFILE, revisionNaming: 'same_name' }, sheets, values);
    expect(f!.name).toBe('336 Golfview Rd buildingplans.pdf');
  });

  it('a template that places {rev} itself is used as written', () => {
    const [f] = exportFiles(
      { ...DEFAULT_PLAN_PROFILE, namingTemplate: '{address} {rev} {description}' },
      sheets,
      values,
    );
    expect(f!.name).toBe('336 Golfview Rd Rev 0 buildingplans.pdf');
  });

  it('a per-discipline profile names each discipline before the version', () => {
    const files = exportFiles({ ...DEFAULT_PLAN_PROFILE, fileSplit: 'per_discipline' }, sheets, values);
    expect(files.map((f) => f.name)).toEqual([
      '336 Golfview Rd buildingplans Architectural Rev 0.pdf',
      '336 Golfview Rd buildingplans Electrical Rev 0.pdf',
    ]);
  });
});
