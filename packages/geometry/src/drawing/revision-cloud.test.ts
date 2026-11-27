// EZD-232 (S03 rail Revision cloud "Draw a cloud and delta tag manually"; vault/build/assumptions/EZD-232.md scallop
// 3/8" and delta 3/8" on paper): the drawing items of a stored revision cloud. Expected numbers are worked by hand:
// on a sheet (1/4" = 1'-0") one paper inch is 48 model inches, so a scallop is 18" across and the delta 18" a side.
import { describe, expect, it } from 'vitest';
import { SHEET_ANNOTATION_SCALE } from '../dimensions/items';
import type { ModelDocument } from '../schema';
import { buildDrawingList } from './build';
import { cloudScallops, revisionCloudItems, type RevisionCloudObject } from './revision-cloud';

const LEVEL = '00000000-0000-4000-8000-0000000000a1';
const ID = '00000000-0000-4000-8000-0000000000e1';

// Counter-clockwise, 72" by 36".
const RECT = [
  { x: 0, y: 0 },
  { x: 72, y: 0 },
  { x: 72, y: 36 },
  { x: 0, y: 36 },
];
const cloud = (rev: number | null = null, boundary = RECT): RevisionCloudObject => ({
  id: ID,
  type: 'revision_cloud',
  data: {
    geometry: { boundary, tag: { x: 72, y: 36 } },
    level: LEVEL,
    attributes: { source: 'manual', rev },
  },
});

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('EZD-232 revision cloud scallops', () => {
  it('puts a whole number of 18" scallops on each side: 4 + 2 + 4 + 2 on a 72" by 36" outline', () => {
    const s = cloudScallops(RECT, 18);
    expect(s).toHaveLength(12);
    for (const a of s) near(a.radius, 9);
    // The bottom side runs +x; its first scallop is centred at (9, 0) and bulges down (outside): 180° to 360°.
    near(s[0]!.center.x, 9);
    near(s[0]!.center.y, 0);
    near(s[0]!.startAngle, 180);
    near(s[0]!.endAngle, 360);
    // The right side runs +y; its first scallop is centred at (72, 9) and bulges right: 270° to 450°.
    near(s[4]!.center.x, 72);
    near(s[4]!.center.y, 9);
    near(s[4]!.startAngle, 270);
    near(s[4]!.endAngle, 450);
  });

  it('rounds a side to the nearest whole count: 80" takes 4 scallops of 20"', () => {
    const s = cloudScallops(
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 40, y: 60 },
      ],
      18,
    );
    expect(s.filter((a) => Math.abs(a.center.y) < 1e-9)).toHaveLength(4);
    near(s[0]!.radius, 10);
  });

  it('bulges outward when the outline runs clockwise too', () => {
    const s = cloudScallops([...RECT].reverse(), 18);
    expect(s).toHaveLength(12);
    // Reversed, the first side is the top one (0,36) to (72,36), running +x; its first scallop is centred at (9, 36)
    // and, midway through its sweep, is at y = 45: above the outline, outside it.
    const top = s[0]!;
    near(top.center.x, 9);
    near(top.center.y, 36);
    const mid = ((top.startAngle + 90) * Math.PI) / 180;
    near(top.center.y + top.radius * Math.sin(mid), 45);
  });
});

describe('EZD-232 revision cloud drawing items', () => {
  it('draws the scallops as arcs and the delta as three lines on `dimensions`, with no number before Rev N', () => {
    const items = revisionCloudItems(cloud(), SHEET_ANNOTATION_SCALE);
    expect(items.filter((i) => i.kind === 'arc')).toHaveLength(12);
    const lines = items.filter((i) => i.kind === 'line');
    expect(lines).toHaveLength(3);
    expect(items.some((i) => i.kind === 'text')).toBe(false);
    for (const i of items) {
      expect(i.layer).toBe('dimensions');
      expect(i.objectId).toBe(ID);
    }
    // An 18" side: each line is 18 long, and the top corner is 18/√3 above the tag point.
    for (const l of lines)
      if (l.kind === 'line') near(Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y), 18);
    const top = Math.max(...lines.map((l) => (l.kind === 'line' ? l.from.y : 0)));
    near(top, 36 + 18 / Math.sqrt(3));
  });

  it('shows the revision number in the delta at the 3/32" note size (6.75 pt on a sheet)', () => {
    const items = revisionCloudItems(cloud(2), SHEET_ANNOTATION_SCALE);
    const t = items.find((i) => i.kind === 'text');
    expect(t).toBeDefined();
    if (t?.kind !== 'text') return;
    expect(t.text).toBe('2');
    near(t.sizePt, 6.75);
    expect(t.at).toEqual({ x: 72, y: 36 });
  });

  it('keeps its printed size at the plan scale: at 1/2" = 1\'-0" a scallop is 9" across', () => {
    // 1/2" scale: one paper inch is 24 model inches; 72 / 9 = 8 and 36 / 9 = 4 scallops a side.
    const half = { paperPtPerIn: 72, modelInPerPt: 24 / 72 };
    expect(revisionCloudItems(cloud(), half).filter((i) => i.kind === 'arc')).toHaveLength(24);
  });

  it('is drawn by the drawing list on its floor', () => {
    const doc = {
      schema_version: 7,
      objects: [
        {
          id: LEVEL,
          type: 'floor',
          data: { name: 'Floor 1', elevation: 0, order: 0 },
        },
        cloud(),
      ],
    } as unknown as ModelDocument;
    const list = buildDrawingList(doc, {
      level: LEVEL,
      dimensionTextPt: 9,
      roomHatch: null,
      roomLabelPt: 9,
    });
    expect(list.items.filter((i) => i.objectId === ID && i.kind === 'arc')).toHaveLength(12);
  });
});
