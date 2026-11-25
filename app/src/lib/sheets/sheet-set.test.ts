// EZD-701 (AC-EZD-701-1, -2). Expected sets: S13 Decision 1 and 09h Sheet set rules (the ten-sheet order), Q-0779
// (A6.0 only with the Reflected ceiling plan box ticked), Q-0764 (the other boxes do not change the set), titles
// from the S13 mockup sheet list.
import { describe, expect, it } from 'vitest';
import { defaultSheetSet, defaultSheetSetData, sheetsForSet } from './sheet-set';

const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const TEN = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0'];

describe('EZD-701 default sheet set', () => {
  it('AC-1: no boxes ticked gives the nine default sheets, no A6.0', () => {
    const set = defaultSheetSet([]);
    expect(set.map((s) => s.number)).toEqual(NINE);
    expect(set.map((s) => s.title)).toEqual([
      'Cover',
      'Existing',
      'Demo',
      'Proposed',
      'Elevations',
      'Details',
      'Electrical',
      'Panel + load calc',
      'Finish schedule + renders',
    ]);
    expect(set.every((s) => s.viewports.length === 0)).toBe(true);
  });

  it('AC-2: the Reflected ceiling plan box adds A6.0 RCP between A5.0 and E1.0', () => {
    const set = defaultSheetSet(['rcp']);
    expect(set.map((s) => s.number)).toEqual(TEN);
    expect(set[6]).toEqual({ number: 'A6.0', title: 'RCP', group: 'architectural', viewports: [] });
  });

  it('the Electrical, Plumbing and Mechanical boxes do not change the set', () => {
    expect(defaultSheetSet(['electrical', 'plumbing', 'mechanical']).map((s) => s.number)).toEqual(
      NINE,
    );
    expect(
      defaultSheetSet(['electrical', 'plumbing', 'mechanical', 'rcp']).map((s) => s.number),
    ).toEqual(TEN);
  });

  it('groups the sheets Architectural, Electrical, Renderings', () => {
    expect(defaultSheetSet(['rcp']).map((s) => s.group)).toEqual([
      ...Array<string>(7).fill('architectural'),
      'electrical',
      'electrical',
      'renderings',
    ]);
  });
});

// EZD-726 (AC-EZD-726-1). Expected sets: S13 Decision 10 (the client set holds the renders and finish schedule,
// R1.0; countertop sheets come with EZD-720), S13 Decision 1 and Q-0779 for the permit set.
describe('EZD-726 sheets of each set', () => {
  it('the permit set is the default set', () => {
    expect(sheetsForSet('permit', []).map((s) => s.number)).toEqual(NINE);
    expect(sheetsForSet('permit', ['rcp']).map((s) => s.number)).toEqual(TEN);
  });

  it('the client set holds R1.0 Finish schedule + renders, whatever the scope boxes', () => {
    const r1 = {
      number: 'R1.0',
      title: 'Finish schedule + renders',
      group: 'renderings',
      viewports: [],
    };
    expect(sheetsForSet('client', [])).toEqual([r1]);
    expect(sheetsForSet('client', ['rcp', 'electrical', 'plumbing', 'mechanical'])).toEqual([r1]);
  });

  it('an unchanged set: permit 24x36, client 11x17, key on every sheet, never issued (03d; S13 size toggle)', () => {
    const rest = {
      sheetIds: [],
      keyPlacement: 'every_sheet',
      submittalProfileId: null,
      lastIssuedVersionId: null,
    };
    expect(defaultSheetSetData('permit')).toEqual({ kind: 'permit', size: '24x36', ...rest });
    expect(defaultSheetSetData('client')).toEqual({ kind: 'client', size: '11x17', ...rest });
  });
});

// EZD-702a (S13 Controls: Sheet row dot, Previous / Next, sheet label "4 of 10", Add sheet types, draft watermark
// "REV n DRAFT · NOT FOR CONSTRUCTION"; S13 Validation Numbering: Rev 0 at permit issue; S13 size toggle 24x36 / 11x17).
import {
  ADD_SHEET_TYPES,
  draftRevision,
  draftWatermark,
  neighbourSheet,
  paperInches,
  sheetDot,
  sheetPosition,
} from './sheet-set';

describe('EZD-702a Sheets screen helpers', () => {
  const ten = defaultSheetSet(['rcp']);
  const nine = defaultSheetSet([]);

  it('A3.0 is 4 of 10 with the RCP box and 4 of 9 without', () => {
    expect(sheetPosition(ten, 'A3.0')).toEqual({ index: 4, of: 10 });
    expect(sheetPosition(nine, 'A3.0')).toEqual({ index: 4, of: 9 });
    expect(sheetPosition(nine, 'A6.0')).toBeNull();
  });

  it('Previous and Next walk the set order and stop at the ends', () => {
    expect(neighbourSheet(ten, 'A5.0', 1)?.number).toBe('A6.0');
    expect(neighbourSheet(nine, 'A5.0', 1)?.number).toBe('E1.0');
    expect(neighbourSheet(ten, 'E1.0', -1)?.number).toBe('A6.0');
    expect(neighbourSheet(ten, 'A0.0', -1)).toBeNull();
    expect(neighbourSheet(ten, 'R1.0', 1)).toBeNull();
  });

  it('the Add sheet picker offers plan, elevation, details, schedule, renders, blank', () => {
    expect([...ADD_SHEET_TYPES]).toEqual(['plan', 'elevation', 'details', 'schedule', 'renders', 'blank']);
  });

  it('a sheet with open items needs approval; otherwise it is ready to issue', () => {
    expect(sheetDot({ openItems: 0, delta: null })).toBe('ready');
    expect(sheetDot({ openItems: 2, delta: null })).toBe('needs_approval');
  });

  it('a set never issued drafts Rev 0 and its watermark says so', () => {
    expect(draftRevision({ lastIssuedVersionId: null })).toBe(0);
    expect(draftWatermark(0)).toBe('REV 0 DRAFT · NOT FOR CONSTRUCTION');
    expect(draftWatermark(1)).toBe('REV 1 DRAFT · NOT FOR CONSTRUCTION');
  });

  it('24x36 is ARCH D landscape and 11x17 tabloid landscape', () => {
    expect(paperInches('24x36')).toEqual({ width: 36, height: 24 });
    expect(paperInches('11x17')).toEqual({ width: 17, height: 11 });
  });
});
