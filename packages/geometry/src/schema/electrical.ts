// EZD-601 (S06 Layout "Left panel: ... panel header ("Panel A · 200A main") ...; circuit list; ... footer totals";
// S06 Data shown "Circuits (model object circuit): number (single or 2-pole e.g. "1-3"), name, breaker amps, poles,
// GFCI/AFCI/dual function, dedicated flag, ... VA" and "Panel: name, main breaker, service size, spaces total and
// used"; 03f Electrical "circuits, homeruns, switch legs, panel"; vault/build/assumptions.md EZD-601): the panel
// and circuit types, the fields the left panel reads. EZD-604 builds New circuit, rename and assign on them, and
// EZD-606 the existing panel fields; new types, so the version stays.
// - panel: placed at a point on a level; `parentPanel` null is the main panel, else the panel that feeds it.
//   `serviceSize` (amps) is the service the main panel is on; null on a subpanel.
// - circuit: on `panel`, from space `space`; a 2-pole circuit also takes space + 2 (numbered "1-3"). `load` is its
//   connected VA. Its level is its panel's level; it has no geometry of its own (its devices carry the places).
// EZD-604 (phase-06 EZD-604 "Panel object in model_json (name, existing or new, parent panel for subpanels, service
// size, main breaker, spaces) with a default "Panel A""; "breaker, wire, name editable"; vault/build/assumptions.md
// EZD-604): a new panel's main breaker and spaces may be Not set (null), as its service size already could. A circuit
// gains its wire size (AWG; material is EZD-610's) and `order`, the devices in the order they were clicked onto it
// (the circuit line runs through them in this order). Both optional and the nullable fields only widen, so every
// stored object stays valid and the version stays.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const CIRCUIT_PROTECTIONS = ['gfci', 'afci', 'dual'] as const;
export type CircuitProtection = (typeof CIRCUIT_PROTECTIONS)[number];
export const circuitProtectionSchema = z.enum(CIRCUIT_PROTECTIONS);

const amps = z.number().int().positive();

export const panelDataSchema = z.strictObject({
  geometry: z.strictObject({ point: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    name: z.string().min(1),
    parentPanel: z.uuid().nullable(),
    serviceSize: amps.nullable(),
    mainBreaker: amps.nullable(),
    spaces: z.number().int().positive().nullable(),
  }),
});
export type PanelData = z.infer<typeof panelDataSchema>;

export const CIRCUIT_POLES = [1, 2] as const;

// EZD-604: copper and aluminum building-wire sizes, 14 AWG to 4/0 (09b gives 14 to 6; NE4-133 the larger ones).
export const WIRE_SIZES = [
  '14',
  '12',
  '10',
  '8',
  '6',
  '4',
  '3',
  '2',
  '1',
  '1/0',
  '2/0',
  '3/0',
  '4/0',
] as const;
export type WireSize = (typeof WIRE_SIZES)[number];
export const wireSizeSchema = z.enum(WIRE_SIZES);

export const circuitDataSchema = z.strictObject({
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    panel: z.uuid(),
    space: z.number().int().positive(),
    poles: z.union([z.literal(1), z.literal(2)]),
    name: z.string(),
    breaker: amps,
    protection: circuitProtectionSchema.nullable(),
    dedicated: z.boolean(),
    load: z.number().nonnegative(),
    wire: wireSizeSchema.optional(),
    order: z.array(z.uuid()).optional(),
  }),
});
export type CircuitData = z.infer<typeof circuitDataSchema>;
