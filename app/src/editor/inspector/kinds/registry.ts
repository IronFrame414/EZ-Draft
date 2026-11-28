// EZD-1915 (AC-EZD-1915-1; editor plan 2.5 "Inspector (right) branches, in order", 5.3 "inspector/kinds/"): every
// inspector kind, one file each. InspectorPanel shows the first whose `match` names an object, in `order`, which is
// the order of its branches before EZD-1915: room alone, pin, beam set, ACT grid, switching zone, device, engineer
// note, then wall / opening / bulk. A new object type adds its file here with an `order` between two others.
import type { InspectorKind } from './types';
import { kind as actGrid } from './act-grid';
import { kind as beam } from './beam';
import { kind as device } from './device';
import { kind as engineerNote } from './engineer-note';
import { kind as objects } from './objects';
import { kind as pin } from './pin';
import { kind as room } from './room';
import { kind as switchZone } from './switch-zone';

export const inspectorKinds: readonly InspectorKind[] = [
  actGrid,
  beam,
  device,
  engineerNote,
  objects,
  pin,
  room,
  switchZone,
].sort((a, b) => a.order - b.order);
