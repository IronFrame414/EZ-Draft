// EZD-5605 test values: small stored objects with the fields the Accept and Adjust code reads (type, attributes
// number and kind, an opening's host wall). Test-only.
import type { ObjectValue } from '../../lib/outbox/model-api';

export const W = '00000000-0000-4000-8000-0000000000a1';
export const D = '00000000-0000-4000-8000-0000000000d1';
export const R = '00000000-0000-4000-8000-0000000000e1';
export const X = '00000000-0000-4000-8000-0000000000f1';
export const F = '00000000-0000-4000-8000-0000000000f0';

export const wall = (number: number, height = 96): ObjectValue => ({
  type: 'wall',
  schemaVersion: 1,
  data: { attributes: { number, height } },
});

export const door = (number: number, x = 72, host = W): ObjectValue => ({
  type: 'opening',
  schemaVersion: 1,
  data: { attributes: { kind: 'door', number }, geometry: { hostWallId: host, x } },
});

export const room = (name: string): ObjectValue => ({
  type: 'room',
  schemaVersion: 1,
  data: { attributes: { name } },
});

export const floor = (): ObjectValue => ({ type: 'floor', schemaVersion: 1, data: { name: 'F1' } });
