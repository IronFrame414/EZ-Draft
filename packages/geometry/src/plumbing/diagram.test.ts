// EZD-730 AC-EZD-730-1, -2: the plumbing diagram lists every plumbing fixture on the plan, and a removed fixture leaves
// it. Expected d.f.u. come from code rule P-126's check text (vault/spec/code-rules.json): "lavatory 1, ... bathtub 2,
// shower 2, kitchen sink 2, dishwasher 2, ... washer standpipe 2, water closet (1.6 gpf) 3"; P-126 counts the "added
// load", so the total is New fixtures only. Worked by hand: New toilet 3 + New lavatory 1 + New tub 2 = 6; the
// Existing sink (2) is listed but not added; deleting the toilet leaves 1 + 2 = 3.
// Trap sizes from P-174's check text ("lavatory 1-1/4 in.; bathtub 1-1/2 in.; kitchen sink 1-1/2 in.; dishwasher ...
// 1-1/2 in.; ... clothes washer standpipe 2 in.; ... shower ... 5.7 gpm or less 1-1/2 in."), water closet 3 in. from
// P-140 ("No water closets on pipes smaller than 3 in."). Branch sizes from P-140's limits (1-1/2 in. 3, 2 in. 6,
// 2-1/2 in. 12, 3 in. 20, 4 in. 160), never smaller than a trap entering it (P-174): the plan's floor carries
// 3 + 1 + 2 + 2 = 8 with a water closet, so 3 in. (2-1/2 in. would carry 8 but a water closet needs 3 in.); without
// the toilet 1 + 2 + 2 = 5 on 2 in. (1-1/2 in. carries only 3); a washer alone, 2, fits 1-1/2 in. by load but its
// 2 in. trap makes the branch 2 in.
import { describe, expect, it } from 'vitest';
import type { FixtureObject } from '../fixtures/fixtures';
import type { TileShowerObject } from '../fixtures/tile-shower';
import type { FixtureKind } from '../schema/fixture';
import { plumbingDiagram, RISER_STACK_ID, riserBranchId } from './diagram';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const F2 = '5a1c0e7e-2b5f-4d0a-9d55-1f0c2a6b7e11';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture(
  n: number,
  kind: FixtureKind,
  status: FixtureObject['data']['status'] = 'new',
  level = F1,
): FixtureObject {
  return {
    id: id(n),
    type: 'fixture',
    data: {
      geometry: { center: { x: n * 40, y: 0 }, axis: { x: 1, y: 0 } },
      status,
      level,
      attributes: { kind, width: 20, depth: 20 },
    },
  };
}

function tileShower(n: number, status: TileShowerObject['data']['status'] = 'new'): TileShowerObject {
  const p = (x: number, y: number) => ({ x, y });
  return {
    id: id(n),
    type: 'tile_shower',
    data: {
      geometry: { footprint: [p(0, 0), p(60, 0), p(60, 36), p(0, 36)] },
      status,
      level: F2,
      attributes: {
        curb: { height: 4, width: 4 },
        niches: [],
        bench: null,
        glass: [],
        panSlope: 0.25,
        drain: { type: 'linear', side: 2, offset: 0, length: 60 },
      },
    },
  };
}

const wall = { id: id(99), type: 'wall', data: {} };

function plan() {
  return [
    fixture(1, 'toilet'),
    fixture(2, 'lavatory'),
    wall,
    fixture(3, 'tub'),
    fixture(4, 'sink', 'existing'),
    fixture(5, 'range'),
    fixture(6, 'refrigerator'),
  ];
}

describe('EZD-730 plumbing diagram', () => {
  it('AC-1 lists every plumbing fixture on the plan, in plan order, and no appliances or other objects', () => {
    const d = plumbingDiagram(plan());
    expect(d.rows).toEqual([
      { objectId: id(1), kind: 'toilet', status: 'new', level: F1, dfu: 3, trapIn: 3 },
      { objectId: id(2), kind: 'lavatory', status: 'new', level: F1, dfu: 1, trapIn: 1.25 },
      { objectId: id(3), kind: 'tub', status: 'new', level: F1, dfu: 2, trapIn: 1.5 },
      { objectId: id(4), kind: 'sink', status: 'existing', level: F1, dfu: 2, trapIn: 1.5 },
    ]);
    expect(d.newDfu).toBe(6);
  });

  it('AC-1 every plumbing fixture kind is listed, with its P-126 d.f.u. or none', () => {
    const kinds: FixtureKind[] = [
      'toilet',
      'lavatory',
      'tub',
      'shower_prefab',
      'sink',
      'dishwasher',
      'disposal',
      'washer',
      'water_heater',
    ];
    const d = plumbingDiagram([...kinds.map((k, i) => fixture(i + 1, k)), tileShower(20)]);
    expect(d.rows.map((r) => [r.kind, r.dfu, r.trapIn])).toEqual([
      ['toilet', 3, 3],
      ['lavatory', 1, 1.25],
      ['tub', 2, 1.5],
      ['shower_prefab', 2, 1.5],
      ['sink', 2, 1.5],
      ['dishwasher', 2, 1.5],
      ['disposal', null, null],
      ['washer', 2, 2],
      ['water_heater', null, null],
      ['tile_shower', 2, 1.5],
    ]);
    // 3 + 1 + 2 + 2 + 2 + 2 + 2 + 2 = 16 (disposal and water heater have no P-126 value).
    expect(d.newDfu).toBe(16);
  });

  it('AC-1 R-012 section 5 A.2: primary bath of 2 lavatories, shower, tub and water closet is 1+1+2+2+3 = 9', () => {
    const d = plumbingDiagram([
      fixture(1, 'lavatory'),
      fixture(2, 'lavatory'),
      fixture(3, 'shower_prefab'),
      fixture(4, 'tub'),
      fixture(5, 'toilet'),
    ]);
    expect(d.rows).toHaveLength(5);
    expect(d.newDfu).toBe(9);
    // R-012 A.2: "9 on a 2 in. branch (limit 6): fail ... On a 3 in. branch, 9 <= 20: pass".
    expect(d.branches).toEqual([{ level: F1, dfu: 9, hasNew: true, sizeIn: 3 }]);
  });

  it('AC-1 a tile shower is listed with its floor', () => {
    expect(plumbingDiagram([tileShower(7)]).rows).toEqual([
      { objectId: id(7), kind: 'tile_shower', status: 'new', level: F2, dfu: 2, trapIn: 1.5 },
    ]);
  });

  it('AC-1 cooktop, hood and dryer are appliances and are not listed', () => {
    const d = plumbingDiagram([fixture(1, 'cooktop'), fixture(2, 'hood'), fixture(3, 'dryer')]);
    expect(d).toEqual({ rows: [], newDfu: 0, branches: [], items: [] });
  });

  it('AC-2 a fixture deleted from the plan leaves the diagram and its d.f.u. leave the total', () => {
    const d = plumbingDiagram(plan().filter((o) => o.id !== id(1)));
    expect(d.rows.map((r) => r.objectId)).toEqual([id(2), id(3), id(4)]);
    expect(d.newDfu).toBe(3);
  });

  it('AC-2 a fixture marked Demo leaves the diagram', () => {
    const objects = plan();
    objects[0] = fixture(1, 'toilet', 'demo');
    const d = plumbingDiagram([...objects, tileShower(8, 'demo')]);
    expect(d.rows.map((r) => r.objectId)).toEqual([id(2), id(3), id(4)]);
    expect(d.newDfu).toBe(3);
  });

  describe('riser diagram', () => {
    const drawnIds = (d: ReturnType<typeof plumbingDiagram>) => new Set(d.items.map((i) => i.objectId));
    const texts = (d: ReturnType<typeof plumbingDiagram>) =>
      d.items.flatMap((i) => (i.kind === 'text' ? [i.text] : []));

    it('AC-1 every listed fixture has a drop on its floor branch and a label with its trap size', () => {
      const d = plumbingDiagram(plan());
      const ids = drawnIds(d);
      for (const n of [1, 2, 3, 4]) expect(ids.has(id(n))).toBe(true);
      expect(ids.has(id(5))).toBe(false);
      expect(ids.has(id(6))).toBe(false);
      expect(texts(d)).toEqual(['3" 8 DFU', 'Toilet 3"', 'Lavatory 1-1/4"', 'Tub 1-1/2"', 'Sink 1-1/2"']);
      const toilet = d.items.filter((i) => i.objectId === id(1));
      expect(toilet[0]).toEqual({
        kind: 'line',
        layer: 'new',
        objectId: id(1),
        role: 'cut',
        from: { x: 1.5, y: 0 },
        to: { x: 1.5, y: 0.75 },
      });
      expect(toilet[1]).toMatchObject({ kind: 'text', layer: 'new', rotationDeg: 90, sizePt: 9 });
      const sink = d.items.find((i) => i.objectId === id(4) && i.kind === 'line');
      expect(sink).toMatchObject({ layer: 'existing', from: { x: 6, y: 0 }, to: { x: 6, y: 0.75 } });
    });

    it('AC-1 a floor branch runs from the stack past its last fixture, sized from P-140', () => {
      const d = plumbingDiagram(plan());
      expect(d.branches).toEqual([{ level: F1, dfu: 8, hasNew: true, sizeIn: 3 }]);
      const branch = d.items.find((i) => i.objectId === riserBranchId(F1) && i.kind === 'line');
      expect(branch).toMatchObject({ layer: 'new', from: { x: 0, y: 0 }, to: { x: 6, y: 0 } });
      const stack = d.items.find((i) => i.objectId === RISER_STACK_ID);
      expect(stack).toMatchObject({ kind: 'line', from: { x: 0, y: -1 }, to: { x: 0, y: 1 } });
    });

    it('a branch is never smaller than a trap entering it (washer 2 in.)', () => {
      expect(plumbingDiagram([fixture(1, 'washer')]).branches).toEqual([
        { level: F1, dfu: 2, hasNew: true, sizeIn: 2 },
      ]);
    });

    it('a branch over 160 d.f.u. has no size; a floor of only Existing fixtures is not sized or labelled', () => {
      const many = Array.from({ length: 54 }, (_, i) => fixture(i + 1, 'toilet'));
      expect(plumbingDiagram(many).branches[0]).toEqual({ level: F1, dfu: 162, hasNew: true, sizeIn: null });
      const old = plumbingDiagram([fixture(1, 'lavatory', 'existing')]);
      expect(old.branches).toEqual([{ level: F1, dfu: 1, hasNew: false, sizeIn: null }]);
      expect(texts(old)).toEqual(['Lavatory 1-1/4"']);
    });

    it('floors stack bottom to top in the given floor order', () => {
      const d = plumbingDiagram([tileShower(7), fixture(1, 'toilet')], [F1, F2]);
      expect(d.branches.map((b) => b.level)).toEqual([F1, F2]);
      const branch2 = d.items.find((i) => i.objectId === riserBranchId(F2) && i.kind === 'line');
      expect(branch2).toMatchObject({ from: { x: 0, y: 3 }, to: { x: 1.5, y: 3 } });
      const stack = d.items.find((i) => i.objectId === RISER_STACK_ID);
      expect(stack).toMatchObject({ from: { x: 0, y: -1 }, to: { x: 0, y: 4 } });
      expect(plumbingDiagram([tileShower(7), fixture(1, 'toilet')]).branches.map((b) => b.level)).toEqual([F2, F1]);
    });

    it('AC-2 a deleted fixture leaves the drawing and its branch is resized', () => {
      const d = plumbingDiagram(plan().filter((o) => o.id !== id(1)));
      expect(drawnIds(d).has(id(1))).toBe(false);
      expect(texts(d)).not.toContain('Toilet 3"');
      expect(d.branches).toEqual([{ level: F1, dfu: 5, hasNew: true, sizeIn: 2 }]);
    });

    it('AC-2 a Demo fixture leaves the drawing; a floor left with none has no branch or stack', () => {
      const objects = plan();
      objects[0] = fixture(1, 'toilet', 'demo');
      expect(drawnIds(plumbingDiagram(objects)).has(id(1))).toBe(false);
      expect(plumbingDiagram([tileShower(8, 'demo')]).items).toEqual([]);
    });
  });
});
