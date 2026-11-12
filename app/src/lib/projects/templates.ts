// EZD-221a Build step 3 (vault/plans/EZD-221a.md Decided "Template values (inches)", "TEMPLATE_SIZE_MAX_IN",
// "isTemplateSize", "templateAreaSqFt"; Q-0565; Q-0570; Q-0207; Q-0559): the blank templates, their sizes and
// checks, shared by the browser and the server. No React, zod, Supabase or @ezdraft/geometry.
export const TEMPLATE_KEYS = ['galley_kitchen', 'l_kitchen', 'bath_5x8', 'primary_bath'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_DEFAULTS: Readonly<Record<TemplateKey, { width: number; length: number }>> = {
  galley_kitchen: { width: 96, length: 168 },
  l_kitchen: { width: 141.5, length: 168 },
  bath_5x8: { width: 60, length: 96 },
  primary_bath: { width: 120, length: 144 },
};

export const DEFAULT_CEILING_HEIGHT_IN = 96;

// Equal to MAX_WALL_LENGTH_IN of @ezdraft/geometry (EZD-201); a literal so this module stays geometry-free.
export const TEMPLATE_SIZE_MAX_IN = 2400;

export const TEMPLATE_ROOM_NAMES: Readonly<Record<TemplateKey, string>> = {
  galley_kitchen: 'Galley kitchen',
  l_kitchen: 'L-kitchen',
  bath_5x8: '5x8 bath',
  primary_bath: 'Primary bath',
};

export type TemplateBody = {
  key: TemplateKey;
  width: number;
  length: number;
  ceilingHeight: number;
};

export function isTemplateSize(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n > 0 &&
    n <= TEMPLATE_SIZE_MAX_IN &&
    Number.isInteger(n * 16)
  );
}

// Whole square feet, halves up, in integer sixteenths: W × L / 144 with 16² × 144 = 36864.
export function templateAreaSqFt(width: number, length: number): number {
  const w16 = Math.round(width * 16);
  const l16 = Math.round(length * 16);
  return Math.floor((2 * w16 * l16 + 36864) / 73728);
}
