// EZD-611a (09c Code check engine; R26 R19, R34): unit tests with test rules (AC-EZD-611a-1..4). The test rules
// borrow catalog ids, sections and limits from vault/spec/code-rules.json: R3-053 "Ceiling height, baths and laundry:
// at least 6 ft 8 in." (80 in.), section R305.1 in both editions; R3-037 is R303.1 in the 8th Edition and R303.1.1 in
// the 9th (09c "only R303.1 splits into R303.1.1 and R303.1.2"); R3-118 "Smoke alarm in each bedroom" is the
// whole-dwelling trigger (09c "except smoke alarms, which a permitted interior alteration triggers for the whole
// dwelling").
import { describe, expect, it } from 'vitest';
import type { ModelDocument, ModelObject, ObjectStatus } from '../schema';
import {
  createRuleRegistry,
  RuleRegistryError,
  runCodeCheck,
  type CodeRule,
  type RuleOutcome,
  type RuleSet,
} from './engine';

const FBC8 = 'fbc8_nec2020';
const FBC9 = 'fbc9_nec2023';
const LEVEL = '00000000-0000-4000-8000-00000000a001';
const BATH = '00000000-0000-4000-8000-00000000b001';
const BATH_2 = '00000000-0000-4000-8000-00000000b002';
const KITCHEN = '00000000-0000-4000-8000-00000000b003';
const DEVICE = '00000000-0000-4000-8000-00000000c001';
const SMOKE = '00000000-0000-4000-8000-00000000c002';
const WALL = '00000000-0000-4000-8000-00000000d001';
const OPENING = '00000000-0000-4000-8000-00000000e001';
const BATH_3 = '00000000-0000-4000-8000-00000000b004';

// 80 in. is 6 ft 8 in. (R3-053 check text).
const BATH_CEILING_MIN_IN = 80;

type Room = Extract<ModelObject, { type: 'room' }>;
type Device = Extract<ModelObject, { type: 'device' }>;

function room(
  id: string,
  opts: {
    status?: ObjectStatus;
    roomType?: Room['data']['attributes']['roomType'];
    ceilingIn?: number | null;
    x0?: number;
  } = {},
): Room {
  const x0 = opts.x0 ?? 0;
  const ceilingIn = opts.ceilingIn === undefined ? 96 : opts.ceilingIn;
  return {
    id,
    type: 'room',
    data: {
      geometry: {
        boundary: [
          { x: x0, y: 0 },
          { x: x0 + 100, y: 0 },
          { x: x0 + 100, y: 100 },
          { x: x0, y: 100 },
        ],
      },
      status: opts.status ?? 'existing',
      level: LEVEL,
      attributes: {
        name: 'Bath 2',
        floorLevel: 0,
        photos: [],
        roomType: opts.roomType === undefined ? 'bath' : opts.roomType,
        floorFinish: '',
        ceilingType: ceilingIn === null ? null : 'flat',
        ceiling:
          ceilingIn === null
            ? null
            : {
                heightsBy: 'wall',
                wallHeights: [{ wall: WALL, height: ceilingIn }],
                pointHeights: [],
                pitch: null,
                ridge: null,
              },
      },
      closureOverride: null,
    },
  };
}

function device(id: string, kind: Device['data']['attributes']['kind'], status: ObjectStatus, x = 50): Device {
  return {
    id,
    type: 'device',
    data: { geometry: { point: { x, y: 50 } }, status, level: LEVEL, attributes: { kind } },
  } as Device;
}

// A 4.5 in. wall along the bath's x = 100 edge (the bath is x 0 to 100): its line is the bath's inside finished face
// and its thickness lies away from the bath, so a room starting at x = 104.5 has its own face on the far side.
const WALL_THICKNESS_IN = 4.5;
function wall(id: string, status: ObjectStatus): Extract<ModelObject, { type: 'wall' }> {
  return {
    id,
    type: 'wall',
    data: {
      geometry: { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      status,
      level: LEVEL,
      attributes: {
        thickness: WALL_THICKNESS_IN,
        thicknessSide: 'right',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        layers: [{ material: 'stud', thickness: WALL_THICKNESS_IN }],
      },
    },
  };
}

// A window on that wall; its center is on the wall, outside every room outline.
function windowOn(id: string, hostWallId: string, status: ObjectStatus): Extract<ModelObject, { type: 'opening' }> {
  return {
    id,
    type: 'opening',
    data: {
      geometry: { center: { x: 102.25, y: 50 }, hostWallId, axis: null },
      status,
      level: LEVEL,
      attributes: {
        kind: 'window',
        width: 36,
        height: 48,
        roughOpening: { width: 36.5, height: 48.5 },
        sillHeight: 36,
        swing: null,
        hand: null,
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
      },
    },
  };
}

const model = (...objects: ModelObject[]): ModelDocument => ({ objects });

// R3-053 as a test rule: a bath's ceiling height, read from its wall heights.
function bathCeilingTest(object: ModelObject): RuleOutcome {
  if (object.type !== 'room') return { status: 'pass' };
  const ceiling = object.data.attributes.ceiling;
  if (ceiling === null || ceiling.wallHeights.length === 0) return { status: 'missing', need: 'ceiling height' };
  const lowest = Math.min(...ceiling.wallHeights.map((w) => w.height));
  return lowest >= BATH_CEILING_MIN_IN ? { status: 'pass' } : { status: 'fail', values: { lowestIn: lowest } };
}

const bathCeiling: CodeRule = {
  id: 'R3-053',
  code: 'FBC-R',
  type: 'automatic',
  trigger: 'new_work',
  sections: { [FBC8]: 'R305.1', [FBC9]: 'R305.1' },
  url: 'https://codes.iccsafe.org/content/FLRC2023P1/chapter-3-building-planning',
  appliesTo: ['room'],
  when: (o) => o.type === 'room' && o.data.attributes.roomType === 'bath',
  test: bathCeilingTest,
};

const smokeAlarm: CodeRule = {
  id: 'R3-118',
  code: 'FBC-R',
  type: 'reminder',
  trigger: 'whole_dwelling',
  sections: { [FBC9]: 'R314.3' },
  url: null,
  appliesTo: ['device'],
  when: (o) => o.type === 'device' && o.data.attributes.kind === 'smoke_detector',
};

const set = (edition: string, ...rules: CodeRule[]): RuleSet => ({ code: 'FBC-R', edition, rules });
const none = new Set<string>();

describe('EZD-611a code check engine', () => {
  describe('AC-EZD-611a-1: a rule runs only on a project of its edition', () => {
    const registry = createRuleRegistry([set(FBC8, bathCeiling)]);
    const low = model(room(BATH, { status: 'new', ceilingIn: 78 }));

    it('runs on a project of its edition', () => {
      const results = runCodeCheck({ model: low, edition: FBC8, registry, verifiedRuleIds: none });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ruleId: 'R3-053', edition: FBC8, status: 'fail', objectId: BATH });
    });

    it('does not run on a project of another edition', () => {
      expect(runCodeCheck({ model: low, edition: FBC9, registry, verifiedRuleIds: none })).toEqual([]);
    });

    it("shows the section of the project's edition", () => {
      const split: CodeRule = { ...bathCeiling, id: 'R3-037', sections: { [FBC8]: 'R303.1', [FBC9]: 'R303.1.1' } };
      const reg = createRuleRegistry([set(FBC8, split), set(FBC9, split)]);
      const at = (edition: string) => runCodeCheck({ model: low, edition, registry: reg, verifiedRuleIds: none });
      expect(at(FBC8).map((r) => r.section)).toEqual(['R303.1']);
      expect(at(FBC9).map((r) => r.section)).toEqual(['R303.1.1']);
    });

    it('links each warning to the section in the publisher viewer', () => {
      const [r] = runCodeCheck({ model: low, edition: FBC8, registry, verifiedRuleIds: none });
      expect(r?.url).toBe('https://codes.iccsafe.org/content/FLRC2023P1/chapter-3-building-planning');
    });

    it('runs only when the model holds what the rule needs', () => {
      const kitchen = model(room(KITCHEN, { status: 'new', roomType: 'kitchen', ceilingIn: 60 }));
      expect(runCodeCheck({ model: kitchen, edition: FBC8, registry, verifiedRuleIds: none })).toEqual([]);
    });

    it('a passing object gives no result', () => {
      const ok = model(room(BATH, { status: 'new', ceilingIn: BATH_CEILING_MIN_IN }));
      expect(runCodeCheck({ model: ok, edition: FBC8, registry, verifiedRuleIds: none })).toEqual([]);
    });
  });

  describe('AC-EZD-611a-2: missing data returns cannot-check instead of passing', () => {
    it('a bath with no ceiling height returns cannot_check naming the value', () => {
      const registry = createRuleRegistry([set(FBC9, bathCeiling)]);
      const results = runCodeCheck({
        model: model(room(BATH_2, { status: 'new', ceilingIn: null })),
        edition: FBC9,
        registry,
        verifiedRuleIds: none,
      });
      expect(results).toEqual([
        expect.objectContaining({ ruleId: 'R3-053', status: 'cannot_check', need: 'ceiling height', objectId: BATH_2 }),
      ]);
    });
  });

  describe('AC-EZD-611a-3: the not-yet-verified tag until the rule is marked verified', () => {
    const registry = createRuleRegistry([set(FBC9, bathCeiling)]);
    const low = model(room(BATH, { status: 'new', ceilingIn: 78 }));

    it('an unverified rule tags its warning', () => {
      const [r] = runCodeCheck({ model: low, edition: FBC9, registry, verifiedRuleIds: none });
      expect(r?.unverified).toBe(true);
    });

    it('a verified rule does not', () => {
      const [r] = runCodeCheck({ model: low, edition: FBC9, registry, verifiedRuleIds: new Set(['R3-053']) });
      expect(r?.unverified).toBe(false);
    });
  });

  describe('AC-EZD-611a-4: an existing, unaltered object produces a note, not a warning', () => {
    const registry = createRuleRegistry([set(FBC9, bathCeiling, smokeAlarm)]);
    const run = (doc: ModelDocument) => runCodeCheck({ model: doc, edition: FBC9, registry, verifiedRuleIds: none });

    it('an existing bath with nothing new or demolished in it gives a note', () => {
      expect(run(model(room(BATH, { ceilingIn: 78 })))).toEqual([
        expect.objectContaining({ ruleId: 'R3-053', status: 'fail', severity: 'note' }),
      ]);
    });

    it('a new bath gives a warning', () => {
      expect(run(model(room(BATH, { status: 'new', ceilingIn: 78 })))[0]?.severity).toBe('warning');
    });

    it('an existing bath that holds a new device gives a warning', () => {
      const doc = model(room(BATH, { ceilingIn: 78 }), device(DEVICE, 'receptacle_duplex', 'new'));
      expect(run(doc)[0]).toMatchObject({ ruleId: 'R3-053', severity: 'warning' });
    });

    it('an existing bath that holds a demolished device gives a warning', () => {
      const doc = model(room(BATH, { ceilingIn: 78 }), device(DEVICE, 'receptacle_duplex', 'demo'));
      expect(run(doc)[0]).toMatchObject({ ruleId: 'R3-053', severity: 'warning' });
    });

    it('an existing bath with a new window on one of its walls gives a warning', () => {
      const doc = model(room(BATH, { ceilingIn: 78 }), wall(WALL, 'existing'), windowOn(OPENING, WALL, 'new'));
      expect(run(doc)[0]).toMatchObject({ ruleId: 'R3-053', severity: 'warning' });
    });

    it('an existing bath with a demolished wall gives a warning', () => {
      const doc = model(room(BATH, { ceilingIn: 78 }), wall(WALL, 'demo'));
      expect(run(doc)[0]).toMatchObject({ ruleId: 'R3-053', severity: 'warning' });
    });

    it('a new wall alters the rooms on both of its sides, and no room it does not border', () => {
      const doc = model(
        room(BATH, { ceilingIn: 78 }),
        room(BATH_2, { ceilingIn: 78, x0: 100 + WALL_THICKNESS_IN }),
        room(BATH_3, { ceilingIn: 78, x0: 300 }),
        wall(WALL, 'new'),
      );
      expect(run(doc).map((r) => [r.objectId, r.severity])).toEqual([
        [BATH, 'warning'],
        [BATH_2, 'warning'],
        [BATH_3, 'note'],
      ]);
    });

    it('an existing wall and window leave an existing bath a note', () => {
      const doc = model(room(BATH, { ceilingIn: 78 }), wall(WALL, 'existing'), windowOn(OPENING, WALL, 'existing'));
      expect(run(doc)[0]).toMatchObject({ ruleId: 'R3-053', severity: 'note' });
    });

    it('new work in another room leaves an unaltered bath a note', () => {
      const doc = model(
        room(BATH, { ceilingIn: 78 }),
        room(KITCHEN, { roomType: 'kitchen', x0: 200 }),
        device(DEVICE, 'receptacle_duplex', 'new', 250),
      );
      expect(run(doc).find((r) => r.ruleId === 'R3-053')?.severity).toBe('note');
    });

    it('a whole-dwelling rule warns on an existing object once anything is altered', () => {
      const unaltered = model(
        room(BATH, { ceilingIn: 96 }),
        room(KITCHEN, { roomType: 'kitchen', x0: 200 }),
        device(SMOKE, 'smoke_detector', 'existing', 50),
      );
      expect(run(unaltered)).toEqual([
        expect.objectContaining({ ruleId: 'R3-118', status: 'reminder', severity: 'note' }),
      ]);
      const altered = model(...unaltered.objects, device(DEVICE, 'receptacle_duplex', 'new', 250));
      expect(run(altered)).toEqual([
        expect.objectContaining({ ruleId: 'R3-118', status: 'reminder', severity: 'warning' }),
      ]);
    });
  });

  describe('Reminders, demolished objects and the model', () => {
    const registry = createRuleRegistry([set(FBC9, bathCeiling, smokeAlarm)]);
    const run = (doc: ModelDocument) => runCodeCheck({ model: doc, edition: FBC9, registry, verifiedRuleIds: none });

    it('a Reminder appears only when its trigger object exists', () => {
      expect(run(model(room(BATH)))).toEqual([]);
      expect(run(model(room(BATH), device(SMOKE, 'smoke_detector', 'new'))).map((r) => r.ruleId)).toEqual([
        'R3-118',
      ]);
    });

    it('a demolished object is not itself checked', () => {
      expect(run(model(room(BATH, { status: 'demo', ceilingIn: 78 })))).toEqual([]);
    });

    it('never changes the model (warnings only, never auto-fix)', () => {
      const doc = model(room(BATH, { ceilingIn: null }), device(SMOKE, 'smoke_detector', 'new'));
      const before = structuredClone(doc);
      run(doc);
      expect(doc).toEqual(before);
    });
  });

  describe('rule registry', () => {
    it('refuses the same rule id twice in one edition', () => {
      const registry = createRuleRegistry([set(FBC9, bathCeiling)]);
      expect(() => registry.register(set(FBC9, bathCeiling))).toThrow(RuleRegistryError);
    });

    it('takes the same rule id in another edition', () => {
      const registry = createRuleRegistry([set(FBC9, bathCeiling)]);
      registry.register(set(FBC8, bathCeiling));
      expect(registry.ruleIds(FBC8)).toEqual(['R3-053']);
      expect(registry.ruleIds(FBC9)).toEqual(['R3-053']);
    });

    it('refuses an Automatic or Needs data rule with no test', () => {
      const noTest: CodeRule = { ...bathCeiling, test: undefined };
      expect(() => createRuleRegistry([set(FBC9, noTest)])).toThrow(RuleRegistryError);
      expect(() => createRuleRegistry([set(FBC9, { ...noTest, type: 'needs_data' })])).toThrow(RuleRegistryError);
    });

    it("refuses a rule of another code than its rule set's", () => {
      expect(() => createRuleRegistry([{ code: 'NEC', edition: FBC9, rules: [bathCeiling] }])).toThrow(
        RuleRegistryError,
      );
    });
  });
});
