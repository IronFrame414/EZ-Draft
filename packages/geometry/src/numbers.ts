// EZD-294 Build step 3 (vault/plans/EZD-294.md section 3 N1-N7, Decided "Keys, scope", "numbers.ts bodies";
// Q-0625 (a)): each wall and door/window opening keeps one whole number >= 1 per project and key; a new object gets
// the key's highest number + 1, so none is reused. Pure; never mutates its input.

// EZD-366 Build step 1 (vault/plans/EZD-366.md; D-099): the largest number a wall or opening can hold (the PostgreSQL integer maximum).
export const NUMBER_MAX = 2147483647;

export const NUMBER_KEYS = ['wall', 'door', 'window'] as const;
export type NumberKey = (typeof NUMBER_KEYS)[number];

export type NumberHighs = Readonly<Record<NumberKey, number>>;

export const NO_NUMBERS: NumberHighs = Object.freeze({ wall: 0, door: 0, window: 0 });

export type NumberedLike = { readonly type: string; readonly data: unknown };

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function attributesOf(o: NumberedLike): Rec | null {
  if (!isRecord(o.data)) return null;
  const a = o.data.attributes;
  return isRecord(a) ? a : null;
}

export function numberKeyOf(o: NumberedLike): NumberKey | null {
  const a = attributesOf(o);
  if (a === null) return null;
  if (o.type === 'wall') return 'wall';
  if (o.type === 'opening' && (a.kind === 'door' || a.kind === 'window')) return a.kind;
  return null;
}

export function objectNumber(o: NumberedLike): number | null {
  if (numberKeyOf(o) === null) return null;
  const n = (attributesOf(o) as Rec).number;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function raiseNumberHighs(
  highs: NumberHighs,
  objects: Iterable<NumberedLike>,
): NumberHighs {
  const next = { wall: highs.wall, door: highs.door, window: highs.window };
  for (const o of objects) {
    const key = numberKeyOf(o);
    const n = objectNumber(o);
    if (key !== null && n !== null && n > next[key]) next[key] = n;
  }
  return next;
}

export function withObjectNumber<T extends NumberedLike>(o: T, n: number): T {
  if (numberKeyOf(o) === null) return o;
  const data = o.data as Rec;
  return { ...o, data: { ...data, attributes: { ...(data.attributes as Rec), number: n } } };
}

function withoutObjectNumber<T extends NumberedLike>(o: T): T {
  const data = o.data as Rec;
  const attributes = data.attributes as Rec;
  if (!Object.hasOwn(attributes, 'number')) return o;
  const rest: Rec = { ...attributes };
  delete rest.number;
  return { ...o, data: { ...data, attributes: rest } };
}

export function numberNewObjects<T extends NumberedLike>(
  objects: readonly T[],
  highs: NumberHighs,
): { objects: T[]; highs: NumberHighs } {
  const next = { wall: highs.wall, door: highs.door, window: highs.window };
  const out = objects.map((o) => {
    const key = numberKeyOf(o);
    if (key === null) return o;
    if (next[key] >= NUMBER_MAX) return withoutObjectNumber(o);
    next[key] += 1;
    return withObjectNumber(o, next[key]);
  });
  return { objects: out, highs: next };
}
