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
// EZD-606 (phase-06 EZD-606 "Existing panel fields on the panel object in model_json (brand, label photo), so every
// version carries its own panel"; S06 Controls "Existing panel ... Service size, main breaker, panel label photo (AI
// reads brand, rating, spaces; user confirms), existing circuit list ..., existing large appliances (range, dryer, AC,
// water heater)"; 03c panel "brand, label_photo_id"; vault/build/assumptions.md EZD-606): the panel gains its brand,
// its label photo (a panel_photo source_file, checked on save) and the existing large appliances, each with its
// rating in VA when known (null: the calc's default, EZD-614). The existing circuit list is the panel's circuits of
// status existing. All three optional, so every stored object stays valid and the version stays.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const CIRCUIT_PROTECTIONS = ['gfci', 'afci', 'dual'] as const;
export type CircuitProtection = (typeof CIRCUIT_PROTECTIONS)[number];
export const circuitProtectionSchema = z.enum(CIRCUIT_PROTECTIONS);

const amps = z.int().check(z.positive());

export const PANEL_BRAND_MAX = 80;

// S06 Controls "existing large appliances (range, dryer, AC, water heater)", each at most once.
export const EXISTING_APPLIANCE_KINDS = ['range', 'dryer', 'ac', 'water_heater'] as const;
export type ExistingApplianceKind = (typeof EXISTING_APPLIANCE_KINDS)[number];
export const existingApplianceSchema = z.strictObject({
  kind: z.enum(EXISTING_APPLIANCE_KINDS),
  va: z.nullable(z.int().check(z.positive())),
});
export type ExistingAppliance = z.infer<typeof existingApplianceSchema>;

export const panelDataSchema = z.strictObject({
  geometry: z.strictObject({ point: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    name: z.string().check(z.minLength(1)),
    parentPanel: z.nullable(z.uuid()),
    serviceSize: z.nullable(amps),
    mainBreaker: z.nullable(amps),
    spaces: z.nullable(z.int().check(z.positive())),
    brand: z.optional(z.nullable(z.string().check(z.minLength(1), z.maxLength(PANEL_BRAND_MAX)))),
    labelPhoto: z.optional(z.nullable(z.uuid())),
    appliances: z.optional(
      z.array(existingApplianceSchema).check(z.maxLength(EXISTING_APPLIANCE_KINDS.length)),
    ),
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
    space: z.int().check(z.positive()),
    poles: z.union([z.literal(1), z.literal(2)]),
    name: z.string(),
    breaker: amps,
    protection: z.nullable(circuitProtectionSchema),
    dedicated: z.boolean(),
    load: z.number().check(z.nonnegative()),
    wire: z.optional(wireSizeSchema),
    order: z.optional(z.array(z.uuid())),
  }),
});
export type CircuitData = z.infer<typeof circuitDataSchema>;
