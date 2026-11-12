// EZD-221a U1-U4 (vault/plans/EZD-221a.md section 4; AC-EZD-221-1, -2, -3, -7). Expected values: section 1
// Build step 3 and Decided "Template values (inches)" (Q-0565; board S01bWizard.dc.html:147-150 tile labels),
// "TEMPLATE_SIZE_MAX_IN" (Q-0570; EZD-201 G/length.ts:10), "isTemplateSize" (Q-0570; Q-0207),
// "templateAreaSqFt" (Q-0207; Q-0559; halves up as G/rooms/area.ts:29); Build step 7 (the 4 message keys).
import { MAX_WALL_LENGTH_IN, roomAreaSqFt } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import {
  DEFAULT_CEILING_HEIGHT_IN,
  TEMPLATE_DEFAULTS,
  TEMPLATE_KEYS,
  TEMPLATE_ROOM_NAMES,
  TEMPLATE_SIZE_MAX_IN,
  isTemplateSize,
  templateAreaSqFt,
} from './templates';

describe('EZD-221a templates', () => {
  it('EZD-221a U1 constants: keys in order, inch sizes, ceiling 96, room names', () => {
    expect(TEMPLATE_KEYS).toEqual(['galley_kitchen', 'l_kitchen', 'bath_5x8', 'primary_bath']);
    expect(TEMPLATE_DEFAULTS).toEqual({
      galley_kitchen: { width: 96, length: 168 },
      l_kitchen: { width: 141.5, length: 168 },
      bath_5x8: { width: 60, length: 96 },
      primary_bath: { width: 120, length: 144 },
    });
    expect(DEFAULT_CEILING_HEIGHT_IN).toBe(96);
    expect(TEMPLATE_ROOM_NAMES).toEqual({
      galley_kitchen: 'Galley kitchen',
      l_kitchen: 'L-kitchen',
      bath_5x8: '5x8 bath',
      primary_bath: 'Primary bath',
    });
  });

  it('EZD-221a U2 area: whole square feet, halves up, equal to the editor room area', () => {
    const cases: [number, number, number][] = [
      [96, 168, 112],
      [141.5, 168, 165],
      [60, 96, 40],
      [120, 144, 120],
      [12, 6, 1],
      [12, 5.9375, 0],
      [2400, 2400, 40000],
    ];
    for (const [w, l, sf] of cases) {
      expect(templateAreaSqFt(w, l), `${w}x${l}`).toBe(sf);
      const rect = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: l },
        { x: 0, y: l },
      ];
      expect(templateAreaSqFt(w, l), `${w}x${l} vs roomAreaSqFt`).toBe(roomAreaSqFt(rect));
    }
  });

  it('EZD-221a U3 size check: above 0, at most 2400, in 1/16" steps, numbers only', () => {
    const cases: [unknown, boolean][] = [
      [0, false],
      [-1, false],
      [0.0625, true],
      [0.03125, false],
      [2400, true],
      [2400.0625, false],
      [NaN, false],
      [Infinity, false],
      ['96', false],
      [null, false],
    ];
    for (const [n, ok] of cases) expect(isTemplateSize(n), String(n)).toBe(ok);
  });

  it('EZD-221a U4 no drift: size limit equals the wall limit, tile labels equal room names', () => {
    expect(TEMPLATE_SIZE_MAX_IN).toBe(MAX_WALL_LENGTH_IN);
    const catalog = en as unknown as Record<string, string>;
    for (const key of TEMPLATE_KEYS) {
      expect(catalog['office.new_project.template_' + key], key).toBe(TEMPLATE_ROOM_NAMES[key]);
    }
  });
});
