// EZD-607 AC-EZD-607-1: the 09a worked example (the mockup 06 house) reproduced line by line, 35,868 VA and 149.5 A.
// Every expected number is from the 09a table or the 09a text under it, never from running the code.
import { describe, expect, it } from 'vitest';
import {
  ampsTenthsAt240,
  lightingDemandVa,
  standardLoadCalc,
  type LoadCalcInput,
  type LoadCalcLoad,
} from './load-calc';

// 09a: dishwasher 1,200, disposal 960, microwave 1,500, water heater 4,500; dryer (5,000 minimum); range 12 kW;
// heat strips 9,600; cooling 4,200 (the motor). The refrigerator and washer are not loads of the standard method
// (09a; assumptions EZD-607), so the adapter never passes them; the dryer here has no rating of its own under 5,000.
const loads: LoadCalcLoad[] = [
  { id: 'dw', name: 'Dishwasher', kind: 'fixed_appliance', va: 1200 },
  { id: 'disp', name: 'Disposal', kind: 'fixed_appliance', va: 960, motor: true },
  { id: 'mw', name: 'Microwave', kind: 'fixed_appliance', va: 1500 },
  { id: 'wh', name: 'Water heater', kind: 'fixed_appliance', va: 4500 },
  { id: 'dry', name: 'Dryer', kind: 'dryer', va: 4000 },
  { id: 'rng', name: 'Range', kind: 'range', va: 12000 },
  { id: 'heat', name: 'Heat strips', kind: 'heating', va: 9600 },
  { id: 'ac', name: 'A/C', kind: 'cooling', va: 4200, motor: true },
];

const house: LoadCalcInput = {
  floorAreaSqFt: 2450,
  smallApplianceCircuits: 2,
  laundryCircuits: 1,
  loads,
  serviceAmps: 200,
};

const ok = (input: LoadCalcInput) => {
  const r = standardLoadCalc(input);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};
const line = (input: LoadCalcInput, key: string) => ok(input).lines.find((l) => l.key === key);

describe('EZD-607 standard method, the 09a worked example', () => {
  it('reproduces every line of the 09a table in order', () => {
    const r = ok(house);
    expect(r.lines.map((l) => [l.key, l.ref, l.va])).toEqual([
      ['general_lighting', '220.41', 7350],
      ['small_appliance', '220.52(A)', 3000],
      ['laundry', '220.52(B)', 1500],
      ['subtotal', '', 11850],
      ['demand', 'Table 220.45', 6098],
      ['fixed_appliances', '220.53', 6120],
      ['dryer', '220.54', 5000],
      ['range', 'Table 220.55', 8000],
      ['heating_cooling', '220.60', 9600],
      ['largest_motor', '220.50', 1050],
      ['total', '', 35868],
    ]);
  });

  it('carries the inputs of each line as 09a prints them', () => {
    expect(line(house, 'general_lighting')?.detail).toEqual({ sqft: 2450, vaPerSqft: 3 });
    expect(line(house, 'small_appliance')?.detail).toEqual({ circuits: 2, vaEach: 1500 });
    expect(line(house, 'laundry')?.detail).toEqual({ circuits: 1, vaEach: 1500 });
    expect(line(house, 'demand')?.detail).toMatchObject({
      first: 3000,
      firstPercent: 100,
      next: 8850,
      nextPercent: 35,
    });
    expect(line(house, 'fixed_appliances')?.detail).toEqual({ sum: 8160, count: 4, percent: 75 });
    expect(line(house, 'dryer')?.detail).toMatchObject({ minimum: 5000 });
    expect(line(house, 'range')?.detail).toMatchObject({ nameplate: 12000, column: 'C' });
    expect(line(house, 'heating_cooling')?.detail).toEqual({
      heating: 9600,
      cooling: 4200,
      used: 'heating',
    });
    // The omitted cooling compressor still drives the 25% line (09a).
    expect(line(house, 'largest_motor')?.detail).toEqual({
      motorVa: 4200,
      percent: 25,
      loadId: 'ac',
    });
  });

  it('gives 149.5 A at 240 V, 75% of the 200 A service, 50.5 A spare, OK', () => {
    const r = ok(house);
    expect(r.totalVa).toBe(35868);
    expect(r.ampsTenths).toBe(1495);
    expect(r.amps).toBe(149.5);
    expect(r.service).toEqual({
      amps: 200,
      percent: 75,
      spareTenths: 505,
      spareAmps: 50.5,
      pass: true,
    });
  });
});

describe('EZD-607 standard method rules', () => {
  it('Table 220.45: first 3,000 at 100%, the next 117,000 at 35%, the rest at 25%', () => {
    expect(lightingDemandVa(2000)).toBe(2000);
    expect(lightingDemandVa(11850)).toBe(6098); // 3,000 + 3,097.5, half up (09a)
    // 3,000 + 117,000 x 35% = 43,950; + 10,000 x 25% = 2,500
    expect(lightingDemandVa(130000)).toBe(46450);
  });

  it('amps are VA x 10 / 240 half up to 0.1 A, exact on whole VA', () => {
    expect(ampsTenthsAt240(35868)).toBe(1495); // 1,494.5 rounds up
    expect(ampsTenthsAt240(24000)).toBe(1000);
  });

  it('fixed appliances take 100% with fewer than four, or when one is under 500 VA', () => {
    const three = { ...house, loads: loads.filter((l) => l.id !== 'mw') };
    expect(line(three, 'fixed_appliances')).toMatchObject({ va: 6660, detail: { percent: 100 } });
    const small = {
      ...house,
      loads: [...loads.filter((l) => l.id !== 'disp'), { ...loads[1]!, va: 400 }],
    };
    expect(line(small, 'fixed_appliances')).toMatchObject({ va: 7600, detail: { percent: 100 } });
  });

  it('a dryer over 5,000 VA counts at its nameplate', () => {
    const big = { ...house, loads: loads.map((l) => (l.id === 'dry' ? { ...l, va: 5600 } : l)) };
    expect(line(big, 'dryer')?.va).toBe(5600);
  });

  it('the larger of heating or cooling: cooling when it is larger', () => {
    const cool = { ...house, loads: loads.map((l) => (l.id === 'heat' ? { ...l, va: 3000 } : l)) };
    expect(line(cool, 'heating_cooling')).toMatchObject({ va: 4200, detail: { used: 'cooling' } });
  });

  it('the largest-motor line is editable: a chosen motor replaces the largest; null leaves it out', () => {
    expect(line({ ...house, largestMotorId: 'disp' }, 'largest_motor')?.va).toBe(240); // 960 x 25%
    expect(line({ ...house, largestMotorId: null }, 'largest_motor')).toBeUndefined();
    expect(ok({ ...house, largestMotorId: null }).totalVa).toBe(35868 - 1050);
  });

  it('a rating comes from the override, then the item, then the default; none is the calc error naming it', () => {
    const noRating = {
      ...house,
      loads: loads.map((l) =>
        l.id === 'dw' ? { ...l, va: null, applianceType: 'dishwasher' } : l,
      ),
    };
    expect(standardLoadCalc(noRating)).toEqual({
      ok: false,
      errors: [{ code: 'missing_rating', loadId: 'dw', name: 'Dishwasher' }],
    });
    expect(line({ ...noRating, defaults: { dishwasher: 1200 } }, 'fixed_appliances')?.va).toBe(
      6120,
    );
    expect(line({ ...house, overrides: { dw: 2000 } }, 'fixed_appliances')?.va).toBe(6720); // 8,960 x 75%
  });

  it('no floor area is the calc error', () => {
    expect(standardLoadCalc({ ...house, floorAreaSqFt: null })).toEqual({
      ok: false,
      errors: [{ code: 'missing_floor_area' }],
    });
  });

  it('a service the load passes is OK; one it exceeds is not', () => {
    expect(ok({ ...house, serviceAmps: 150 }).service).toMatchObject({
      pass: true,
      spareTenths: 5,
    });
    expect(ok({ ...house, serviceAmps: 125 }).service).toMatchObject({
      pass: false,
      spareTenths: -245,
    });
    expect(ok({ ...house, serviceAmps: null }).service).toBeNull();
  });
});
