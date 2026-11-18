// EZD-229 (AC-EZD-229-1, -2, -4; 09q Transitions row 1; Q-0704; vault/build/assumptions.md EZD-229): the plan marks
// of the existing details and the floor transitions, through buildDrawingList's `extraItems` as the plan passes them.
import {
  buildDrawingList,
  type DrawingList,
  type DrawingView,
  type ModelDocument,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { roomObj, uid } from '../../../../packages/geometry/src/rooms/test-utils/fixtures';
import { planDetailItems } from './details-drawing';

const F1 = '11111111-1111-4111-8111-111111111111';
const P = (x: number, y: number): Point => ({ x, y });

describe('EZD-229 plan details (existing details and transitions)', () => {
  const V = { level: F1, dimensionTextPt: 8, roomHatch: null, roomLabelPt: 10 } as DrawingView;
  const RA = uid(70);
  const RB = uid(71);
  const room = (id: string, boundary: Point[], floorLevel: number): ModelObject => {
    const r = roomObj(id, boundary, id === RA ? 'Kitchen' : 'Family', F1) as ModelObject & {
      type: 'room';
    };
    r.data.attributes.floorLevel = floorLevel;
    return r;
  };
  const detail = (id: string, type: string, data: unknown) => ({ id, type, data }) as ModelObject;
  const mine = (list: DrawingList, id: string) => list.items.filter((i) => i.objectId === id);

  it('T-229-1 a 3/4" floor-level step draws a transition line labelled 3/4" on the rooms layer', () => {
    const doc: ModelDocument = {
      objects: [
        room(RA, [P(0, 0), P(120, 0), P(120, 120), P(0, 120)], 0),
        room(RB, [P(120, 0), P(240, 0), P(240, 120), P(120, 120)], 0.75),
      ],
    };
    const items = mine(buildDrawingList(doc, V, [], { extraItems: planDetailItems }), RA).filter(
      (i) => i.layer === 'rooms',
    );
    const text = items.filter((i) => i.kind === 'text' && i.text === '3/4"');
    expect(text).toHaveLength(1);
    const lines = items.filter((i) => i.kind === 'line');
    expect(lines).toHaveLength(1);
    // Equal levels draw no transition.
    const flat: ModelDocument = {
      objects: [
        room(RA, [P(0, 0), P(120, 0), P(120, 120), P(0, 120)], 0),
        room(RB, [P(120, 0), P(240, 0), P(240, 120), P(120, 120)], 0),
      ],
    };
    expect(
      mine(buildDrawingList(flat, V, [], { extraItems: planDetailItems }), RA).filter(
        (i) => i.kind === 'line',
      ),
    ).toHaveLength(0);
    // Without the extra items, no transition is drawn.
    expect(mine(buildDrawingList(doc, V), RA).filter((i) => i.kind === 'line')).toHaveLength(0);
  });

  it('T-229-2 existing details draw in their status layer', () => {
    const rect = { center: P(50, 50), axis: P(1, 0) };
    const base = { status: 'existing', level: F1 };
    const doc: ModelDocument = {
      objects: [
        detail(uid(80), 'hvac', {
          ...base,
          geometry: rect,
          attributes: { kind: 'supply', width: 10, depth: 4 },
        }),
        detail(uid(81), 'hvac', {
          ...base,
          geometry: rect,
          attributes: { kind: 'return', width: 10, depth: 4 },
        }),
        detail(uid(82), 'access', {
          ...base,
          geometry: rect,
          attributes: { kind: 'attic_hatch', width: 22, depth: 30 },
        }),
        detail(uid(83), 'device', {
          ...base,
          geometry: { point: P(10, 10) },
          attributes: { kind: 'smoke_co_detector' },
        }),
        detail(uid(84), 'soffit', {
          ...base,
          geometry: { boundary: [P(0, 0), P(24, 0), P(24, 24), P(0, 24)] },
          attributes: { dropHeight: 12 },
        }),
        detail(uid(85), 'chase', {
          ...base,
          geometry: { boundary: [P(0, 0), P(16, 0), P(16, 16)] },
          attributes: {},
        }),
      ],
    };
    const list = buildDrawingList(doc, V, [], { extraItems: planDetailItems });
    const lines = (id: string, role: string) =>
      mine(list, id).filter((i) => i.kind === 'line' && i.role === role && i.layer === 'existing');
    expect(lines(uid(80), 'beyond')).toHaveLength(6);
    expect(lines(uid(81), 'beyond')).toHaveLength(5);
    expect(lines(uid(82), 'hidden')).toHaveLength(6);
    const det = mine(list, uid(83));
    expect(det.some((i) => i.kind === 'arc' && i.layer === 'existing')).toBe(true);
    expect(det.some((i) => i.kind === 'text' && i.text === 'S/CO')).toBe(true);
    expect(lines(uid(84), 'hidden')).toHaveLength(4);
    expect(lines(uid(85), 'beyond')).toHaveLength(3);
  });
});
