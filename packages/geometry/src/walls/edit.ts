// EZD-213a Build step 1 (vault/plans/EZD-213a.md section 1, Decided "Purity", "Above 0 inches", "setWallThickness",
// "setWallLayer", "setWallHeight, setWallBearing"; Q-0630 rows 13, 14; Q-0635; Q-0640 row 5-4; Q-0658 (a); 09k
// Thickness): the inspector's wall field edits. Pure: inputs are never mutated; each ok result is a new wall.
import type { WallLayer } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallThickness, type WallObject } from './wall';

export type WallEditReason =
  'invalid_input' | 'not_positive' | 'no_stud' | 'stud_not_positive' | 'only_stud';

export type WallEditResult = { ok: true; wall: WallObject } | { ok: false; reason: WallEditReason };

const refuse = (reason: WallEditReason): WallEditResult => ({ ok: false, reason });

// Non-finite first, then a value at or under 1/64" (Decided "Above 0 inches").
function sizeProblem(value: number): 'invalid_input' | 'not_positive' | null {
  if (!Number.isFinite(value)) return 'invalid_input';
  if (value <= COMPARISON_TOLERANCE_IN) return 'not_positive';
  return null;
}

function withAttributes(
  wall: WallObject,
  attributes: Partial<WallObject['data']['attributes']>,
): WallObject {
  return {
    ...wall,
    data: { ...wall.data, attributes: { ...wall.data.attributes, ...attributes } },
  };
}

function withLayers(wall: WallObject, layers: WallLayer[]): WallObject {
  return withAttributes(wall, { layers, thickness: wallThickness(layers) });
}

export function setWallThickness(wall: WallObject, thickness: number): WallEditResult {
  const problem = sizeProblem(thickness);
  if (problem !== null) return refuse(problem);
  const layers = wall.data.attributes.layers;
  const studIndex = layers.findIndex((layer) => layer.material === 'stud');
  if (studIndex < 0) return refuse('no_stud');
  const others = layers.reduce(
    (sum, layer, i) => (i === studIndex ? sum : sum + layer.thickness),
    0,
  );
  const stud = thickness - others;
  if (stud <= COMPARISON_TOLERANCE_IN) return refuse('stud_not_positive');
  const next = layers.map((layer, i) =>
    i === studIndex ? { ...layer, thickness: stud } : { ...layer },
  );
  return { ok: true, wall: withLayers(wall, next) };
}

export function setWallLayer(wall: WallObject, index: number, layer: WallLayer): WallEditResult {
  const layers = wall.data.attributes.layers;
  if (!Number.isInteger(index) || index < 0 || index > layers.length - 1)
    return refuse('invalid_input');
  const problem = sizeProblem(layer.thickness);
  if (problem !== null) return refuse(problem);
  const studs = layers.filter((l) => l.material === 'stud').length;
  if (layers[index]!.material === 'stud' && studs === 1 && layer.material !== 'stud')
    return refuse('only_stud');
  const next = layers.map((l, i) =>
    i === index ? { material: layer.material, thickness: layer.thickness } : { ...l },
  );
  return { ok: true, wall: withLayers(wall, next) };
}

export function setWallHeight(wall: WallObject, height: number): WallEditResult {
  const problem = sizeProblem(height);
  if (problem !== null) return refuse(problem);
  return { ok: true, wall: withAttributes(wall, { height }) };
}

export function setWallBearing(wall: WallObject, bearing: boolean): WallEditResult {
  return { ok: true, wall: withAttributes(wall, { bearing }) };
}
