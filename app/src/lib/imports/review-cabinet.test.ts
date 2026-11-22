// EZD-915 (S02 States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation cross-check
// results shown per cabinet"; S02 Controls "Accepted summary ... fixtures + cabinets"; S12 Data shown "W x D x H"):
// how Import review shows a supplier cabinet. Items are the fixture's two boxes (fixtures/synthetic/
// supplier-kitchen.pdf.expected.json): B24 24 x 24 x 34 1/2 agreeing in both views (95) and W3030 30 x 12 x 30 with
// no elevation (70, below the default cutoff 80).
import { describe, expect, it } from 'vitest';
import {
  acceptHighConfidence,
  cabinetCheckLines,
  cabinetSizeText,
  itemExtents,
  itemLabel,
  itemTypeWord,
  reviewSummary,
  roomGroups,
  scanReads,
  sourceLine,
  toCheckItems,
  type ReviewCabinet,
  type ReviewItem,
} from './review';

const B24: ReviewCabinet = {
  id: 'cabinet-1',
  type: 'cabinet',
  number: 1,
  confidence: 95,
  code: 'B24',
  boxType: 'base',
  width: 24,
  depth: 24,
  height: 34.5,
  center: { x: 212, y: 288 },
  outline: { min: { x: 200, y: 276 }, max: { x: 224, y: 300 } },
  run: 1,
  check: {
    plan: 'agrees',
    elevation: 'agrees',
    planSize: { long: 24, short: 24 },
    elevationSize: { width: 24, height: 34.5 },
  },
};
const W3030: ReviewCabinet = {
  ...B24,
  id: 'cabinet-2',
  number: 2,
  confidence: 70,
  code: 'W3030',
  boxType: 'wall',
  width: 30,
  depth: 12,
  height: 30,
  center: { x: 239, y: 294 },
  outline: { min: { x: 224, y: 288 }, max: { x: 254, y: 300 } },
  check: { plan: 'agrees', elevation: 'missing', planSize: { long: 30, short: 12 }, elevationSize: null },
};
const ITEMS: ReviewItem[] = [B24, W3030];

describe('EZD-915 supplier cabinets in Import review', () => {
  it('a cabinet is named by its label and shows its size from the label', () => {
    expect(itemLabel(B24, ITEMS)).toBe('Cabinet B24');
    expect(itemTypeWord(W3030)).toBe('Cabinet');
    expect(cabinetSizeText(B24)).toBe('24 × 24 × 34 1/2');
    expect(scanReads(W3030)).toBe('30 × 12 × 30');
  });

  it('the cross-check shows one line per view', () => {
    expect(cabinetCheckLines(B24)).toEqual([
      { view: 'plan', state: 'agrees', size: '24 × 24' },
      { view: 'elevation', state: 'agrees', size: '24 × 34 1/2' },
    ]);
    expect(cabinetCheckLines(W3030)).toEqual([
      { view: 'plan', state: 'agrees', size: '30 × 12' },
      { view: 'elevation', state: 'missing', size: null },
    ]);
    const differs: ReviewCabinet = {
      ...B24,
      check: { ...B24.check, elevation: 'differs', elevationSize: { width: 27, height: 34.5 } },
    };
    expect(cabinetCheckLines(differs)[1]).toEqual({ view: 'elevation', state: 'differs', size: '27 × 34 1/2' });
  });

  it('confidence colors: the agreeing box is high confidence, the other is to check', () => {
    expect(reviewSummary(ITEMS, 80)).toMatchObject({ found: 2, highConfidence: 1, toCheck: 1 });
    expect(toCheckItems(ITEMS, 80).map((i) => i.id)).toEqual(['cabinet-2']);
  });

  it('accepted cabinets count with fixtures + cabinets', () => {
    const decisions = acceptHighConfidence(ITEMS, 80, {});
    expect(decisions).toEqual({ 'cabinet-1': 'accepted' });
    expect(reviewSummary(ITEMS, 80, decisions).accepted).toEqual({
      walls: 0,
      windows: 0,
      doors: 0,
      rooms: 0,
      fixtures: 1,
    });
  });

  it('Fit covers the cabinet outlines; By room keeps them in the no-room group', () => {
    expect(itemExtents(ITEMS)).toEqual({ minX: 200, minY: 276, maxX: 254, maxY: 300 });
    expect(roomGroups(ITEMS)).toEqual([{ room: null, items: ITEMS }]);
  });

  it('a cabinet inside a room goes with that room', () => {
    const room: ReviewItem = {
      id: 'room-1',
      type: 'room',
      number: 1,
      confidence: 90,
      boundary: [
        { x: 180, y: 180 },
        { x: 300, y: 180 },
        { x: 300, y: 300 },
        { x: 180, y: 300 },
      ],
      closed: true,
      areaSqIn: 14400,
    };
    expect(roomGroups([room, B24])).toEqual([{ room, items: [room, B24] }]);
  });

  it('the status bar source reads Supplier PDF for a supplier PDF import', () => {
    expect(sourceLine([{ name: 'kitchen.pdf', kind: 'supplier_pdf' }])).toBe('Supplier PDF');
  });
});
