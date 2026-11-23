// EZD-706 AC-EZD-706-1 "Deleting the last outlet removes its symbol from the key"; S13 Validation "Key: only symbols
// and abbreviations actually used; updates when objects are added or removed"; S15h Symbols "Read-only system set".
import { describe, expect, it } from 'vitest';
import { DEVICE_KINDS, type ModelObject } from '../schema';
import { SYSTEM_ABBREVIATIONS, SYSTEM_SYMBOLS, symbolIdOf, usedSymbols } from './symbol-key';

const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';

const device = (id: string, kind: (typeof DEVICE_KINDS)[number], level = L1): ModelObject => ({
  id,
  type: 'device',
  data: { geometry: { point: { x: 0, y: 0 } }, status: 'new', level, attributes: { kind } },
});

const ids = (objects: ModelObject[], level?: string) => usedSymbols(objects, level).map((s) => s.id);

describe('EZD-706 symbol key', () => {
  it('AC-EZD-706-1 deleting the last outlet removes its symbol from the key', () => {
    const o1 = device('o1', 'receptacle_duplex');
    const o2 = device('o2', 'receptacle_duplex');
    const sw = device('s1', 'switch_single');
    // Two outlets give one row.
    expect(ids([o1, o2, sw], L1)).toEqual(['device.receptacle_duplex', 'device.switch_single']);
    // Deleting one outlet keeps the row.
    expect(ids([o2, sw], L1)).toEqual(['device.receptacle_duplex', 'device.switch_single']);
    // Deleting the last outlet removes it; the switch stays.
    expect(ids([sw], L1)).toEqual(['device.switch_single']);
    expect(ids([], L1)).toEqual([]);
  });

  it('lists only what the floor uses, once each, in library order', () => {
    const objects = [device('s1', 'switch_single'), device('o1', 'receptacle_duplex', L2), device('t1', 'tv')];
    expect(ids(objects, L1)).toEqual(['device.switch_single', 'device.tv']);
    expect(ids(objects, L2)).toEqual(['device.receptacle_duplex']);
    // With no floor, the whole model (the set-wide key on the cover).
    expect(ids(objects)).toEqual(['device.receptacle_duplex', 'device.switch_single', 'device.tv']);
  });

  it('a duplex and a 240V receptacle are two symbols', () => {
    expect(ids([device('a', 'receptacle_240v'), device('b', 'receptacle_duplex')], L1)).toEqual([
      'device.receptacle_duplex',
      'device.receptacle_240v',
    ]);
  });

  it('the system set holds a symbol for every device kind and ids are unique', () => {
    const all = SYSTEM_SYMBOLS.map((s) => s.id);
    expect(new Set(all).size).toBe(all.length);
    for (const k of DEVICE_KINDS) expect(all).toContain(`device.${k}`);
    for (const s of ['wall.existing', 'wall.demo', 'wall.new', 'opening.door', 'opening.window', 'keynote', 'revision'])
      expect(all).toContain(s);
    expect(symbolIdOf(device('x', 'receptacle_duplex'))).toBe('device.receptacle_duplex');
  });

  it('the system abbreviations are the ones the sheets print (assumptions EZD-706)', () => {
    expect(SYSTEM_ABBREVIATIONS.map((a) => a.name)).toEqual(['AFF', 'CLR', 'EQ', 'EXIST', 'NEW', 'NTS', 'TYP', 'UNO']);
  });
});
