// EZD-610 (S06 Selected circuit block "voltage drop ... Voltage drop shows a warning above the threshold in settings";
// 09b E-17 and "Voltage drop formula"; code-rules.json "Conductor area (circular mils) for voltage drop"; vault/build/
// assumptions/EZD-610.md Settled): the voltage drop of a branch circuit, its warning and the wire-size suggestion.
// Single-phase drop in volts = 2 x K x I x L / CM; percent = volts / circuit volts x 100. Pure.
import type { WireMaterial, WireSize } from '../schema/electrical';

/** 09b: K in ohm-circular mils per foot. */
export const WIRE_K: Readonly<Record<WireMaterial, number>> = { copper: 12.9, aluminum: 21.2 };

/** Circular mils by AWG size: 09b for 14 to 6, the code-rules.json conductor-area check for the larger sizes. */
export const CIRCULAR_MILS: Readonly<Record<WireSize, number>> = {
  '14': 4110,
  '12': 6530,
  '10': 10380,
  '8': 16510,
  '6': 26240,
  '4': 41740,
  '3': 52620,
  '2': 66360,
  '1': 83690,
  '1/0': 105600,
  '2/0': 133100,
  '3/0': 167800,
  '4/0': 211600,
};

/** The sizes 09b lists, smallest first: the sizes the suggestion may name. */
export const SUGGESTED_WIRE_SIZES: readonly WireSize[] = ['14', '12', '10', '8', '6'];

export type VoltageDropInput = {
  wire: WireSize;
  material: WireMaterial;
  /** The current in amps (I). */
  amps: number;
  /** One-way run length in feet (L). */
  runFt: number;
  /** Circuit voltage, 120 or 240. */
  volts: number;
};

export type VoltageDrop = { volts: number; percent: number };

export function voltageDrop(i: VoltageDropInput): VoltageDrop {
  const volts = (2 * WIRE_K[i.material] * i.amps * i.runFt) / CIRCULAR_MILS[i.wire];
  return { volts, percent: (volts / i.volts) * 100 };
}

/** 09b I: 80% of the breaker for a general circuit (16 A on a 20 A breaker). */
export function generalCircuitAmps(breaker: number): number {
  return breaker * 0.8;
}

/** Warns only when the unrounded percent is strictly above the threshold; never while the threshold is Not set. */
export function voltageDropWarns(percent: number, threshold: number | null): boolean {
  return threshold !== null && percent > threshold;
}

/**
 * The smallest 09b size larger than the circuit's wire that brings the drop to or under the threshold; null when no
 * listed size does (the text is then "Shorten the run.").
 */
export function suggestWireSize(i: VoltageDropInput, threshold: number): WireSize | null {
  const cm = CIRCULAR_MILS[i.wire];
  for (const size of SUGGESTED_WIRE_SIZES) {
    if (CIRCULAR_MILS[size] <= cm) continue;
    if (voltageDrop({ ...i, wire: size }).percent <= threshold) return size;
  }
  return null;
}
