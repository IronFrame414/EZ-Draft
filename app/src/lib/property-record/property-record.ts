// EZD-711 (S01 Property appraiser link "Paste link; app reads parcel number, owner, legal description, year built,
// living area; user confirms each field ... Year built before 1978 sets the lead flag"; 03c property_record; S13
// Controls; AC-EZD-711-1, -2): the five fields an appraiser page gives, the lead flag rule and the confirmed-fields
// body the browser sends. Pure: browser and server.
import { z } from 'zod';

// Board S01bWizard order: Parcel (PCN), Owner, Legal description, Year built, Living area.
export const PROPERTY_FIELDS = ['parcelNo', 'owner', 'legalDescription', 'yearBuilt', 'livingArea'] as const;
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
  return typeof yearBuilt === 'number' && Number.isInteger(yearBuilt) && yearBuilt < LEAD_FLAG_BEFORE_YEAR;
}

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max))
    .transform((s) => (s === '' ? null : s))
    .nullable();

// A value as read (AI output) or as confirmed: every field may be missing.
export const propertyFieldsSchema = z.object({
  parcelNo: text(PARCEL_NO_MAX),
  owner: text(OWNER_MAX),
  legalDescription: text(LEGAL_DESCRIPTION_MAX),
  yearBuilt: z.number().int().min(YEAR_BUILT_MIN).max(YEAR_BUILT_MAX).nullable(),
  livingArea: z.number().int().min(0).max(LIVING_AREA_MAX).nullable(),
});

// The body that saves a project's record: only the confirmed fields, the rest null (S01 "user confirms each field").
export const confirmedRecordSchema = z
  .object({
    fields: propertyFieldsSchema,
    sourceUrl: z.string().trim().max(SOURCE_URL_MAX).nullable(),
  })
  .strict();
export type ConfirmedRecord = z.infer<typeof confirmedRecordSchema>;

// Keeps only the ticked fields; an unticked field is saved as blank.
export function confirmedFields(read: PropertyFields, ticked: ReadonlySet<PropertyField>): PropertyFields {
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

// What a read job answers: the fields read, or that the page could not be read (S01 "On read failure, offer
// 'Paste page text' or 'Paste screenshot'").
export const appraiserReadOutputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('read'), fields: propertyFieldsSchema }),
  z.object({ status: z.literal('unreadable') }),
]);
export type AppraiserReadOutput = z.infer<typeof appraiserReadOutputSchema>;

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
