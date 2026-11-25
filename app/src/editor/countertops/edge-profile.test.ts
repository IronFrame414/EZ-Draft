// EZD-417 (S04b Controls "Edge profile card | Pick profile from library ... | Applied to exposed edges only", "Edge
// profile status pill | Shows Open, Chosen states"; S04b States "Edge profile open (client choosing), chosen, or not
// offered"; AC-EZD-417-1). Hand counts on the board's three tops (test-fixture.ts boardPiecesModel): A "Back wall"
// has one exposed edge, its front, 141.5 − 25.5 = 116"; its other edges are wall edges and the seam. C "Island"
// 76 1/2 × 37 1/2 has all four sides exposed, 228" = 19 LF.
import { describe, expect, it } from 'vitest';
import { edgeOfferTotal } from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import { modelObjects } from '../cabinets/cabinet-view';
import { countertopPieces } from './trace-tool';
import { boardPiecesModel, CT_FLOOR, ctId } from './test-fixture';
import { edgeOfferPillState, edgeOfferState, edgeProfileChanges, offerFor, type EdgeOffer } from './edge-profile';

const EASED = 'f0000000-0000-4000-8000-000000000001';
const OGEE = 'f0000000-0000-4000-8000-000000000005';
const A = ctId(301);
const B = ctId(302);
const C = ctId(303);

const setup = () => {
  const store = createModelStore({ objects: boardPiecesModel() });
  const pieces = () => countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
  return { store, pieces };
};

describe('EZD-417 edge profile on a top', () => {
  it('puts the profile on the exposed edges only, one undo step', () => {
    const { store, pieces } = setup();
    const changes = edgeProfileChanges(pieces(), A, OGEE);
    expect(changes).toHaveLength(1);
    store.applyEdit(changes);
    const a = pieces().find((p) => p.id === A)!;
    expect(a.data.attributes.edges.map((e) => [e.kind, e.seamId !== undefined, e.profileId])).toEqual([
      ['wall', false, null],
      ['wall', false, null],
      ['exposed', false, OGEE],
      ['wall', true, null],
      ['wall', false, null],
    ]);
    // The other tops are untouched.
    for (const id of [B, C])
      expect(pieces().find((p) => p.id === id)!.data.attributes.edges.every((e) => e.profileId === null)).toBe(true);
    store.undo();
    expect(pieces().find((p) => p.id === A)!.data.attributes.edges.every((e) => e.profileId === null)).toBe(true);
  });

  it('is no change when the top already carries that profile, or is not shown', () => {
    const { store, pieces } = setup();
    store.applyEdit(edgeProfileChanges(pieces(), C, EASED));
    expect(edgeProfileChanges(pieces(), C, EASED)).toEqual([]);
    expect(edgeProfileChanges(pieces(), C, OGEE)).toHaveLength(1);
    expect(edgeProfileChanges(pieces(), ctId(999), OGEE)).toEqual([]);
  });

  it('AC-EZD-417-1 the offered totals on the board tops are rate × exposed LF', () => {
    const { pieces } = setup();
    const byId = (id: string) => pieces().find((p) => p.id === id)!.data;
    // C: 12 × 19 = 228.00; A: 10 × 116 / 12 = 96.666… → 96.67; B: 8 × (63 + 25.5) / 12 = 59.00.
    expect(edgeOfferTotal(12, byId(C))).toBe(228);
    expect(edgeOfferTotal(10, byId(A))).toBe(96.67);
    expect(edgeOfferTotal(8, byId(B))).toBe(59);
  });
});

describe('EZD-417 edge offer states', () => {
  const offer = (pieceId: string, status: 'open' | 'chosen'): EdgeOffer => ({
    id: `o-${pieceId}`,
    pieceId,
    status,
    choices: [{ profileId: EASED }],
  });

  it('a top is not offered, open (client choosing) or chosen', () => {
    expect(edgeOfferState(null)).toBe('not_offered');
    expect(edgeOfferState(offer(C, 'open'))).toBe('open');
    expect(edgeOfferState(offer(C, 'chosen'))).toBe('chosen');
    expect(offerFor([offer(C, 'open')], C.toUpperCase())?.pieceId).toBe(C);
    expect(offerFor(null, C)).toBeNull();
  });

  it("the pill shows the selected top's state, else open before chosen before not offered", () => {
    const offers = [offer(A, 'chosen'), offer(C, 'open')];
    expect(edgeOfferPillState(offers, [A, B, C], B)).toBe('not_offered');
    expect(edgeOfferPillState(offers, [A, B, C], A)).toBe('chosen');
    expect(edgeOfferPillState(offers, [A, B, C], null)).toBe('open');
    expect(edgeOfferPillState([offer(A, 'chosen')], [A, B, C], null)).toBe('chosen');
    expect(edgeOfferPillState(null, [A, B, C], null)).toBe('not_offered');
  });
});
