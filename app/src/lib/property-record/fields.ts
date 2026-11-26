// EZD-711 (S01 Property appraiser link; 03c property_record): the five fields an appraiser page gives, their
// limits, the lead flag rule and the helpers the screens use. No zod here: the browser screens import this file, so
// the Projects page downloads no schema library for it (the same rule as lib/notifications/kinds.ts, EZD-332). The
// zod schemas are in property-record.ts, which also re-exports everything here.

// Board S01bWizard order: Parcel (PCN), Owner, Legal description, Year built, Living area.
export const PROPERTY_FIELDS = [
  'parcelNo',
  'owner',
  'legalDescription',
  'yearBuilt',
  'livingArea',
] as const;
export type PropertyField = (typeof PROPERTY_FIELDS)[number];

export type PropertyFields = {
  parcelNo: string | null;
  owner: string | null;
  legalDescription: string | null;
  yearBuilt: number | null;
  livingArea: number | null;
};

export const EMPTY_PROPERTY_FIELDS: PropertyFields = {
  parcelNo: null,
  owner: null,
  legalDescription: null,
  yearBuilt: null,
  livingArea: null,
};

// The column limits of property_record (migration 20261122140000_create_property_record.sql).
export const PARCEL_NO_MAX = 64;
export const OWNER_MAX = 300;
export const LEGAL_DESCRIPTION_MAX = 4000;
export const SOURCE_URL_MAX = 2048;
export const YEAR_BUILT_MIN = 1600;
export const YEAR_BUILT_MAX = 2200;
export const LIVING_AREA_MAX = 2_147_483_647;

// The pre-1978 lead rule (S01; vault/build/assumptions.md EZD-711 "What sets the lead flag means"): a year built
// before 1978 sets it; 1978 or later, or no year, leaves it off.
export const LEAD_FLAG_BEFORE_YEAR = 1978;

export function isPre1978(yearBuilt: number | null | undefined): boolean {
  return (
    typeof yearBuilt === 'number' &&
    Number.isInteger(yearBuilt) &&
    yearBuilt < LEAD_FLAG_BEFORE_YEAR
  );
}

// Keeps only the ticked fields; an unticked field is saved as blank.
export function confirmedFields(
  read: PropertyFields,
  ticked: ReadonlySet<PropertyField>,
): PropertyFields {
  return {
    parcelNo: ticked.has('parcelNo') ? read.parcelNo : null,
    owner: ticked.has('owner') ? read.owner : null,
    legalDescription: ticked.has('legalDescription') ? read.legalDescription : null,
    yearBuilt: ticked.has('yearBuilt') ? read.yearBuilt : null,
    livingArea: ticked.has('livingArea') ? read.livingArea : null,
  };
}

export function confirmedNames(fields: PropertyFields): PropertyField[] {
  return PROPERTY_FIELDS.filter((f) => fields[f] !== null);
}

// Pasted page text rides in the job payload (16 KB limit, server/jobs/payload-limit.ts), so it is capped in bytes.
export const PASTED_TEXT_MAX_BYTES = 12_000;

// Screenshots: the image types Claude reads, up to 5 MB.
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number];
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

// The project's record as the API sends it.
export type ProjectPropertyRecord = {
  fields: PropertyFields;
  sourceUrl: string | null;
  leadFlag: boolean;
};
