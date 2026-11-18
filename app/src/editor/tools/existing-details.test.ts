// EZD-229 (AC-EZD-229-2; Q-0704 03-data-model row 2 "Existing details ... use the names later phases extend": hvac
// kind supply or return, the electrical device type for smoke, CO and combination detectors, access kind
// attic_hatch, soffit and chase polygons; phase-02.md EZD-229 "as existing-status objects"). Each detail places at the
// click, Existing even in the Proposed view (status new), and its saved value parses and survives a store reload.
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import { EXISTING_DETAILS, existingDetailChoice, placeFixture } from './fixture-tool';
import { baseObjects, F1, idSeq } from './test-utils/fixtures';

const at: Point = { x: 60, y: 40 };
const EXPECTED: Record<(typeof EXISTING_DETAILS)[number], { type: string; kind: string | null }> = {
  supply: { type: 'hvac', kind: 'supply' },
  return: { type: 'hvac', kind: 'return' },
  smoke_detector: { type: 'device', kind: 'smoke_detector' },
  co_detector: { type: 'device', kind: 'co_detector' },
  smoke_co_detector: { type: 'device', kind: 'smoke_co_detector' },
  attic_hatch: { type: 'access', kind: 'attic_hatch' },
  soffit: { type: 'soffit', kind: null },
  chase: { type: 'chase', kind: null },
};

describe('EZD-229 existing details place and persist', () => {
  for (const detail of EXISTING_DETAILS) {
    it(`AC-2 ${detail} places as ${EXPECTED[detail].type}, status Existing, and persists`, () => {
      const change = placeFixture(existingDetailChoice(detail), at, {
        level: F1,
        objects: [],
        newId: idSeq(500),
        status: 'new',
      });
      expect(change).not.toBeNull();
      const v = change!.value!;
      expect(v.type).toBe(EXPECTED[detail].type);
      expect(v.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      const data = v.data as {
        status: string;
        level: string;
        attributes: { kind?: string };
        geometry: Record<string, unknown>;
      };
      expect(data.status).toBe('existing');
      expect(data.level).toBe(F1);
      expect(data.attributes.kind ?? null).toBe(EXPECTED[detail].kind);

      // Persist: the stored value reopens in a new store and parses as its type.
      const store = createModelStore({ objects: baseObjects() });
      store.applyEdit([change!]);
      const saved = structuredClone(store.getState().objects.get(change!.id)!);
      const reopened = createModelStore({ objects: new Map([[change!.id, saved]]) });
      const back = reopened.getState().objects.get(change!.id)!;
      const parsed = parseStoredObject({
        id: change!.id,
        type: back.type,
        schema_version: back.schemaVersion,
        data: back.data,
      });
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && parsed.object.type).toBe(EXPECTED[detail].type);
      expect(parsed.ok && (parsed.object.data as { status?: string }).status).toBe('existing');
    });
  }

  it('AC-2 a register and an attic hatch are centred on the click; a soffit is a polygon around it', () => {
    const ctx = { level: F1, objects: [], newId: idSeq(600) };
    const supply = placeFixture(existingDetailChoice('supply'), at, ctx)!.value!.data as {
      geometry: { center: Point };
    };
    expect(supply.geometry.center).toEqual(at);
    const hatch = placeFixture(existingDetailChoice('attic_hatch'), at, ctx)!.value!.data as {
      geometry: { center: Point };
    };
    expect(hatch.geometry.center).toEqual(at);
    const soffit = placeFixture(existingDetailChoice('soffit'), at, ctx)!.value!.data as {
      geometry: { boundary: Point[] };
      attributes: { dropHeight: number };
    };
    expect(soffit.geometry.boundary.length).toBeGreaterThanOrEqual(3);
    const xs = soffit.geometry.boundary.map((p) => p.x);
    const ys = soffit.geometry.boundary.map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(at.x);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBe(at.y);
    expect(soffit.attributes.dropHeight).toBeGreaterThan(0);
  });
});
