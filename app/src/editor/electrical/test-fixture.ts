// EZD-601 AC-EZD-601-1 fixture: a model holding a panel, circuits and seeded devices. The panel and the eight
// circuits are board S06Electrical's left panel, typed by hand: "Panel A · 200A main"; 12 Small appl. 1 (20A · GFCI,
// 1500), 14 Small appl. 2 (20A · GFCI, 1500), 16 Refrigerator (20A · dedicated, 720), 18 Dishwasher (20A · GFCI ·
// ded., 1200), 20 Disposal (20A · GFCI · ded., 960), 22 Microwave, OTR (20A · dedicated, 1500), 1-3 Range (50A ·
// 2-pole, 12000), 24 Kitchen lighting (15A · AFCI, 171). Devices stand in two rooms and one outside every room.
import { CURRENT_SCHEMA_VERSION, type CircuitData, type Point } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { baseObjects, F1, roomValue, uid } from '../tools/test-utils/fixtures';

export const PANEL_A = uid(100);
export const SUBPANEL_B = uid(101);
export const KITCHEN = uid(1);
export const FAMILY = uid(2);

const pt = (x: number, y: number): Point => ({ x, y });
const rect = (x: number, y: number, w: number, h: number) => [
  pt(x, y),
  pt(x + w, y),
  pt(x + w, y + h),
  pt(x, y + h),
];

const v = (type: string, data: Record<string, unknown>): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});

export function panelValue(name: string, mainBreaker: number, parentPanel: string | null) {
  return v('panel', {
    geometry: { point: pt(5, 5) },
    status: 'existing',
    level: F1,
    attributes: {
      name,
      parentPanel,
      serviceSize: parentPanel === null ? 200 : null,
      mainBreaker,
      spaces: 40,
    },
  });
}

type C = CircuitData['attributes'];
export function circuitValue(a: Omit<C, 'panel'> & { panel?: string }) {
  return v('circuit', { status: 'new', level: F1, attributes: { panel: PANEL_A, ...a } });
}

export function deviceValue(
  at: Point,
  kind: string,
  circuit?: string | null,
  protection?: string | null,
) {
  const attributes: Record<string, unknown> = { kind };
  if (circuit !== undefined) attributes.circuit = circuit;
  if (protection !== undefined) attributes.protection = protection;
  return v('device', { geometry: { point: at }, status: 'new', level: F1, attributes });
}

// Stored out of space order on purpose; the list orders by space.
export const BOARD_CIRCUITS: readonly (readonly [number, Omit<C, 'panel'>])[] = [
  [
    212,
    {
      space: 24,
      poles: 1,
      name: 'Kitchen lighting',
      breaker: 15,
      protection: 'afci',
      dedicated: false,
      load: 171,
    },
  ],
  [
    201,
    {
      space: 12,
      poles: 1,
      name: 'Small appl. 1',
      breaker: 20,
      protection: 'gfci',
      dedicated: false,
      load: 1500,
    },
  ],
  [
    202,
    {
      space: 14,
      poles: 1,
      name: 'Small appl. 2',
      breaker: 20,
      protection: 'gfci',
      dedicated: false,
      load: 1500,
    },
  ],
  [
    203,
    {
      space: 16,
      poles: 1,
      name: 'Refrigerator',
      breaker: 20,
      protection: null,
      dedicated: true,
      load: 720,
    },
  ],
  [
    204,
    {
      space: 18,
      poles: 1,
      name: 'Dishwasher',
      breaker: 20,
      protection: 'gfci',
      dedicated: true,
      load: 1200,
    },
  ],
  [
    205,
    {
      space: 20,
      poles: 1,
      name: 'Disposal',
      breaker: 20,
      protection: 'gfci',
      dedicated: true,
      load: 960,
    },
  ],
  [
    206,
    {
      space: 22,
      poles: 1,
      name: 'Microwave, OTR',
      breaker: 20,
      protection: null,
      dedicated: true,
      load: 1500,
    },
  ],
  [
    207,
    {
      space: 1,
      poles: 2,
      name: 'Range',
      breaker: 50,
      protection: null,
      dedicated: true,
      load: 12000,
    },
  ],
];

/** The AC model: Panel A with the board's eight circuits, a subpanel with one, and five devices. */
export function electricalObjects(o: { subpanel?: boolean } = {}): Map<string, ObjectValue> {
  const objects = baseObjects();
  objects.set(KITCHEN, roomValue(rect(0, 0, 141.5, 168), 'Kitchen', null));
  objects.set(FAMILY, roomValue(rect(141.5, 0, 200, 168), 'Family room', null));
  objects.set(PANEL_A, panelValue('Panel A', 200, null));
  for (const [n, a] of BOARD_CIRCUITS) objects.set(uid(n), circuitValue(a));
  if (o.subpanel === true) {
    objects.set(SUBPANEL_B, panelValue('Panel B', 100, PANEL_A));
    objects.set(
      uid(220),
      circuitValue({
        panel: SUBPANEL_B,
        space: 1,
        poles: 1,
        name: 'Garage',
        breaker: 20,
        protection: 'gfci',
        dedicated: false,
        load: 1500,
      }),
    );
  }
  // Kitchen: a smoke/CO detector on circuit 24 (AFCI from its circuit) and a smoke detector on 14 with its own GFCI.
  objects.set(uid(301), deviceValue(pt(70, 80), 'smoke_co_detector', uid(212)));
  objects.set(uid(302), deviceValue(pt(30, 30), 'smoke_detector', uid(202), 'gfci'));
  // Family room: a CO detector on no circuit (stored before the circuit fields existed).
  objects.set(uid(303), deviceValue(pt(250, 80), 'co_detector'));
  // Outside every room.
  objects.set(uid(304), deviceValue(pt(500, 500), 'smoke_detector', null, null));
  return objects;
}
