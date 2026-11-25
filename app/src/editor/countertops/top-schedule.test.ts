// EZD-418 (AC-EZD-418-1 "Schedule matches the pieces and exports to CSV"; 08 Exports "Countertop schedule | Piece,
// material, thickness, area, edge profile, edge length"). Expected values are hand counts from the board's three tops
// (test-fixture.ts boardPiecesModel; packages/geometry/src/countertops/schedule.test.ts):
//   A "Back wall"   3608.25 sq in / 144 = 25.057 → 25.1 sq ft; exposed 116"  / 12 = 9.667 → 9.7 lf
//   B "Left return" 1606.5  sq in / 144 = 11.156 → 11.2 sq ft; exposed 88.5" / 12 = 7.375 → 7.4 lf
//   C "Island"      2868.75 sq in / 144 = 19.922 → 19.9 sq ft (board "19.9 sq ft"); exposed 228" / 12 = 19.0 lf
// Thickness 3 / 2.54 in = 3 cm (board "Quartz · 3 cm"). No material or profile is set: "—".
import { describe, expect, it } from 'vitest';
import { modelObjects } from '../cabinets/cabinet-view';
import { countertopMaterialChanges } from './material';
import { boardPiecesModel, CT_FLOOR, ctId } from './test-fixture';
import { countertopChange, countertopPieces } from './trace-tool';
import { topScheduleCsv, topScheduleLines, type TopScheduleText } from './top-schedule';
import { createModelStore } from '../model/model-store';

const HEADERS = ['Piece', 'Material', 'Thickness', 'Area (sq ft)', 'Edge profile', 'Edge length (lf)'] as const;
const QUARTZ = 'a0000000-0000-4000-8000-000000000001';
const HALF_BULLNOSE = 'b0000000-0000-4000-8000-000000000001';
const TEXT: TopScheduleText = {
  headers: HEADERS,
  none: '—',
  materialName: (id) => (id === QUARTZ ? 'Quartz' : null),
  materialUnknown: 'Catalog material',
  profileName: (id) => (id === HALF_BULLNOSE ? 'Half bullnose' : null),
  thicknessCm: (cm) => `${cm} cm`,
};

const boardPieces = () => countertopPieces(modelObjects(boardPiecesModel()), CT_FLOOR);

describe('EZD-418 top schedule', () => {
  it('AC-EZD-418-1: the schedule matches the board pieces', () => {
    expect(topScheduleLines(boardPieces().map((p) => p.data), TEXT).map((l) => l.cells)).toEqual([
      ['A · Back wall', '—', '3 cm', '25.1', '—', '9.7'],
      ['B · Left return', '—', '3 cm', '11.2', '—', '7.4'],
      ['C · Island', '—', '3 cm', '19.9', '—', '19.0'],
    ]);
  });

  it('AC-EZD-418-1: the CSV holds the heading row and the same cells, CRLF line ends', () => {
    const lines = topScheduleLines(boardPieces().map((p) => p.data), TEXT);
    expect(topScheduleCsv(lines, HEADERS)).toBe(
      'Piece,Material,Thickness,Area (sq ft),Edge profile,Edge length (lf)\r\n' +
        'A · Back wall,—,3 cm,25.1,—,9.7\r\n' +
        'B · Left return,—,3 cm,11.2,—,7.4\r\n' +
        'C · Island,—,3 cm,19.9,—,19.0\r\n',
    );
  });

  it('follows a material and an edge profile set on the pieces', () => {
    const store = createModelStore({ objects: boardPiecesModel() });
    store.applyEdit(countertopMaterialChanges(countertopPieces(modelObjects(store.getState().objects), CT_FLOOR), QUARTZ));
    const island = countertopPieces(modelObjects(store.getState().objects), CT_FLOOR).find(
      (p) => p.id === ctId(303),
    )!;
    store.applyEdit([
      countertopChange(island.id, {
        ...island.data,
        attributes: {
          ...island.data.attributes,
          edges: island.data.attributes.edges.map((e) => ({ ...e, profileId: HALF_BULLNOSE })),
        },
      }),
    ]);
    const lines = topScheduleLines(
      countertopPieces(modelObjects(store.getState().objects), CT_FLOOR).map((p) => p.data),
      TEXT,
    );
    expect(lines.map((l) => [l.cells[1], l.cells[4]])).toEqual([
      ['Quartz', '—'],
      ['Quartz', '—'],
      ['Quartz', 'Half bullnose'],
    ]);
  });

  it('a material not in the catalog read shows as a catalog material', () => {
    const [a] = boardPieces();
    const data = { ...a!.data, attributes: { ...a!.data.attributes, materialItemId: ctId(999) } };
    expect(topScheduleLines([data], TEXT)[0]!.cells[1]).toBe('Catalog material');
  });

  it('a piece name a spreadsheet would read as a formula stays text, and commas and quotes are quoted', () => {
    const [a, b] = boardPieces();
    const evil = { ...a!.data, attributes: { ...a!.data.attributes, label: 'A', name: '' } };
    const lines = topScheduleLines(
      [evil, { ...b!.data, attributes: { ...b!.data.attributes, name: 'Run, "left"' } }],
      TEXT,
    );
    const formula = { label: 'Z', cells: ['=HYPERLINK("x")', '+1', '-1', '@a', '—', '0.0'] as const };
    const csv = topScheduleCsv([...lines, formula], HEADERS).split('\r\n');
    expect(csv[1]).toBe('A,—,3 cm,25.1,—,9.7');
    expect(csv[2]).toBe('"B · Run, ""left""",—,3 cm,11.2,—,7.4');
    expect(csv[3]).toBe(`"'=HYPERLINK(""x"")",'+1,'-1,'@a,—,0.0`);
  });
});
