// EZD-604 AC-EZD-604-1 "Assigned devices show the tag and a home run." Expected values from the board and the recorded
// decisions, never the code: board S06Electrical (a "14" tag beside each device of circuit 14, the circuit line
// through them, and the home-run arrow tagged "A-14"); S06 Controls "Circuit row | Click selects the circuit:
// highlights its devices and home run on canvas", "Show chips: ... Home runs"; vault/build/assumptions.md EZD-604
// ("Where the home run is drawn ... An arrow from the circuit's first device, with the circuit tag (board "A-14")",
// home runs with the chip on or for the chosen circuit).
import { parseStoredObject, type DrawingItem, type ModelObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Objects } from '../model/patches';
import { uid } from '../tools/test-utils/fixtures';
import { ARROW_HEAD_IN, circuitItems, HOME_RUN_IN, homeRunDirection } from './circuit-drawing';
import { assignChanges } from './circuits';
import { deviceValue, electricalObjects } from './test-fixture';

const C14 = uid(202);
const C24 = uid(212);
const R1 = uid(401);
const R2 = uid(402);
const R3 = uid(403);
const LOOSE = uid(404);
const RADIUS = 4;

function model(): Objects {
  let o: Objects = new Map(electricalObjects());
  const m = o as Map<string, ObjectValue>;
  // Three receptacles along a wall at y = 100, clicked onto circuit 14 left to right, and one on no circuit.
  m.set(R1, deviceValue({ x: 20, y: 100 }, 'receptacle_duplex'));
  m.set(R2, deviceValue({ x: 80, y: 100 }, 'receptacle_duplex'));
  m.set(R3, deviceValue({ x: 140, y: 100 }, 'receptacle_duplex'));
  m.set(LOOSE, deviceValue({ x: 200, y: 100 }, 'receptacle_duplex'));
  // The fixture's smoke detector on 14 is taken off it, so circuit 14 is the three receptacles alone.
  o = applyEditTo(o, makeEdit(o, assignChanges(o, [uid(302)], null)!), 'forward');
  for (const d of [R1, R2, R3]) o = applyEditTo(o, makeEdit(o, assignChanges(o, [d], C14)!), 'forward');
  return o;
}

function onFloor(o: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of o) {
    if (v.type !== 'device') continue;
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (r.ok) out.push(r.object);
  }
  return out;
}

const draw = (o: Objects, circuit: string | null, homeRuns: boolean) =>
  circuitItems(onFloor(o), 8, { all: o, circuit, homeRuns, radiusOf: () => RADIUS });
const texts = (items: DrawingItem[], objectId?: string) =>
  items
    .filter((i) => i.kind === 'text' && (objectId === undefined || i.objectId === objectId))
    .map((i) => (i.kind === 'text' ? i.text : ''));
const lines = (items: DrawingItem[]) =>
  items.filter((i): i is Extract<DrawingItem, { kind: 'line' }> => i.kind === 'line');

describe('EZD-604 AC-1 assigned devices show the tag and a home run', () => {
  it('each device on a circuit is tagged with its number; a device on no circuit is not', () => {
    const items = draw(model(), null, false);
    for (const d of [R1, R2, R3]) expect(texts(items, d)).toContain('14');
    expect(texts(items, LOOSE)).toEqual([]);
    // The fixture's detector on 24 is tagged with its own circuit; the one taken off 14 is not tagged.
    expect(texts(items, uid(301))).toEqual(['24']);
    expect(texts(items, uid(302))).toEqual([]);
  });

  it('the tag sits left of the symbol, on the device row', () => {
    const tag = draw(model(), null, false).find(
      (i) => i.kind === 'text' && i.objectId === R2 && i.text === '14',
    )!;
    expect(tag.kind === 'text' && tag.at.y).toBe(100);
    expect(tag.kind === 'text' && tag.at.x).toBeLessThan(80 - RADIUS);
  });

  it('the circuit line joins the devices in click order, edge to edge of their symbols', () => {
    const l = lines(draw(model(), null, false));
    const r1r2 = l.find((i) => i.objectId === R1)!;
    expect(r1r2.from).toEqual({ x: 20 + RADIUS, y: 100 });
    expect(r1r2.to).toEqual({ x: 80 - RADIUS, y: 100 });
    const r2r3 = l.find((i) => i.objectId === R2)!;
    expect(r2r3.from).toEqual({ x: 80 + RADIUS, y: 100 });
    expect(r2r3.to).toEqual({ x: 140 - RADIUS, y: 100 });
  });

  it('the chosen circuit gets its home run: an arrow from its first device tagged "A-14"', () => {
    const items = draw(model(), C14, false);
    expect(texts(items, R1)).toEqual(['14', 'A-14']);
    // Away from the other devices (to its right), so the arrow runs left from R1's symbol.
    const run = lines(items).filter((i) => i.objectId === R1 && i.from.x === 20 - RADIUS);
    expect(run).toHaveLength(1);
    expect(run[0]!.to).toEqual({ x: 20 - RADIUS - HOME_RUN_IN, y: 100 });
    // Two arrow-head sides from the tip.
    const tip = run[0]!.to;
    const head = lines(items).filter((i) => i.from.x === tip.x && i.from.y === tip.y);
    expect(head).toHaveLength(2);
    for (const h of head)
      expect(Math.hypot(h.to.x - tip.x, h.to.y - tip.y)).toBeCloseTo(ARROW_HEAD_IN, 9);
  });

  it('no home run for a circuit not chosen while Home runs is off; every home run with it on', () => {
    expect(texts(draw(model(), null, false))).not.toContain('A-14');
    expect(texts(draw(model(), C24, false))).toContain('A-24');
    expect(texts(draw(model(), C24, false))).not.toContain('A-14');
    const all = texts(draw(model(), null, true));
    expect(all).toContain('A-14');
    expect(all).toContain('A-24');
  });

  it('a lone device runs home straight down the plan', () => {
    expect(homeRunDirection({ x: 0, y: 0 }, [])).toEqual({ x: 0, y: -1 });
    expect(homeRunDirection({ x: 0, y: 0 }, [{ x: 0, y: 10 }])).toEqual({ x: 0, y: -1 });
  });
});
