// EZD-234 Build (Q-0704 03-data-model row 2; 03f Existing-condition pins Rounds 1-2; phase-02.md EZD-229): the
// existing-detail types under the names later phases extend, so those phases only add enum values.
// - hvac: supply or return register (EZD-512 adds exhaust fan), a rectangle like a fixture.
//   EZD-731 (AC-EZD-731-1; phase-07 EZD-731; vault/research/R-012.md recommendation 5; Q-0763): the mechanical
//   equipment, air handler and condenser, join as kinds; added enum values only, so the version stays.
// - device: the electrical device type (EZD-507, 03f:13); phase 10 has the detectors only (R3-126).
// - access: attic hatch (EZD-507 adds access panel), a rectangle like a fixture.
// - soffit: a polygon; `dropHeight` is measured down from the room's ceiling height.
// - chase: a polygon.
// EZD-507 (S05 Controls "Recessed light", "Ceiling fan", "Smoke or CO detector", "Speaker or low voltage", "Access
// panel", "Fixture type tag edit"; 03f:13 "lights (type tag), fans, detectors, low voltage (... speakers, cameras,
// Wi-Fi APs)"; Q-0704 03-data-model row 2 "EZD-507 adds access_panel"): the ceiling devices join `device` as kinds,
// with the optional fixture type fields (type tag, lumens, color temperature, trim, catalog item); the access panel
// joins `access`. Added enum values and optional fields only, so every stored object stays valid and the version
// stays.
import { z } from 'zod';
import {
  levelSchema,
  objectStatusSchema,
  pointSchema,
  polygonSchema,
  unitVectorSchema,
} from './common';
import { circuitProtectionSchema } from './electrical';

const rectGeometry = z.strictObject({ center: pointSchema, axis: unitVectorSchema });

export const HVAC_KINDS = ['supply', 'return', 'air_handler', 'condenser'] as const;
export type HvacKind = (typeof HVAC_KINDS)[number];
export const hvacDataSchema = z.strictObject({
  geometry: rectGeometry,
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(HVAC_KINDS),
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
});
export type HvacData = z.infer<typeof hvacDataSchema>;

export const DEVICE_KINDS = [
  'smoke_detector',
  'co_detector',
  'smoke_co_detector',
  'recessed_light',
  'ceiling_fan',
  'speaker',
  'camera',
  'wifi_ap',
  // EZD-602 (S06 Controls "Device toolbar: Receptacle ... type (duplex, 240V)", "Switch: Places single, 3-way, dimmer
  // switches", "Low voltage: Places data, TV, doorbell, speakers"; 03f:13; vault/build/assumptions.md EZD-602): the
  // wall devices of the electrical plan, one kind per toolbar choice as EZD-507 split the detectors. Added enum
  // values only, so every stored object stays valid and the version stays.
  'receptacle_duplex',
  'receptacle_240v',
  'switch_single',
  'switch_3way',
  'switch_dimmer',
  'data',
  'tv',
  'doorbell',
] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
// EZD-507: the kinds that carry a fixture type (S05 "Fixture type tag edit ... on a light"; board S05Ceiling fixture
// schedule "A 4" can", "F Fan 52""; vault/build/assumptions.md EZD-507).
export const FIXTURE_TYPE_DEVICE_KINDS = [
  'recessed_light',
  'ceiling_fan',
] as const satisfies readonly DeviceKind[];
/** EZD-515: a fan with no blade span set reads as 52" (board S05Ceiling "F Fan 52""). */
export const DEFAULT_FAN_BLADE_SPAN_IN = 52;
export const deviceDataSchema = z.strictObject({
  geometry: z.strictObject({ point: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  // EZD-601 (S06 Devices tab "device type, circuit, GFCI/AFCI"; 03f "receptacles (GFCI/AFCI, height, circuit)"):
  // the circuit the device is on and its own protection, both optional so every stored device stays valid and the
  // version stays; absent reads as no circuit and no protection.
  attributes: z.strictObject({
    kind: z.enum(DEVICE_KINDS),
    circuit: z.uuid().nullable().optional(),
    protection: circuitProtectionSchema.nullable().optional(),
    // EZD-507: the fixture type; absent reads as not set. Color temperature is in kelvin.
    typeTag: z.string().trim().min(1).nullable().optional(),
    lumens: z.number().int().positive().nullable().optional(),
    colorTemp: z.number().int().positive().nullable().optional(),
    trim: z.string().trim().min(1).nullable().optional(),
    catalogItemId: z.uuid().nullable().optional(),
    // EZD-515 (S05 Validation "Ceiling fan blade clearance"; vault/build/assumptions.md EZD-515): a fan's blade span,
    // tip to tip, in inches; absent reads as DEFAULT_FAN_BLADE_SPAN_IN. Optional, so the version stays.
    bladeSpan: z.number().positive().nullable().optional(),
    // EZD-603 (S06 Controls "Device height note toggle ... Shows a height note (e.g. "MW +66"") on the plan for that
    // device. | Off by default."; R24 #36; 03f:13 "receptacles (GFCI/AFCI, height, circuit)"; vault/build/assumptions.md
    // EZD-603): the per-device note toggle (absent reads as off), the note's optional label ("MW") and the device's
    // height above the floor in inches (to its center). All optional, so every stored device stays valid and the
    // version stays.
    heightNote: z.boolean().optional(),
    heightLabel: z.string().trim().min(1).max(16).nullable().optional(),
    height: z.number().positive().nullable().optional(),
  }),
});
export type DeviceData = z.infer<typeof deviceDataSchema>;

export const ACCESS_KINDS = ['attic_hatch', 'access_panel'] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];
export const accessDataSchema = z.strictObject({
  geometry: rectGeometry,
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(ACCESS_KINDS),
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
});
export type AccessData = z.infer<typeof accessDataSchema>;

export const soffitDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: polygonSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({ dropHeight: z.number().positive() }),
});
export type SoffitData = z.infer<typeof soffitDataSchema>;

export const chaseDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: polygonSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({}),
});
export type ChaseData = z.infer<typeof chaseDataSchema>;

// EZD-510 (S05 Controls "Switching zones | Left panel, Lighting | Draws switching zones and dimmers on the RCP (dashed
// accent lines)"; S05 Data shown "Switching zones and dimmers"; vault/build/assumptions.md EZD-510 "Zone data"): a
// switching zone is a closed outline drawn by clicks on one room's ceiling, with a dimmer or not. The lights inside it
// are worked out from the outline, never stored (EZD-605 syncs them to switch legs). A new type, so the version stays.
export const switchZoneDataSchema = z.strictObject({
  geometry: z.strictObject({ roomId: z.uuid(), boundary: polygonSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({ dimmer: z.boolean() }),
});
export type SwitchZoneData = z.infer<typeof switchZoneDataSchema>;
