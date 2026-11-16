// EZD-218 AC-EZD-218-2, AC-EZD-218-3: the layer rules and the device-session layer store. Expected values from the
// spec, never the code: 00g "Layer" (a Phase row or Rooms, shown, hidden or locked), "Eye", "Layer lock"; S03 Controls
// — left panel (Phase rows show and hide Existing, Demo, New; a lock on each layer row limits what can be selected);
// 03 Q-0664 "View default" (eyes and locks belong to the device session and reset on reload); Q-0667 (Existing view
// shows Existing and Demo, hides New).
import type { ObjectStatus } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { eyeDefaults, type PhaseEyes } from '../../lib/plan/phase-view';
import {
  createLayerSetting,
  objectLayers,
  objectSelectable,
  objectVisible,
  type LayerLocks,
  type LayerPhase,
} from './layer-setting';

const ALL_ON: PhaseEyes = { existing: true, demo: true, new: true };
const UNLOCKED: LayerLocks = { existing: false, demo: false, new: false, rooms: false };

function fakePhase(): LayerPhase & { calls: Array<[ObjectStatus, boolean]> } {
  let eyes: PhaseEyes = eyeDefaults('existing');
  let version = 0;
  const listeners = new Set<() => void>();
  const calls: Array<[ObjectStatus, boolean]> = [];
  return {
    calls,
    get: () => ({ eyes }),
    version: () => version,
    setEye(status, on) {
      calls.push([status, on]);
      eyes = { ...eyes, [status]: on };
      version += 1;
      for (const l of [...listeners]) l();
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

describe('EZD-218 layer rules', () => {
  it('membership: an object is in its Phase layer; a room is also in Rooms; a floor in none', () => {
    expect(objectLayers('wall', 'existing')).toEqual(['existing']);
    expect(objectLayers('opening', 'demo')).toEqual(['demo']);
    expect(objectLayers('room', 'new')).toEqual(['new', 'rooms']);
    expect(objectLayers('floor', undefined)).toEqual([]);
  });

  it('AC-2 a room is drawn only when its Phase eye and the Rooms eye are both on', () => {
    expect(objectVisible(ALL_ON, true, 'room', 'existing')).toBe(true);
    expect(objectVisible(ALL_ON, false, 'room', 'existing')).toBe(false);
    expect(objectVisible({ ...ALL_ON, existing: false }, true, 'room', 'existing')).toBe(false);
    expect(objectVisible(ALL_ON, false, 'wall', 'existing')).toBe(true);
    expect(objectVisible({ ...ALL_ON, demo: false }, true, 'wall', 'demo')).toBe(false);
    expect(objectVisible({ ...ALL_ON, existing: false }, false, 'floor', undefined)).toBe(true);
  });

  it('AC-3 an object can be selected only when none of its layers is locked', () => {
    expect(objectSelectable(UNLOCKED, 'room', 'existing')).toBe(true);
    expect(objectSelectable({ ...UNLOCKED, rooms: true }, 'room', 'existing')).toBe(false);
    expect(objectSelectable({ ...UNLOCKED, existing: true }, 'room', 'existing')).toBe(false);
    expect(objectSelectable({ ...UNLOCKED, rooms: true }, 'wall', 'existing')).toBe(true);
    expect(objectSelectable({ ...UNLOCKED, new: true }, 'wall', 'new')).toBe(false);
    expect(objectSelectable({ ...UNLOCKED, new: true }, 'wall', 'existing')).toBe(true);
  });
});

describe('EZD-218 layer store', () => {
  it('AC-3 a new store opens with every eye from the view, Rooms shown and nothing locked', () => {
    const layers = createLayerSetting(fakePhase());
    expect(layers.get()).toEqual({ roomsEye: true, locks: UNLOCKED });
    expect(layers.eyes()).toEqual({ existing: true, demo: true, new: false });
  });

  it('AC-2 the Rooms eye hides rooms only; the Phase eyes are the phase setting’s', () => {
    const phase = fakePhase();
    const layers = createLayerSetting(phase);
    let told = 0;
    layers.subscribe(() => (told += 1));
    const v0 = layers.version();
    layers.setRoomsEye(false);
    expect(told).toBe(1);
    expect(layers.version()).not.toBe(v0);
    expect(layers.shownObject?.('room', 'existing')).toBe(false);
    expect(layers.shownObject?.('wall', 'existing')).toBe(true);
    const v1 = layers.version();
    layers.setEye('new', true);
    expect(phase.calls).toEqual([['new', true]]);
    expect(told).toBe(2);
    expect(layers.version()).not.toBe(v1);
    expect(layers.shown('new')).toBe(true);
    layers.setRoomsEye(false);
    expect(told).toBe(2);
  });

  it('AC-3 locks filter what selection reads, not what is drawn', () => {
    const layers = createLayerSetting(fakePhase());
    layers.setLock('rooms', true);
    expect(layers.get().locks.rooms).toBe(true);
    expect(layers.shownObject?.('room', 'existing')).toBe(true);
    expect(layers.selectable.shownObject?.('room', 'existing')).toBe(false);
    expect(layers.selectable.shownObject?.('wall', 'existing')).toBe(true);
    layers.setLock('existing', true);
    expect(layers.selectable.shown('existing')).toBe(false);
    expect(layers.selectable.shown('demo')).toBe(true);
    expect(layers.selectable.version()).toBe(layers.version());
  });
});
