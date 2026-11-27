// EZD-614 (S15e "Fallback ratings (volts, amps or VA) per appliance type"; 09s Rules "VA = volts x amps", "Volts are
// 120 or 240"; Q-0770 EZD-665 ids `microwave`, `wall_oven`). Expected values: 09s rows 1 (range 240 V x 48.75 A =
// 11,700 VA), 7 (dishwasher 120 V x 10 A = 1,200 VA), 12 (heat strips 240 V x 41.7 A = 10,008 VA), 13 (A/C 240 V x
// 17.5 A = 4,200 VA).
import { describe, expect, it } from 'vitest';
import { createApplianceDefaults, APPLIANCE_RATINGS_URL } from './defaults-source';
import {
  APPLIANCE_TYPES,
  defaultsVaMap,
  parseAmps,
  parseApplianceRatingsBody,
  ratingVa,
  sortRatings,
} from './ratings';

const DW = { applianceType: 'dishwasher', name: 'Dishwasher', volts: 120, amps: 10 };

describe('EZD-614 appliance ratings', () => {
  it('VA = volts x amps, exact to the hundredth amp (09s)', () => {
    expect(ratingVa({ volts: 240, amps: 48.75 })).toBe(11700);
    expect(ratingVa({ volts: 120, amps: 10 })).toBe(1200);
    expect(ratingVa({ volts: 240, amps: 41.7 })).toBe(10008);
    expect(ratingVa({ volts: 240, amps: 17.5 })).toBe(4200);
  });

  it('the calc defaults are VA by type', () => {
    expect(
      defaultsVaMap([DW, { applianceType: 'range', name: 'Range', volts: 240, amps: 48.75 }]),
    ).toEqual({ dishwasher: 1200, range: 11700 });
  });

  it('the types include the ids the calc looks up: the appliance fixture kinds, microwave, wall oven and the panel A/C', () => {
    for (const t of [
      'range',
      'cooktop',
      'dishwasher',
      'disposal',
      'dryer',
      'water_heater',
      'ac',
      'microwave',
      'wall_oven',
    ])
      expect(APPLIANCE_TYPES).toContain(t);
  });

  it('amps: above 0, at most 1,000, up to two decimals', () => {
    expect(parseAmps('48.75')).toBe(48.75);
    expect(parseAmps(' 12 ')).toBe(12);
    expect(parseAmps('.5')).toBe(0.5);
    for (const bad of ['', '0', '0.00', '-3', '1.234', '1e2', '1001', 'abc'])
      expect(parseAmps(bad), bad).toBeNull();
  });

  it('the save body: every row valid and each type once', () => {
    expect(parseApplianceRatingsBody({ rows: [{ ...DW, name: ' Dishwasher ' }] })).toEqual([DW]);
    expect(parseApplianceRatingsBody({ rows: [] })).toEqual([]);
    for (const bad of [
      null,
      [],
      { rows: {} },
      { rows: [DW], x: 1 },
      { rows: [DW, DW] },
      { rows: [{ ...DW, volts: 208 }] },
      { rows: [{ ...DW, amps: 0 }] },
      { rows: [{ ...DW, amps: 1.005 }] },
      { rows: [{ ...DW, applianceType: 'toaster' }] },
      { rows: [{ ...DW, name: '' }] },
      { rows: [{ ...DW, name: 'x'.repeat(81) }] },
    ])
      expect(parseApplianceRatingsBody(bad), JSON.stringify(bad)).toBeNull();
  });

  it('rows sort in the Add order', () => {
    const r = sortRatings([DW, { applianceType: 'range', name: 'Range', volts: 240, amps: 40 }]);
    expect(r.map((x) => x.applianceType)).toEqual(['range', 'dishwasher']);
  });
});

describe('EZD-614 the browser copy of the defaults', () => {
  it('is empty until read; a read fills it and tells listeners; a failed read keeps the last map', async () => {
    let answer: Response = new Response(JSON.stringify({ rows: [DW] }));
    const calls: string[] = [];
    const source = createApplianceDefaults(async (url) => {
      calls.push(url);
      return answer;
    });
    expect(source.get()).toEqual({});
    let told = 0;
    source.subscribe(() => told++);
    expect(await source.load()).toEqual({ dishwasher: 1200 });
    expect(told).toBe(1);
    expect(calls).toEqual([APPLIANCE_RATINGS_URL]);
    answer = new Response('{}', { status: 500 });
    expect(await source.load()).toEqual({ dishwasher: 1200 });
    source.set([{ ...DW, amps: 12 }]);
    expect(source.get()).toEqual({ dishwasher: 1440 });
    expect(told).toBe(2);
  });

  it('two reads at once make one request', async () => {
    let n = 0;
    const source = createApplianceDefaults(async () => {
      n++;
      return new Response(JSON.stringify({ rows: [] }));
    });
    await Promise.all([source.load(), source.load()]);
    expect(n).toBe(1);
  });
});
