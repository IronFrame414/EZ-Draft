// EZD-605 (S06 Controls "Device toolbar: Switch leg | Canvas toolbar | Draw a switch leg from switch to fixtures
// (dashed). | Same."; AC-EZD-605-1; vault/build/assumptions.md EZD-605): a click on a switch starts its leg and
// selects it with its lights; each later click on a light adds it as one undo step; a light clicked first gives the
// hint; a click off every device does nothing. Plan: room 0..240 x 0..180, zone Z on 0..120, S at (5, 90) on Z,
// L1 (60, 90) inside Z, L2 (180, 90) outside it.
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { MessageKey } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent } from '../plan/input';
import { baseObjects, F1, idSeq, roomValue, uid } from '../tools/test-utils/fixtures';
import { switchLegToolReceiver } from './switch-leg-tool';
import { switchLegOf } from './switch-legs';

const ROOM = uid(1);
const Z = uid(10);
const S = uid(20);
const L1 = uid(30);
const L2 = uid(31);

const pt = (x: number, y: number): Point => ({ x, y });
const v = (type: string, data: Record<string, unknown>): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});
const device = (at: Point, attributes: Record<string, unknown>) =>
  v('device', { geometry: { point: at }, status: 'new', level: F1, attributes });

function plan() {
  const o = baseObjects();
  o.set(ROOM, roomValue([pt(0, 0), pt(240, 0), pt(240, 180), pt(0, 180)], 'Kitchen', null));
  o.set(
    Z,
    v('switch_zone', {
      geometry: { roomId: ROOM, boundary: [pt(0, 0), pt(120, 0), pt(120, 180), pt(0, 180)] },
      status: 'new',
      level: F1,
      attributes: { dimmer: false },
    }),
  );
  o.set(S, device(pt(5, 90), { kind: 'switch_single', zone: Z }));
  o.set(L1, device(pt(60, 90), { kind: 'recessed_light' }));
  o.set(L2, device(pt(180, 90), { kind: 'recessed_light' }));
  return o;
}

const click = (x: number, y: number): PlanPointerEvent => ({
  kind: 'click',
  model: { x, y },
  screen: { x, y },
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

function setup() {
  const store = createModelStore({ objects: plan() });
  let edits = 0;
  const counted = {
    getState: store.getState,
    applyEdit: (c: Parameters<typeof store.applyEdit>[0]) => {
      edits++;
      return store.applyEdit(c);
    },
  };
  const at = new Map([
    ['5,90', S],
    ['60,90', L1],
    ['180,90', L2],
  ]);
  let selected: readonly string[] = [];
  const messages: MessageKey[] = [];
  const receive = switchLegToolReceiver({
    store: counted,
    pickAt: (p) => {
      const id = at.get(`${p.x},${p.y}`);
      return id === undefined ? [] : [id];
    },
    newStatus: () => 'new',
    newId: idSeq(500),
    select: (ids) => (selected = ids),
    onMessage: (k) => messages.push(k),
  });
  return { store, receive, selected: () => selected, messages, edits: () => edits };
}

describe('EZD-605 Switch leg tool', () => {
  it('a click on the switch selects it with its leg; a click on L2 adds it in one undo step', () => {
    const t = setup();
    t.receive(click(5, 90));
    expect(t.selected()).toEqual([S, L1]);
    expect(t.edits()).toBe(0);
    t.receive(click(180, 90));
    expect(t.edits()).toBe(1);
    expect(switchLegOf(t.store.getState().objects, S)!.fixtureIds).toEqual([L1, L2]);
    expect(t.selected()).toEqual([S, L1, L2]);
    t.store.undo();
    expect(switchLegOf(t.store.getState().objects, S)!.fixtureIds).toEqual([L1]);
  });

  it('a light clicked before any switch gives the hint and changes nothing', () => {
    const t = setup();
    t.receive(click(180, 90));
    expect(t.messages).toEqual(['office.electrical.leg.pick_switch']);
    expect(t.edits()).toBe(0);
  });

  it('a click off every device, or on a light already on the leg, changes nothing', () => {
    const t = setup();
    t.receive(click(5, 90));
    t.receive(click(400, 400));
    t.receive(click(60, 90));
    expect(t.edits()).toBe(0);
    expect(t.messages).toEqual([]);
  });
});
