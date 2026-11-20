// EZD-713 AC-EZD-713-1 and AC-EZD-713-2. Expected values from S15c and 08 Department submittal rules: the three
// split modes (combined set / per discipline or consultant / one PDF per sheet), the default name "{address}
// {description}" e.g. "336 Golfview Rd buildingplans", the stripped characters / ? < > \ : * | " , # and double
// spaces, West Palm Beach ALL CAPS within 30 characters and PBC within 80 (the board counts ".pdf": "[Address]
// buildingplans Rev 1.pdf 33 / 80"), Same name as original (revision ID only in the title and revision blocks; a
// resubmittal keeps the original file name), Resubmittal mode Changed sheets only. Sheet and discipline added at
// the end when the template has no {sheet} or {discipline}: assumptions EZD-713.
import { describe, expect, it } from 'vitest';
import { fileName, planFiles, type PlanProfile, type PlanSheet } from './file-plan';

// A 10-sheet set: disciplines interleave so per-discipline files follow first appearance.
const SET: PlanSheet[] = [
  { number: 'A0.0', discipline: 'Architectural' },
  { number: 'A1.0', discipline: 'Architectural' },
  { number: 'A1.1', discipline: 'Architectural' },
  { number: 'A2.0', discipline: 'Architectural' },
  { number: 'S1.0', discipline: 'Structural' },
  { number: 'S2.0', discipline: 'Structural' },
  { number: 'A3.0', discipline: 'Architectural' },
  { number: 'E1.0', discipline: 'Electrical' },
  { number: 'E2.0', discipline: 'Electrical' },
  { number: 'P1.0', discipline: 'Plumbing' },
];
const ALL = SET.map((s) => s.number);
const REV1 = {
  address: '336 Golfview Rd',
  description: 'buildingplans',
  rev: 'Rev 1',
  date: '2026-11-19',
};
const BASE: PlanProfile = {
  fileSplit: 'combined',
  namingTemplate: '{address} {description} {rev}',
  namingMaxLength: null,
  namingUpper: false,
  revisionNaming: 'version_in_name',
  resubmittalMode: 'changed_sheets',
};

describe('EZD-713 AC-EZD-713-1 file split of a 10-sheet set', () => {
  it('combined set: one file holding all ten sheets', () => {
    expect(planFiles(BASE, SET, REV1)).toEqual([
      { key: 'combined', name: '336 Golfview Rd buildingplans Rev 1.pdf', sheets: ALL },
    ]);
  });

  it('per discipline or consultant: one file per discipline, in first-appearance order', () => {
    const files = planFiles({ ...BASE, fileSplit: 'per_discipline' }, SET, REV1);
    expect(files).toEqual([
      {
        key: 'Architectural',
        name: '336 Golfview Rd buildingplans Rev 1 Architectural.pdf',
        sheets: ['A0.0', 'A1.0', 'A1.1', 'A2.0', 'A3.0'],
      },
      {
        key: 'Structural',
        name: '336 Golfview Rd buildingplans Rev 1 Structural.pdf',
        sheets: ['S1.0', 'S2.0'],
      },
      {
        key: 'Electrical',
        name: '336 Golfview Rd buildingplans Rev 1 Electrical.pdf',
        sheets: ['E1.0', 'E2.0'],
      },
      {
        key: 'Plumbing',
        name: '336 Golfview Rd buildingplans Rev 1 Plumbing.pdf',
        sheets: ['P1.0'],
      },
    ]);
  });

  it('one PDF per sheet: ten files in set order, each named with its sheet number', () => {
    const files = planFiles({ ...BASE, fileSplit: 'per_sheet' }, SET, REV1);
    expect(files.map((f) => f.name)).toEqual([
      '336 Golfview Rd buildingplans Rev 1 A0.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 A1.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 A1.1.pdf',
      '336 Golfview Rd buildingplans Rev 1 A2.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 S1.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 S2.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 A3.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 E1.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 E2.0.pdf',
      '336 Golfview Rd buildingplans Rev 1 P1.0.pdf',
    ]);
    expect(files.map((f) => f.sheets)).toEqual(ALL.map((n) => [n]));
  });

  it('a {sheet} or {discipline} in the template places it there instead of at the end', () => {
    const sheet = planFiles(
      { ...BASE, fileSplit: 'per_sheet', namingTemplate: '{sheet} {address} {rev}' },
      SET.slice(0, 2),
      REV1,
    );
    expect(sheet.map((f) => f.name)).toEqual([
      'A0.0 336 Golfview Rd Rev 1.pdf',
      'A1.0 336 Golfview Rd Rev 1.pdf',
    ]);
    const disc = planFiles(
      { ...BASE, fileSplit: 'per_discipline', namingTemplate: '{discipline} {address}' },
      SET.slice(4, 6),
      REV1,
    );
    expect(disc.map((f) => f.name)).toEqual(['Structural 336 Golfview Rd.pdf']);
  });

  it('West Palm Beach: ALL CAPS within 30 characters, ".pdf" counted; the discipline is kept whole', () => {
    const wpb: PlanProfile = {
      ...BASE,
      namingTemplate: '{address} {description}',
      namingUpper: true,
      namingMaxLength: 30,
    };
    expect(planFiles(wpb, SET, REV1).map((f) => f.name)).toEqual([
      '336 GOLFVIEW RD BUILDINGPL.pdf',
    ]);
    const perDiscipline = planFiles({ ...wpb, fileSplit: 'per_discipline' }, SET, REV1);
    expect(perDiscipline[0]?.name).toBe('336 GOLFVIEW ARCHITECTURAL.pdf');
    for (const f of perDiscipline) expect(f.name.length).toBeLessThanOrEqual(30);
  });

  it('PBC 80 characters: the default name is well within it (board "33 / 80")', () => {
    const [f] = planFiles({ ...BASE, namingMaxLength: 80 }, SET, {
      ...REV1,
      address: '[Address]',
    });
    expect(f?.name).toBe('[Address] buildingplans Rev 1.pdf');
    expect(f?.name.length).toBe(33);
  });

  it('strips / ? < > \\ : * | " , # and double spaces from the filled-in name', () => {
    expect(
      fileName(
        '{address}  {description}',
        { address: '336 Golfview Rd, Unit #2', description: 'kitchen/bath "plans"?' },
        { upper: false, maxLength: null },
      ),
    ).toBe('336 Golfview Rd Unit 2 kitchenbath plans.pdf');
  });

  it('an empty set makes no files', () => {
    expect(planFiles(BASE, [], REV1)).toEqual([]);
  });
});

describe('EZD-713 AC-EZD-713-2 resubmittal with Same name as original', () => {
  const REV0 = { ...REV1, rev: 'Rev 0', date: '2026-11-01' };
  const sameName: PlanProfile = {
    ...BASE,
    fileSplit: 'per_sheet',
    // {date} differs between the two submittals, so only "keep the original name" passes.
    namingTemplate: '{address} {description} {rev} {date}',
    revisionNaming: 'same_name',
  };

  it('the original submittal leaves the revision ID out of the names', () => {
    const original = planFiles(sameName, SET, REV0);
    expect(original[1]?.name).toBe('336 Golfview Rd buildingplans 2026-11-01 A1.0.pdf');
  });

  it('changed sheets only: the resubmittal holds the changed sheets under their original names', () => {
    const original = planFiles(sameName, SET, REV0);
    const resub = planFiles(sameName, SET, REV1, { original, changed: ['A1.0', 'E1.0'] });
    expect(resub).toEqual([
      { key: 'A1.0', name: '336 Golfview Rd buildingplans 2026-11-01 A1.0.pdf', sheets: ['A1.0'] },
      { key: 'E1.0', name: '336 Golfview Rd buildingplans 2026-11-01 E1.0.pdf', sheets: ['E1.0'] },
    ]);
    const byKey = new Map(original.map((f) => [f.key, f.name]));
    for (const f of resub) expect(f.name).toBe(byKey.get(f.key));
  });

  it('full discipline set: every file keeps its original name; a new sheet gets a name without the revision', () => {
    const profile: PlanProfile = {
      ...sameName,
      fileSplit: 'per_discipline',
      resubmittalMode: 'full_set_narrative',
    };
    const original = planFiles(profile, SET.slice(0, 9), REV0);
    const resub = planFiles(profile, SET, REV1, { original, changed: ['A1.0'] });
    expect(resub.map((f) => f.name)).toEqual([
      ...original.map((f) => f.name),
      '336 Golfview Rd buildingplans 2026-11-19 Plumbing.pdf',
    ]);
    expect(resub[0]?.sheets).toEqual(['A0.0', 'A1.0', 'A1.1', 'A2.0', 'A3.0']);
  });

  it('combined set: the one file keeps its name', () => {
    const profile: PlanProfile = { ...sameName, fileSplit: 'combined' };
    const original = planFiles(profile, SET, REV0);
    const resub = planFiles(profile, SET, REV1, { original, changed: ['S1.0'] });
    expect(resub).toEqual([
      {
        key: 'combined',
        name: '336 Golfview Rd buildingplans 2026-11-01.pdf',
        sheets: ['S1.0'],
      },
    ]);
  });

  it('with Version in file name the resubmittal names carry the new revision instead', () => {
    const profile: PlanProfile = { ...sameName, revisionNaming: 'version_in_name' };
    const original = planFiles(profile, SET, REV0);
    const resub = planFiles(profile, SET, REV1, { original, changed: ['A1.0'] });
    expect(original[1]?.name).toBe('336 Golfview Rd buildingplans Rev 0 2026-11-01 A1.0.pdf');
    expect(resub.map((f) => f.name)).toEqual([
      '336 Golfview Rd buildingplans Rev 1 2026-11-19 A1.0.pdf',
    ]);
  });
});
